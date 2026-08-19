import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const loadTypeScriptModule = (path) => {
  const source = readFileSync(resolve(process.cwd(), path), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  const unavailableRequire = (specifier) => {
    throw new Error(`Import runtime inatteso durante la validazione: ${specifier}`);
  };
  Function("exports", "module", "require", output)(loadedModule.exports, loadedModule, unavailableRequire);
  return loadedModule.exports;
};

const { TERRITORIES, TERRITORY_BY_ID } = loadTypeScriptModule("lib/game-data.ts");
const { TOURNAMENT_OBJECTIVES } = loadTypeScriptModule("lib/tournament-objectives.ts");
const failures = [];

if (TERRITORIES.length !== 42) failures.push(`territori: attesi 42, trovati ${TERRITORIES.length}`);
if (TOURNAMENT_OBJECTIVES.length !== 16) failures.push(`obiettivi: attesi 16, trovati ${TOURNAMENT_OBJECTIVES.length}`);

for (const territory of TERRITORIES) {
  for (const neighbor of territory.adjacent) {
    if (!TERRITORY_BY_ID[neighbor]) failures.push(`${territory.id}: confine inesistente ${neighbor}`);
    else if (!TERRITORY_BY_ID[neighbor].adjacent.includes(territory.id)) failures.push(`${territory.id} ↔ ${neighbor}: confine non simmetrico`);
  }
}

for (const objective of TOURNAMENT_OBJECTIVES) {
  const unique = new Set(objective.territoryIds);
  const score = objective.territoryIds.reduce((sum, id) => sum + (TERRITORY_BY_ID[id]?.value ?? 0), 0);
  if (unique.size !== objective.territoryIds.length) failures.push(`${objective.id}: contiene territori duplicati`);
  if (score !== 86) failures.push(`${objective.id}: vale ${score}, non 86`);
  if (objective.points !== 86) failures.push(`${objective.id}: metadato punti non valido`);
  const start = objective.territoryIds[0];
  const visited = new Set(start ? [start] : []);
  const queue = start ? [start] : [];
  while (queue.length) {
    const current = queue.shift();
    for (const neighbor of TERRITORY_BY_ID[current].adjacent) {
      if (unique.has(neighbor) && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  if (visited.size !== unique.size) failures.push(`${objective.id}: la mappa non è connessa (${visited.size}/${unique.size})`);
}

if (failures.length) {
  console.error("Validazione Challenge fallita:\n- " + failures.join("\n- "));
  process.exit(1);
}

const totalMapValue = TERRITORIES.reduce((sum, territory) => sum + territory.value, 0);
console.log(`OK · 42 territori (${totalMapValue} punti) · 16 obiettivi connessi da 86 punti`);
