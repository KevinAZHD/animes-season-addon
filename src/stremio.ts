import { TitleType } from "name-to-imdb";
import { promises as fs } from "fs";
import path from "path";
import { Season, createSortedSeasonList, monthToSeason, seasonToSpanish } from "./query";
import { AnilistMetadata, IdResolver, IdSource, MalOfficial } from "./request";

// Metadata structure for Stremio items
export type Meta = {
    id: string;
    type: string;
    name: string;
    poster: string;
    behaviorHints?: {
        defaultVideoId: string;
    }
    description?: string;
    popularity?: number;
    originalType?: TitleType;
}

// Catalog manager to hold metadata list and write output JSON
export class Catalog {
    private metas: Meta[] = [];
    constructor(private pathFile: string) { }

    // Appends a metadata item to the catalog list
    addMeta(meta: Meta) {
        this.metas.push(meta);
    }

    // Returns all stored metadata items
    getMetas(): Meta[] {
        return this.metas;
    }

    // Sorts the catalog metadata items by popularity (highest first)
    sortByPopularity() {
        this.metas.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    }

    // Filters and writes the clean metadata items to a JSON file
    async writeToFile() {
        const cleanedMetas = this.metas.map(({ popularity, originalType, ...rest }) => rest);
        const filtered = cleanedMetas.filter((m) => m?.id?.startsWith("tt") || m?.id?.startsWith("kitsu"));
        await fs.writeFile(this.pathFile, JSON.stringify({ metas: filtered }, null, 2));
    }

    // Formats description string using MAL genres, themes, and synopsis
    describeFromMAL(anime: any): string {
        let result = "Genres: " + (anime.genres || []).map((g: any) => g.name).join(", ");
        const themes = (anime.themes || []).map((t: any) => t.name);
        if (themes.length > 0) {
            result += "\nTags: " + themes.join("/");
        }
        result += anime.synopsis ? `\n${anime.synopsis}` : "";
        return result;
    }

    // Fetches seasonal anime from the official MAL API, resolves Stremio IDs, and populates catalog
    async populateFromMAL(year: number, season: Season) {
        const mal = new MalOfficial();
        console.log(`Fetching official MAL season data: ${season} ${year}`);
        let results = await mal.fetchSeasonAll(year, season);
        if (!results || results.length === 0) {
            console.log(`No MAL data for ${season} ${year}, trying AniList fallback`);
            results = await new AnilistMetadata().fetchSeasonAnime(year, season);
        }
        if (!results || results.length === 0) {
            console.log(`No results from any source for ${season} ${year}`);
            return;
        }

        const seen = new Set<number>();
        const uniqueResults = results.filter((anime: any) => {
            if (seen.has(anime.mal_id)) return false;
            seen.add(anime.mal_id);
            return true;
        });

        let anilistMetadata = new Map<number, { title?: string, poster?: string }>();
        try {
            console.log(`Fetching AniList metadata for ${uniqueResults.length} MAL IDs`);
            anilistMetadata = await new AnilistMetadata().fetchByMalIds(uniqueResults.map((anime: any) => anime.mal_id));
        } catch (error) {
            console.error("Failed to fetch AniList metadata, using MAL metadata:", error);
        }

        console.log(`Processing ${uniqueResults.length} anime for ${season} ${year}`);
        for (const anime of uniqueResults) {
            const malId = anime.mal_id.toString();
            const animeType = anime.type;
            const titleType: TitleType = animeType === "Movie" ? "movie" : "series";
            const members = anime.members || 0;

            const metadata = anilistMetadata.get(anime.mal_id);
            const originalName = metadata?.title ?? anime.title;
            const poster = metadata?.poster
                ?? anime.images?.jpg?.large_image_url
                ?? anime.images?.jpg?.image_url
                ?? anime.images?.webp?.large_image_url;
            const description = this.describeFromMAL(anime);
            const resolver = new IdResolver(IdSource.MAL, malId, originalName, year, titleType, Stremio.removeSeasonDetails);

            let id = await resolver.resolveKitsu();
            if (!id) {
                const imdbId = await resolver.resolveImdb();
                id = imdbId;
            }

            switch (titleType) {
                case "movie":
                    this.addMeta({ id, type: "movie", name: originalName, poster, behaviorHints: { defaultVideoId: id }, description, popularity: members, originalType: titleType } as Meta);
                    break;
                default:
                    this.addMeta({ id, type: "series", name: originalName, poster, description, popularity: members, originalType: titleType } as Meta);
            }
        }
    }
}

// Stremio extra option description schema
export type CatalogExtra = {
    name: string;
    options: string[];
    isRequired: boolean;
}

// Stremio catalog description schema
export type CatalogDescription = {
    id: string;
    type: string;
    name: string;
    extra: CatalogExtra[];
    extraSupported: string[];
}

// Catalog target categories
enum CatalogType {
    LATEST = "latest",
    ARCHIVE = "archive"
}

// Abstract properties of the manifest file
type AbstractManifest = {
    id: string;
    version: string;
    name: string;
    description: string;
    logo: string;
    resources: string[];
    types: string[];
    catalogs: CatalogDescription[];
    idPrefixes: string[];
    lastUpdatedAt?: Date;
}

// Manifest class managing the Stremio addon manifest descriptor file
export class Manifest implements AbstractManifest {
    private seasons: string[];
    private years: string[];

    constructor(
        private pathFile: string,
        public id: string,
        public version: string,
        public name: string,
        public description: string,
        public logo: string,
        public resources: string[],
        public types: string[],
        public idPrefixes: string[],
        public catalogs: CatalogDescription[],
        public lastUpdatedAt: Date = new Date(1970, 0, 1)
    ) {
        if (catalogs.length === 0) {
            this.catalogs = [];
            this.seasons = Manifest.dateToSeasons(lastUpdatedAt);
            this.years = Manifest.dateToYears(lastUpdatedAt);
        } else {
            this.catalogs = catalogs;
            const latestCatalog = catalogs.find(catalog => catalog.id === "latest_anime_seasons");
            this.seasons = latestCatalog ? latestCatalog.extra[0].options as string[] : Manifest.dateToSeasons(lastUpdatedAt);
            const archiveCatalog = catalogs.find(catalog => catalog.id === "archive_anime_seasons");
            this.years = archiveCatalog ? archiveCatalog.extra[0].options as string[] : Manifest.dateToYears(lastUpdatedAt);
        }
    }

    // Updates version number, seasons, years list, and writes output to file
    async update(today: Date) {
        this.lastUpdatedAt = today;
        const yy = today.getFullYear() % 100;
        const currentSeason = monthToSeason(today.getMonth());
        let sIdx = 1;
        if (currentSeason === Season.SPRING) sIdx = 2;
        else if (currentSeason === Season.SUMMER) sIdx = 3;
        else if (currentSeason === Season.FALL) sIdx = 4;
        this.version = `${yy}.${sIdx}.0`;
        this.years = Manifest.dateToYears(today);
        this.seasons = Manifest.dateToSeasons(today);
        for (const catalog of this.catalogs) {
            if (catalog.id === "archive_anime_seasons") {
                catalog.extra[0].options = this.years;
            } else if (catalog.id === "latest_anime_seasons") {
                catalog.extra[0].options = this.seasons;
            }
        }
        await this.writeToFile();
    }

    // Serializes and writes manifest json output file
    async writeToFile() {
        await fs.writeFile(this.pathFile, JSON.stringify({
            id: this.id,
            version: this.version,
            name: this.name,
            description: this.description,
            logo: this.logo,
            resources: this.resources,
            types: this.types,
            catalogs: this.catalogs,
            idPrefixes: this.idPrefixes,
            lastUpdatedAt: this.lastUpdatedAt,
        }, null, 2));
    }

    // Returns the timestamp of the last manifest update
    getLastUpdate(): Date {
        return this.lastUpdatedAt;
    }

    // Instantiates Manifest class from a generic object
    static fromObject(pathFile: string, obj: AbstractManifest): Manifest {
        return new Manifest(
            pathFile,
            obj.id,
            obj.version,
            obj.name,
            obj.description,
            obj.logo,
            obj.resources,
            obj.types,
            obj.idPrefixes,
            obj.catalogs,
            obj.lastUpdatedAt
        );
    }

    // Returns a default fallback Manifest instance
    static default(pathFile: string): Manifest {
        const today = new Date();
        const seasons = Manifest.dateToSeasons(today);
        return Manifest.fromObject(pathFile, {
            id: "animes-season-addon",
            version: "1.0.0",
            name: "Animes' Seasons",
            description: "Catálogos de animes por temporadas actualizadas.",
            logo: "https://kevinazhd.github.io/animes-season-addon/assets/logo.png",
            resources: ["catalog"],
            types: ["anime", "series", "movie"],
            catalogs: [
                {
                    type: "anime",
                    id: "latest_anime_seasons",
                    name: "⭐ Temporada Actual",
                    extra: [{
                        name: "genre",
                        options: seasons,
                        isRequired: false
                    }],
                    extraSupported: ["genre"]
                },
                {
                    type: "anime",
                    id: "next_anime_season",
                    name: "📅 Próxima Temporada",
                    extra: [],
                    extraSupported: []
                }
            ],
            idPrefixes: ["tt", "kitsu"]
        } as AbstractManifest);
    }

    // Asynchronously reads and parses manifest json file to instantiate Manifest class
    static async fromFile(filePath: string): Promise<Manifest> {
        const manifest = await fs.readFile(filePath, "utf-8");
        const obj = JSON.parse(manifest);
        obj.lastUpdatedAt = new Date(obj.lastUpdatedAt);
        return Manifest.fromObject(filePath, obj);
    }

    // Returns current list of seasons
    getSeasons(): string[] {
        return this.seasons;
    }

    // Returns current list of years
    getYears(): string[] {
        return this.years;
    }

    // Helper generating year list strings since 2001
    private static dateToYears(today: Date): string[] {
        const years = [];
        for (let y = today.getFullYear(); y >= 2001; y--) {
            years.push(y.toString());
        }
        return years;
    }

    // Helper returning spanish catalog season titles list
    private static dateToSeasons(today: Date): string[] {
        const currentMonth = today.getMonth();
        const currentSeason = monthToSeason(currentMonth);
        const sortedSeasons = createSortedSeasonList(currentSeason);
        const currentYear = today.getFullYear();
        const seasonOrder = [Season.WINTER, Season.SPRING, Season.SUMMER, Season.FALL];
        const currentSeasonIndex = seasonOrder.indexOf(currentSeason);

        return sortedSeasons.map(season => {
            const seasonIndex = seasonOrder.indexOf(season);
            const year = seasonIndex < currentSeasonIndex ? currentYear + 1 : currentYear;
            const spanishSeason = seasonToSpanish[season];
            return `${spanishSeason} ${year}`;
        });
    }

    // Appends a new catalog schema to manifest description list
    private addCatalog(contentType: TitleType, catalogType: CatalogType) {
        this.catalogs.push({
            type: contentType,
            id: catalogType === CatalogType.LATEST ? "latest_anime_seasons" : "archive_anime_seasons",
            name: catalogType === CatalogType.LATEST ? "Anime Seasons" : "Anime Years",
            extra: [{
                name: "genre",
                options: catalogType === CatalogType.LATEST ? this.seasons : this.years,
                isRequired: catalogType === CatalogType.ARCHIVE
            }],
            extraSupported: ["genre"]
        });
    }
}

// Addon coordination helper namespace
export class Stremio {
    private static baseDir = ".";

    // Instantiates manifest loader or creates file with default parameters
    static async createManifestIfNotExists(filePath: string): Promise<Manifest> {
        const manifestPath = `${this.baseDir}/${filePath}/manifest.json`;
        const dir = path.dirname(manifestPath);
        let manifest: Manifest;
        try {
            await fs.stat(dir);
            await fs.stat(manifestPath);
            manifest = await Manifest.fromFile(manifestPath);
            console.log(`Manifest found at ${manifestPath}`);
        } catch (error) {
            await fs.mkdir(dir, { recursive: true });
            manifest = Manifest.default(manifestPath);
            await manifest.writeToFile();
            console.log(`Manifest created at ${manifestPath}`);
        }
        return manifest;
    }

    // Ensures parent directory exists and returns instantiated Catalog helper
    static async createCatalogIfNotExists(filePath: string): Promise<Catalog> {
        const dir = path.dirname(`${this.baseDir}/catalog/${filePath}`);
        try {
            await fs.stat(dir);
        } catch (error) {
            await fs.mkdir(dir, { recursive: true });
        }
        return new Catalog(`${this.baseDir}/catalog/${filePath}`);
    }

    // Strips specific words or numerical year numbers from original title for fuzzy mapping
    static removeSeasonDetails(base: string): string {
        const stopWords = [
            "", ":", "season", "arc", "chapters", "chapter", "final", "1st", "2nd", "3rd", "1", "2", "3",
            "-", "–", "—", "’", "'", "special", "the", "part"
        ];
        for (let index = 4; index < 215; index++) {
            stopWords.push(`${index}`);
            stopWords.push(`${index}th`);
        }
        return base.toLowerCase().split(" ").map(word => word.trim()).filter(word => !stopWords.includes(word)).join(" ");
    }
}
