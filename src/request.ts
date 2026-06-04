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

// Queries AniList's GraphQL endpoint
export class Anilist {
    private url = 'https://graphql.anilist.co';

    // Executes a raw GraphQL query against AniList API
    async fetch(query: string) {
        const response = await fetch(this.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ query })
        });
        return response.json();
    }
}

// Blocks execution for a specified amount of time to handle rate limits
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Queries Jikan API (MyAnimeList open API wrapper)
export class Jikan {
    private baseUrl = 'https://api.jikan.moe/v4';

    // Fetches a single page of seasonal anime data from Jikan
    async fetchSeason(year: number, season: Season, page: number = 1): Promise<any> {
        const seasonStr = season.toLowerCase();
        const url = `${this.baseUrl}/seasons/${year}/${seasonStr}?order_by=members&sort=desc&page=${page}&limit=25`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Jikan API error: ${response.status} ${response.statusText}`);
        }
        return response.json();
    }

    // Fetches multiple pages of seasonal anime data with rate limiting safety
    async fetchSeasonAll(year: number, season: Season, maxPages: number = 2): Promise<any[]> {
        const allData: any[] = [];
        for (let page = 1; page <= maxPages; page++) {
            const response = await this.fetchSeason(year, season, page);
            if (response?.data) {
                allData.push(...response.data);
            }
            const hasNext = response?.pagination?.has_next_page;
            if (!hasNext || page >= maxPages) break;
            await delay(400);
        }
        return allData;
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