import { TitleType } from "name-to-imdb";
import { promises as fs } from "fs";
import path from "path";
import { Season, Sorting, createSortedSeasonList, monthToSeason, query, seasonToSpanish } from "./query";
import { Anilist, IdResolver, IdSource, Imdb } from "./request";
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
export class Catalog {
    private metas: Meta[] = [];
    constructor(private pathFile: string) {}
        
    addMeta(meta: Meta) {
        this.metas.push(meta);
    }

    getMetas() : Meta[] {
        return this.metas;
    }

    sortByPopularity() {
        this.metas.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    }

    // Write metas to file
    async writeToFile() {
        const cleanedMetas = this.metas.map(({ popularity, originalType, ...rest }) => rest);
        await fs.writeFile(this.pathFile, JSON.stringify({metas: cleanedMetas.filter((m) => m?.id?.startsWith("tt") || m?.id?.startsWith("kitsu"))}, null, 2));
    }

    describe({genres, tags, description}: {genres: string[], tags: string[], description: string}) {
        let result = "Genres: " + genres.join(", ");
        const isSpoilerFree = (tag:any) => !tag.isMediaSpoiler && !tag.isGeneralSpoiler;
        result += "\nTags:" + tags.filter(isSpoilerFree).map(({name}:any) => name).join("/");
        result += description ? `\n${description}` : "";
        return result;
    }

    async populate(year:number, season:Season, type:TitleType) {
        const q = query(year, season, Sorting.POPULARITY_DESC, type);
        const anilist = new Anilist();
        const response = await anilist.fetch(q);
        const results = response?.data?.Page?.media;
        if (!results) return;
        for (const anime of results) {
            const originalName = anime.title.romaji ?? anime.title.english;
            let description = this.describe(anime);
            let fromAnilist = new IdResolver(IdSource.ANILIST, anime.id, originalName, anime.seasonYear, type, Stremio.removeSeasonDetails);
            let id = await fromAnilist.resolveKitsu();
            if (!id) {
                const imdbId = await fromAnilist.resolveImdb();
                id = imdbId;
            }
            const poster = anime.coverImage.extraLarge ?? anime.coverImage.large ?? anime.coverImage.medium ?? anime.bannerImage;
            switch (type) {
                case "movie":
                    this.addMeta({id,type: "anime",name:originalName,poster, behaviorHints:{defaultVideoId:id}, description, popularity: anime.popularity, originalType: type} as Meta);
                    break;
                default:
                    this.addMeta({id,type: "anime",name:originalName,poster, description, popularity: anime.popularity, originalType: type} as Meta);
            }
        }
    }
}
export type CatalogExtra = {
    name: string;
    options: string[];
    isRequired: boolean;
}
export type CatalogDescription = {
    id: string;
    type: string;
    name: string;
    extra: CatalogExtra[];
    extraSupported: string[];
}
enum CatalogType {
    LATEST = "latest",
    ARCHIVE = "archive"
}
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
export class Manifest implements AbstractManifest {
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
            if (catalog.id == "archive_anime_seasons") {
                catalog.extra[0].options = this.years;
            }
            else if (catalog.id == "latest_anime_seasons") {
                catalog.extra[0].options = this.seasons;
            }
        }
        await this.writeToFile();
    }

    // Write manifest to file
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

    getLastUpdate() : Date {
        return this.lastUpdatedAt;
    }
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
    ){
        if (catalogs.length == 0) {
            this.catalogs = [];
            this.seasons = Manifest.dateToSeasons(lastUpdatedAt);
            this.years = Manifest.dateToYears(lastUpdatedAt);
            // Default catalogs are now handled in Manifest.default
        }
        else {
            this.catalogs = catalogs;
            const latestCatalog = catalogs.find(catalog => catalog.id == "latest_anime_seasons");
            this.seasons = latestCatalog ? latestCatalog.extra[0].options as string[] : Manifest.dateToSeasons(lastUpdatedAt);
            const archiveCatalog = catalogs.find(catalog => catalog.id == "archive_anime_seasons");
            this.years = archiveCatalog ? archiveCatalog.extra[0].options as string[] : Manifest.dateToYears(lastUpdatedAt);
        }
    }
    static fromObject(pathFile: string, obj: AbstractManifest) : Manifest {
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
            obj?.lastUpdatedAt
        );
    }
    static default(pathFile: string) : Manifest {
        const today = new Date();
        const seasons = Manifest.dateToSeasons(today);
        return Manifest.fromObject(pathFile, {
            id: "animes-season-addon",
            version: "1.0.0",
            name: "Animes' Seasons",
            description: "Catálogos de anime por temporada con metadatos prioritarios de Kitsu",
            logo: "https://media.craiyon.com/2023-06-27/6664b575d60846fe878fc9d1e1f09d09.webp",
            resources: ["catalog"],
            types: ["anime"],
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
            idPrefixes: ["tt","kitsu"]
          } as AbstractManifest);
    }
    static async fromFile(filePath: string) : Promise<Manifest> {
        const manifest = await fs.readFile(filePath, "utf-8");
        const obj = JSON.parse(manifest);
        obj.lastUpdatedAt = new Date(obj.lastUpdatedAt);
        return Manifest.fromObject(filePath, obj);
    }
    getSeasons() : string[] {
        return this.seasons;
    }
    getYears() : string[] {
        return this.years;
    }
    private static dateToYears(today: Date) : string[] {
        const years = []
        for (let y = today.getFullYear(); y >= 2001; y--) {
            years.push(y.toString());
        }
        return years
    }
    private static dateToSeasons(today: Date) : string[] {
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
    private addCatalog(contentType: TitleType, catalogType: CatalogType) {
        this.catalogs.push({
            type: contentType,
            id: catalogType == CatalogType.LATEST ? "latest_anime_seasons" : "archive_anime_seasons",
            name: catalogType == CatalogType.LATEST ? "Anime Seasons" : "Anime Years",
            extra: [{ 
                name: "genre", 
                options: catalogType == CatalogType.LATEST ? this.seasons : this.years, 
                isRequired: catalogType === CatalogType.ARCHIVE}
            ],
            "extraSupported": ["genre"]
          });
    }
}
  


export class Stremio {
    private static baseDir = ".";
    static async createManifestIfNotExists(filePath: string) : Promise<Manifest> {
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
    static async createCatalogIfNotExists(filePath: string) : Promise<Catalog> {
        const dir = path.dirname(`${this.baseDir}/catalog/${filePath}`);
        try {
            await fs.stat(dir);
        } catch (error) {
            await fs.mkdir(dir, { recursive: true });
        }
        return new Catalog(`${this.baseDir}/catalog/${filePath}`);
    }
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
