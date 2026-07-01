import { Season, monthToSeason, getNextSeasonAndYear, spanishToSeason, seasonToSpanish } from "./query";
import { Stremio } from "./stremio";
import { Patches } from "./patch";
import { promises as fs } from "fs";
import path from "path";

// Core function orchestrating whole catalog updates flow
async function main() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const manifest = await Stremio.createManifestIfNotExists(".");
    const promises = [];
    const patchCtl = new Patches();
    patchCtl.loadCatalogManualFixPatches();
    
    // Updates manifest first so getSeasons() reflects current seasons
    console.log(`Updating manifest`);
    await manifest.update(today);

    const titleType = "anime";
    const defaultCatalog = await Stremio.createCatalogIfNotExists(`${titleType}/latest_anime_seasons.json`);
    const validSeasons = new Set(manifest.getSeasons());

    const currentSeason = monthToSeason(today.getMonth());
    const seasonOrder = [Season.WINTER, Season.SPRING, Season.SUMMER, Season.FALL];
    const currentSeasonIndex = seasonOrder.indexOf(currentSeason);

    // Updates catalog metadata files for each registered season in manifest
    for (const season of manifest.getSeasons()) {
        const englishSeason = spanishToSeason[season];
        const seasonIndex = seasonOrder.indexOf(englishSeason);
        const seasonYear = seasonIndex < currentSeasonIndex ? currentYear + 1 : currentYear;
        
        console.log(`Generating catalog for season ${season} ${titleType}`);
        const catalog = await Stremio.createCatalogIfNotExists(`${titleType}/latest_anime_seasons/genre=${season}.json`);
        await catalog.populateFromMAL(seasonYear, englishSeason);
        patchCtl.applyPatches(catalog, englishSeason);
        catalog.sortByPopularity();
        promises.push(catalog.writeToFile());

        if (season === seasonToSpanish[currentSeason]) {
            catalog.getMetas().forEach(meta => defaultCatalog.addMeta(meta));
            defaultCatalog.sortByPopularity();
            promises.push(defaultCatalog.writeToFile());
        }
    }

    // Removes catalog files for seasons no longer in the manifest
    const seasonDir = `./catalog/${titleType}/latest_anime_seasons`;
    try {
        const files = await fs.readdir(seasonDir);
        for (const file of files) {
            const match = file.match(/^genre=(.+)\.json$/);
            if (match && !validSeasons.has(match[1])) {
                console.log(`Removing old catalog: ${file}`);
                await fs.unlink(path.join(seasonDir, file));
            }
        }
    } catch { }
    
    // Updates upcoming next season catalog metadata file
    const [nextSeason, nextSeasonYear] = getNextSeasonAndYear(currentSeason, currentYear);
    console.log(`Generating next season catalog: ${nextSeason} ${nextSeasonYear}`);
    const nextSeasonCatalog = await Stremio.createCatalogIfNotExists(`anime/next_anime_season.json`);
    await nextSeasonCatalog.populateFromMAL(nextSeasonYear, nextSeason);
    patchCtl.applyPatches(nextSeasonCatalog, nextSeason);
    nextSeasonCatalog.sortByPopularity();
    promises.push(nextSeasonCatalog.writeToFile());
    
    await Promise.all(promises);
}

// Immediate execution trigger for main execution thread
(async () => main())();
