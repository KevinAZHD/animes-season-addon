import nameToImdb, { TitleType } from "name-to-imdb";
import { Season } from "./query";

// Resolves IMDb IDs by searching names and metadata
export class Imdb {
    // Queries IMDb database using name-to-imdb utility
    static async getIdFromName(name: string, year?: number, type?: TitleType) {
        return await new Promise((res, err) => nameToImdb(
            { name: name, year: year, type: type },
            (err1: Error | null, res1: string | null | undefined) => err1 ? err(err1) : res(res1)
        ));
    }
}

// Queries the official MyAnimeList API for seasonal anime data
export class MalOfficial {
    private baseUrl = 'https://api.myanimelist.net/v2';

    async fetchSeasonAll(year: number, season: Season, limit: number = 100): Promise<any[]> {
        const clientId = process.env.MAL_CLIENT_ID;
        if (!clientId) {
            throw new Error("MAL_CLIENT_ID is required");
        }
        const seasonStr = season.toLowerCase();
        const fields = "id,title,main_picture,synopsis,genres,media_type,num_list_users,start_season";
        const url = `${this.baseUrl}/anime/season/${year}/${seasonStr}?sort=anime_num_list_users&limit=${limit}&fields=${fields}`;
        const response = await fetch(url, {
            headers: {
                "X-MAL-CLIENT-ID": clientId
            }
        });
        if (!response.ok) {
            if (response.status === 404) return [];
            throw new Error(`MyAnimeList API error: ${response.status} ${response.statusText}`);
        }
        const json = await response.json();
        return (json?.data || [])
            .map((entry: any) => entry?.node)
            .filter((anime: any) => this.isSeasonPremiere(anime, year, season))
            .slice(0, 50)
            .map((anime: any) => this.toCatalogAnime(anime));
    }

    // Keeps only anime whose first listed season matches the requested season.
    private isSeasonPremiere(anime: any, year: number, season: Season): boolean {
        const startSeason = anime?.start_season;
        if (!startSeason) return true;
        return startSeason.year === year && String(startSeason.season).toUpperCase() === season;
    }

    private toCatalogAnime(anime: any): any {
        const picture = anime?.main_picture || {};
        return {
            mal_id: anime.id,
            title: anime.title,
            type: anime.media_type === "movie" ? "Movie" : "TV",
            members: anime.num_list_users || 0,
            synopsis: anime.synopsis,
            genres: anime.genres || [],
            themes: [],
            images: {
                jpg: {
                    large_image_url: picture.large,
                    image_url: picture.medium
                },
                webp: {
                    large_image_url: picture.large
                }
            }
        };
    }
}

// Queries AniList for romaji titles and higher-resolution cover images.
export class AnilistMetadata {
    private url = 'https://graphql.anilist.co';

    // Fetches seasonal anime list from AniList, returns data in MAL-compatible format
    async fetchSeasonAnime(year: number, season: Season): Promise<any[]> {
        const query = `query ($season: MediaSeason, $year: Int) {
            Page(perPage: 50, page: 1) {
                media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC) {
                    idMal
                    title { romaji }
                    coverImage { extraLarge large medium }
                    format
                    popularity
                    description(asHtml: false)
                    genres
                }
            }
        }`;
        const response = await fetch(this.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables: { season: season, year } })
        });
        if (!response.ok) return [];
        const json = await response.json();
        return (json?.data?.Page?.media || [])
            .filter((m: any) => m?.idMal)
            .slice(0, 50)
            .map((m: any) => ({
                mal_id: m.idMal,
                title: m.title?.romaji,
                type: m.format === "MOVIE" ? "Movie" : "TV",
                members: m.popularity || 0,
                synopsis: m.description,
                genres: (m.genres || []).map((g: string) => ({ name: g })),
                themes: [],
                images: {
                    jpg: { large_image_url: m.coverImage?.extraLarge ?? m.coverImage?.large, image_url: m.coverImage?.medium },
                    webp: { large_image_url: m.coverImage?.extraLarge ?? m.coverImage?.large }
                }
            }));
    }

    async fetchByMalIds(malIds: number[]): Promise<Map<number, { title?: string, poster?: string }>> {
        if (malIds.length === 0) return new Map();

        const query = `query ($ids: [Int]) {
            Page(perPage: 50, page: 1) {
                media(idMal_in: $ids, type: ANIME) {
                    idMal
                    title {
                        romaji
                    }
                    coverImage {
                        extraLarge
                        large
                        medium
                    }
                }
            }
        }`;
        const response = await fetch(this.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ query, variables: { ids: malIds } })
        });
        if (!response.ok) {
            throw new Error(`AniList API error: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        const metadata = new Map<number, { title?: string, poster?: string }>();
        for (const media of json?.data?.Page?.media || []) {
            const poster = media?.coverImage?.extraLarge
                ?? media?.coverImage?.large
                ?? media?.coverImage?.medium;
            const title = media?.title?.romaji;
            if (media?.idMal && (title || poster)) {
                metadata.set(media.idMal, { title, poster });
            }
        }
        return metadata;
    }
}

// Enumeration of target and source media ID repositories
export enum IdSource {
    KITSU,
    IMDB,
    TMDB,
    MAL,
    ANILIST,
}

// Chain of responsibility node to translate external anime IDs
abstract class UrlResolver {
    protected next?: UrlResolver;

    // Registers the next resolver in the chain
    setNext(resolver: UrlResolver) {
        if (this.next) this.next.setNext(resolver);
        else this.next = resolver;
    }

    // Standard HTTP fetch helper returning parsed JSON response
    protected async fetch(source: IdSource, id: string) {
        const response = await fetch(this.getUrl(source, id));
        return response.json();
    }

    // Traverses the chain to resolve the target ID or calls the next handler
    async handle(source: IdSource, target: IdSource, id: string): Promise<any> {
        try {
            const response = await this.fetch(source, id);
            const result = this.getId(target, response);
            if (result) return result;
        } catch (error) {}
        return this.next?.handle(source, target, id);
    }

    // Gets URL query path for the specific metadata resolver
    protected abstract getUrl(source: IdSource, id: string): string;

    // Extracts translated ID string from resolution response JSON
    protected abstract getId(source: IdSource, id: any): string;
}

// Translates IDs using ARM/Yuna proxy api
class YunaUrlResolver extends UrlResolver {
    private readonly sources = ["kitsu", "imdb", "themoviedb", "myanimelist", "anilist"];

    // Returns the ARM/Yuna api query URL
    getUrl(source: IdSource, id: string): string {
        return `https://arm.haglund.dev/api/v2/ids?source=${this.sources[source.valueOf()]}&id=${id}&include=kitsu,imdb`;
    }

    // Extracts the requested ID from Yuna's response structure
    getId(source: IdSource, id: any) {
        return id[this.sources[source.valueOf()]];
    }
}

// Translates IDs using Kitsu's meta mappings
class KitsuUrlResolver extends UrlResolver {
    // Returns Kitsu meta mappings URL
    getUrl(source: IdSource, id: string): string {
        return `https://anime-kitsu.strem.fun/meta/anime/${IdSource[source.valueOf()].toLowerCase()}:${id}.json`;
    }

    // Extracts the requested ID from Kitsu's meta structure
    getId(source: IdSource, obj: any) {
        const meta = obj["meta"];
        switch (source) {
            case IdSource.KITSU:
                return meta["kitsu_id"];
            case IdSource.IMDB:
                return meta["imdb_id"];
            default:
                throw new Error("Invalid target id source");
        }
    }
}

// Resolves IMDb IDs by trying name combinations through name-to-imdb
class NameToImdbUrlResolver extends UrlResolver {
    constructor(
        private readonly name: string,
        private readonly year?: number,
        private readonly type?: TitleType,
        private readonly preprocessName?: (s: string) => string
    ) {
        super();
    }

    // Resolves and returns IMDb ID using name queries and backtracking fallbacks
    async handle(source: IdSource, target: IdSource, id: string): Promise<any> {
        let imdbId = await Imdb.getIdFromName(this.name, this.year, this.type);
        if (imdbId) return imdbId;
        let nextName = this.name;
        if (this.preprocessName) {
            nextName = this.preprocessName(this.name);
            imdbId = await Imdb.getIdFromName(nextName, this.year, this.type);
        }
        let maxRetry = nextName.match(/ /g)?.length ?? 0;
        while (!imdbId && maxRetry--) {
            nextName = nextName.substring(0, nextName.lastIndexOf(" "));
            if (nextName.trim().length === 0) break;
            imdbId = await Imdb.getIdFromName(nextName, this.year, this.type);
        }
        return imdbId ?? this.next?.handle(source, target, id);
    }

    // Unused method in name-to-imdb resolver node
    getUrl(source: IdSource, id: string): string {
        throw new Error("Not implemented");
    }

    // Unused method in name-to-imdb resolver node
    getId(source: IdSource, obj: any): string {
        throw new Error("Not implemented");
    }
}

// Core class orchestrating multiple URL translation chains
export class IdResolver {
    private urlResolver: UrlResolver;

    constructor(
        private readonly source: IdSource,
        private readonly id: string,
        private readonly name?: string,
        private readonly year?: number,
        private readonly type?: TitleType,
        private readonly preprocessName?: (s: string) => string
    ) {
        this.urlResolver = new YunaUrlResolver();
        this.urlResolver.setNext(new KitsuUrlResolver());
        if (this.name) {
            this.urlResolver.setNext(new NameToImdbUrlResolver(this.name, this.year, this.type, preprocessName));
        }
    }

    // Resolves and returns IMDb ID string
    async resolveImdb() {
        return await this.urlResolver.handle(this.source, IdSource.IMDB, this.id);
    }

    // Resolves and returns Kitsu ID string
    async resolveKitsu() {
        const id = await this.urlResolver.handle(this.source, IdSource.KITSU, this.id);
        if (id && !String(id).startsWith('tt')) {
            return `kitsu:${id}`;
        }
        return undefined;
    }
}
