/**
 * Fa girare il lettore sul foglio di esempio e stampa cosa ha capito.
 * La riga che conta e' quella dei totali: se le ore calcolate non
 * coincidono con la colonna TOT del file, abbiamo letto male.
 *
 *   node scripts/prova-lettura.mjs [percorso-file]
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { readSpreadsheet } from "../src/lib/import/grid.ts";
import { parseGrid } from "../src/lib/import/parse.ts";

const path =
  process.argv[2] ?? new URL("../esempi/orari-limbiate.xlsx", import.meta.url);

const buffer = await readFile(path);
const file = new File([buffer], basename(String(path)));

const { grid, sheetName, sheetNames } = await readSpreadsheet(file);
const result = parseGrid(grid, sheetName, sheetNames);

console.log(`struttura riconosciuta : ${result.layout}`);
console.log(`giorni                 : ${result.days.join(", ")}`);
console.log(`persone                : ${result.people.length}`);
console.log(
  `turni                  : ${result.people.reduce((n, p) => n + p.shifts.length, 0)}`,
);
console.log("");

let mismatches = 0;
for (const p of result.people) {
  const ore = p.shifts.reduce((sum, s) => {
    const [sh, sm] = s.start.split(":").map(Number);
    const [eh, em] = s.end.split(":").map(Number);
    let d = eh * 60 + em - (sh * 60 + sm);
    if (d <= 0) d += 1440;
    return sum + d;
  }, 0) / 60;

  const codici = [...new Set(p.markers.map((m) => m.code))].join(" ");
  console.log(
    `${p.fullName.padEnd(26)} ${String(p.reparto ?? "").padEnd(6)} ` +
      `${String(p.shifts.length).padStart(2)} turni  ${ore.toFixed(1).padStart(5)} h` +
      (codici ? `  [${codici}]` : "") +
      (p.mismatches.length ? `  ⚠ ${p.mismatches.length} totali non tornano` : ""),
  );
  for (const m of p.mismatches) {
    console.log(
      `    ${m.date}: nel file ${m.dichiarato}, calcolato ${m.calcolato.toFixed(2)}`,
    );
  }
  mismatches += p.mismatches.length;
}

console.log("");
console.log(`totali non coincidenti : ${mismatches}`);
console.log(`avvisi                 : ${result.warnings.length}`);
for (const w of result.warnings) console.log(`  - ${w}`);
