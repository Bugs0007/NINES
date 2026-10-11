import { PACKS, BOSSES } from "../src/content/packs";
import { lintPack } from "../src/content/schema";
import { widgetMetrics } from "../src/widgets/manifest";
for (const p of [...PACKS, ...BOSSES]) for (const i of lintPack(p, widgetMetrics)) console.log(i.pack, i.path, i.message);
