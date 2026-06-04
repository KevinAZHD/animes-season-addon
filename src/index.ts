import { Season, monthToSeason, getNextSeasonAndYear, spanishToSeason, seasonToSpanish } from "./query";
import { Stremio } from "./stremio";
import { Patches } from "./patch";

// Core function orchestrating whole catalog updates flow
async function main() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const manifest = await Stremio.createManifestIfNotExists(".");
    const promises = [];
    const patchCtl = new Patches();
    patchCtl.loadCatalogManualFixPatches();
    
    const titleType = "anime";
    const defaultCatalog = await Stremio.createCatalogIfNotExists(`${titleType}/latest_anime_seasons.json`);

    // Updates catalog metadata files for each registered season in manifest
    for (const season of manifest.getSeasons()) {
        const [seasonName, seasonYearStr] = season.split(" ");
        const seasonYear = parseInt(seasonYearStr);
        const englishSeason = spanishToSeason[seasonName];
        
        console.log(`Generating catalog for season ${season} ${titleType}`);
        const catalog = await Stremio.createCatalogIfNotExists(`${titleType}/latest_anime_seasons/genre=${season}.json`);
        await catalog.populateFromMAL(seasonYear, englishSeason);
        patchCtl.applyPatches(catalog, englishSeason);
        catalog.sortByPopularity();
        promises.push(catalog.writeToFile());

        if (season === `${seasonToSpanish[monthToSeason(today.getMonth())]} ${currentYear}`) {
            catalog.getMetas().forEach(meta => defaultCatalog.addMeta(meta));
            defaultCatalog.sortByPopularity();
            promises.push(defaultCatalog.writeToFile());
        }
    }
    
    // Updates upcoming next season catalog metadata file
    const currentSeason = monthToSeason(today.getMonth());
    const [nextSeason, nextSeasonYear] = getNextSeasonAndYear(currentSeason, currentYear);
    console.log(`Generating next season catalog: ${nextSeason} ${nextSeasonYear}`);
    const nextSeasonCatalog = await Stremio.createCatalogIfNotExists(`anime/next_anime_season.json`);
    await nextSeasonCatalog.populateFromMAL(nextSeasonYear, nextSeason);
    patchCtl.applyPatches(nextSeasonCatalog, nextSeason);
    nextSeasonCatalog.sortByPopularity();
    promises.push(nextSeasonCatalog.writeToFile());
    
    console.log(`Updating manifest`);
    await manifest.update(today);
    await Promise.all(promises);
}

// Immediate execution trigger for main execution thread
(async () => main())();
