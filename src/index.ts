import { Season, monthToSeason, getNextSeasonAndYear } from "./query";
import { Stremio } from "./stremio";
import { TitleType } from 'name-to-imdb';
import { Patches } from "./patch";

async function main() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const manifest = await Stremio.createManifestIfNotExists(".");
    const promises = [];
    const patchCtl = new Patches();
    patchCtl.loadCatalogManualFixPatches();
    for (const titleType of ["series", "movie"] as TitleType[]) {
        const defaultCatalog = await Stremio.createCatalogIfNotExists(`${titleType}/latest_anime_seasons.json`);
        for (const season of manifest.getSeasons()) {
            console.log(`Generating catalog for season ${season} ${titleType}`);
            const catalog = await Stremio.createCatalogIfNotExists(`${titleType}/latest_anime_seasons/genre=${season}.json`);
            await catalog.populate(currentYear, season, titleType);
            patchCtl.applyPatches(catalog, titleType, season);
            promises.push(catalog.writeToFile());
            if (season === monthToSeason(today.getMonth())) {
                catalog.getMetas().forEach(meta => defaultCatalog.addMeta(meta));
                promises.push(defaultCatalog.writeToFile());
            }
        }
        if (currentYear > manifest.getLastUpdate().getFullYear()) {
            for (let year = Math.max(2001, manifest.getLastUpdate().getFullYear()); year < currentYear; year++) {
                console.log(`Generating catalog for year ${year} ${titleType}`);
                const catalog = await Stremio.createCatalogIfNotExists(`${titleType}/archive_anime_seasons/genre=${year}.json`);
                for (const season of manifest.getSeasons()) {
                    await catalog.populate(year, season, titleType);
                    patchCtl.applyPatches(catalog, titleType, year.toString());
                }
                promises.push(catalog.writeToFile());
            }
        }
    }
    // Next season catalog (series only)
    const currentSeason = monthToSeason(today.getMonth());
    const [nextSeason, nextSeasonYear] = getNextSeasonAndYear(currentSeason, currentYear);
    console.log(`Generating next season catalog: ${nextSeason} ${nextSeasonYear}`);
    const nextSeasonCatalog = await Stremio.createCatalogIfNotExists(`series/next_anime_season.json`);
    await nextSeasonCatalog.populate(nextSeasonYear, nextSeason, "series");
    patchCtl.applyPatches(nextSeasonCatalog, "series", nextSeason);
    promises.push(nextSeasonCatalog.writeToFile());
    if (currentYear > manifest.getLastUpdate().getFullYear() || manifest.getSeasons()[0] != monthToSeason(today.getMonth())) {
        console.log(`Updating manifest`);
        await manifest.update(today);
    }
    await Promise.all(promises);
}

(async () => main())()
