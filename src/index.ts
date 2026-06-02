import { Season, monthToSeason, getNextSeasonAndYear } from "./query";
import { Stremio } from "./stremio";
import { Patches } from "./patch";

async function main() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const manifest = await Stremio.createManifestIfNotExists(".");
    const promises = [];
    const patchCtl = new Patches();
    patchCtl.loadCatalogManualFixPatches();
    
    const titleType = "series";
    const defaultCatalog = await Stremio.createCatalogIfNotExists(`${titleType}/latest_anime_seasons.json`);
    for (const season of manifest.getSeasons()) {
        const [seasonName, seasonYearStr] = season.split(" ");
        const seasonYear = parseInt(seasonYearStr);
        
        console.log(`Generating catalog for season ${season} ${titleType}`);
        const catalog = await Stremio.createCatalogIfNotExists(`${titleType}/latest_anime_seasons/genre=${season}.json`);
        await catalog.populate(seasonYear, seasonName as Season, "series");
        await catalog.populate(seasonYear, seasonName as Season, "movie");
        patchCtl.applyPatches(catalog, seasonName);
        catalog.sortByPopularity();
        promises.push(catalog.writeToFile());
        if (season === `${monthToSeason(today.getMonth())} ${currentYear}`) {
            catalog.getMetas().forEach(meta => defaultCatalog.addMeta(meta));
            defaultCatalog.sortByPopularity();
            promises.push(defaultCatalog.writeToFile());
        }
    }
    
    // Next season catalog
    const currentSeason = monthToSeason(today.getMonth());
    const [nextSeason, nextSeasonYear] = getNextSeasonAndYear(currentSeason, currentYear);
    console.log(`Generating next season catalog: ${nextSeason} ${nextSeasonYear}`);
    const nextSeasonCatalog = await Stremio.createCatalogIfNotExists(`series/next_anime_season.json`);
    await nextSeasonCatalog.populate(nextSeasonYear, nextSeason, "series");
    await nextSeasonCatalog.populate(nextSeasonYear, nextSeason, "movie");
    patchCtl.applyPatches(nextSeasonCatalog, nextSeason);
    nextSeasonCatalog.sortByPopularity();
    promises.push(nextSeasonCatalog.writeToFile());
    
    console.log(`Updating manifest`);
    await manifest.update(today);
    await Promise.all(promises);
}

(async () => main())()
