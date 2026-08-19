import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.resolve(root, process.argv[2] ?? "public/dominio-globale-board.svg");
const output = path.resolve(root, "lib/territory-shapes.ts");
const source = await readFile(input, "utf8");

const viewBox = source.match(/viewBox="([^"]+)"/)?.[1];
const territoryLayer = source.match(/<g id="territories" transform="([^"]+)">/);
if (!viewBox || !territoryLayer) throw new Error("SVG del tabellone non riconosciuto.");

const transform = territoryLayer[1];
const translate = transform.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
if (!translate) throw new Error("Trasformazione dei territori non riconosciuta.");
const translateX = Number(translate[1]);
const translateY = Number(translate[2]);

const territories = [];
const territoryPattern = /<g id="territory-([^"]+)"[\s\S]*?<path class="territory-shape" d="([^"]+)"\/>[\s\S]*?<circle class="territory-hit" cx="([^"]+)" cy="([^"]+)" r="13"\/>[\s\S]*?<\/g>/g;
for (const match of source.matchAll(territoryPattern)) {
  territories.push({
    id: match[1],
    path: match[2],
    x: Math.round((Number(match[3]) + translateX) * 10) / 10,
    y: Math.round((Number(match[4]) + translateY) * 10) / 10,
  });
}

if (territories.length !== 42) {
  throw new Error(`Attesi 42 territori, trovati ${territories.length}.`);
}

const ids = new Set(territories.map(({ id }) => id));
if (ids.size !== 42) throw new Error("L'SVG contiene territori duplicati.");

const seaRouteBlock = source.match(/<g class="sea-routes"[^>]*>([\s\S]*?)<\/g>/)?.[1] ?? "";
const seaRoutes = [...seaRouteBlock.matchAll(/<path d="([^"]+)"\/>/g)].map((match) => match[1]);

const record = (items, value) => items
  .map((item) => `  ${JSON.stringify(item.id)}: ${value(item)},`)
  .join("\n");

const generated = `import type { TerritoryId } from "@/lib/game-data";

/**
 * Geometria estratta dal tabellone SVG fornito dall'utente.
 * Tracciato adattato da Gr0gmint, CC BY-SA 3.0.
 * Fonte e licenza complete sono conservate in public/dominio-globale-board.svg e NOTICE.md.
 *
 * File generato da scripts/import-board-svg.mjs: non modificare i tracciati a mano.
 */
export const BOARD_VIEW_BOX = ${JSON.stringify(viewBox)};
export const BOARD_TERRITORY_TRANSFORM = ${JSON.stringify(transform.replace(",", " "))};

export const TERRITORY_CENTERS: Record<TerritoryId, { x: number; y: number }> = {
${record(territories, ({ x, y }) => `{ x: ${x}, y: ${y} }`)}
};

export const TERRITORY_SHAPES: Record<TerritoryId, string> = {
${record(territories, ({ path: territoryPath }) => JSON.stringify(territoryPath))}
};

export const SEA_ROUTE_PATHS = ${JSON.stringify(seaRoutes, null, 2)} as const;
`;

await writeFile(output, generated);
console.log(`Importati ${territories.length} territori e ${seaRoutes.length} rotte in ${path.relative(root, output)}.`);
