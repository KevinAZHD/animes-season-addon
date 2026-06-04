import * as fs from "fs";
import * as path from "path";
import { Catalog } from "./stremio";

// Handles postprocess metadata patches read from manual CSV configuration
export class Patches {
    private line: string = "";
    private filePath: string;
    private patches: any = {
        movie: { SUMMER: new Map(), WINTER: new Map(), SPRING: new Map(), FALL: new Map() },
        series: { SUMMER: new Map(), WINTER: new Map(), SPRING: new Map(), FALL: new Map() }
    };

    constructor(filePath?: string) {
        this.filePath = filePath || path.join(__dirname, "../../postprocess/fix/catalog/manual.csv");
    }

    // Parses and pops next comma-separated or quoted field from internal line buffer
    private popNext(): string {
        let separator = ",";
        if (this.line[0] === '"') {
            separator = "\",";
            this.line = this.line.slice(1);
        }
        const nextQuote = this.line.indexOf(separator);
        const result = nextQuote === -1 ? this.line : this.line.slice(0, nextQuote);
        this.line = nextQuote === -1 ? "" : this.line.slice(nextQuote + separator.length);
        return result;
    }

    // Loads CSV manual patches file and builds internal lookup structure
    loadCatalogManualFixPatches() {
        if (!this.filePath) this.filePath = path.join(__dirname, "../../postprocess/fix/catalog/manual.csv");
        const patchFileContent = fs.readFileSync(this.filePath, "utf8");
        for (const line of patchFileContent.split("\n")) {
            if (!line.trim()) continue;
            this.line = line;
            const [type, season, name, oldID, newID] = [this.popNext(), this.popNext(), this.popNext(), this.popNext(), this.popNext()];
            if (season && !isNaN(season as any)) {
                this.patches[type] = { ...this.patches[type], [season]: this.patches[type][season] || new Map() };
            }
            if (this.patches[type] && this.patches[type][season]) {
                this.patches[type][season].set(name, { [oldID]: newID });
            }
        }
        return this.patches;
    }
    
    // Scans catalog metas and patches matching ID configurations
    applyPatches(catalog: Catalog, season: string) {
        catalog.getMetas().forEach(meta => {
            const metaType = meta.type === "movie" ? "movie" : "series";
            const patch = this.patches[metaType][season]?.get(meta.name);
            if (patch && patch[meta.id]) {
                console.log(`Applying patch for ${meta.name}: ${meta.id} => ${patch[meta.id]}`);
                meta.id = patch[meta.id];
            }
        });
    }
}
