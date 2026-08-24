/**
 * Ricostruisce un foglio con la stessa struttura del tabellone reale
 * ("ORARI LIMBIATE", settimana 47): righe = persone, e ogni giorno occupa
 * cinque colonne — Da, A, Da, A, TOT.
 *
 *   node scripts/crea-esempio.mjs
 */
import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";

const GIORNI = [
  "lunedì 17 agosto 2026",
  "martedì 18 agosto 2026",
  "mercoledì 19 agosto 2026",
  "giovedì 20 agosto 2026",
  "venerdì 21 agosto 2026",
  "sabato 22 agosto 2026",
  "domenica 23 agosto 2026",
];

// Ogni giorno: [da1, a1, da2, a2, tot]. "R", "F", "A" dove non si lavora.
const PERSONE = [
  ["Salvatore Fabio", "Lupo", "CCO", [
    ["15:00", "21:00", "", "", "6,0"],
    ["15:00", "21:00", "", "", "6,0"],
    ["15:00", "21:00", "", "", "6,0"],
    ["15:00", "21:00", "", "", "6,0"],
    ["15:00", "21:00", "", "", "6,0"],
    ["16:30", "21:00", "", "", "4,5"],
    ["08:00", "13:00", "14:00", "17:00", "8,0"],
  ]],
  ["Filippo Maria Mirko", "Monciardini", "REGIA", [
    ["08:00", "13:00", "13:30", "15:00", "6,5"],
    ["08:00", "12:00", "12:30", "15:30", "7,0"],
    ["08:00", "12:00", "13:00", "15:00", "6,0"],
    ["08:00", "12:00", "13:00", "15:00", "6,0"],
    ["08:00", "12:00", "13:00", "15:00", "6,0"],
    ["08:00", "12:00", "12:30", "16:30", "8,0"],
    ["R", "R", "R", "R", "0,0"],
  ]],
  ["Alessandro", "Vaccaro", "REGIA",
    Array.from({ length: 7 }, () => ["R", "R", "R", "R", "0,0"])],
  ["Concetta", "Marcinno'", "CS", [
    ["08:45", "13:00", "13:30", "15:15", "6,0"],
    ["08:45", "13:00", "13:30", "15:15", "6,0"],
    ["08:45", "13:00", "13:30", "16:15", "7,0"],
    ["08:45", "13:00", "13:30", "15:15", "6,0"],
    ["08:45", "13:00", "13:30", "15:15", "6,0"],
    ["08:45", "13:00", "13:30", "16:15", "7,0"],
    ["R", "R", "R", "R", "0,0"],
  ]],
  ["Lidia", "Massa", "CS", [
    ["R", "R", "R", "R", "0,0"],
    ["15:15", "21:15", "", "", "6,0"],
    ["15:00", "16:00", "16:15", "21:15", "6,0"],
    ["15:15", "21:15", "", "", "6,0"],
    ["15:15", "21:15", "", "", "6,0"],
    ["13:45", "16:00", "16:30", "21:15", "7,0"],
    ["08:45", "13:00", "13:15", "15:00", "6,0"],
  ]],
  ["Paola", "Olivati", "CS",
    Array.from({ length: 7 }, () => ["R", "R", "R", "R", "0,0"])],
  ["Maria Del Carmen", "Paciello", "CS",
    Array.from({ length: 7 }, () => ["A", "A", "A", "A", "0,0"])],
  ["Sara", "Zeno", "CS", [
    ["15:00", "21:00", "", "", "6,0"],
    ["15:00", "21:00", "", "", "6,0"],
    ["13:45", "16:00", "16:15", "21:00", "7,0"],
    ["15:00", "21:00", "", "", "6,0"],
    ["", "", "", "", "0,0"],
    ["13:45", "16:30", "17:00", "21:15", "7,0"],
    ["14:30", "20:30", "", "", "6,0"],
  ]],
  ["Elisabetta", "Mavilia", "TLC", [
    ["09:00", "15:00", "", "", "6,0"],
    ["09:00", "15:00", "", "", "6,0"],
    ["R", "R", "R", "R", "0,0"],
    ["09:00", "15:00", "", "", "6,0"],
    ["09:00", "13:00", "14:00", "17:00", "7,0"],
    ["09:00", "13:00", "14:00", "17:00", "7,0"],
    ["09:00", "15:00", "", "", "6,0"],
  ]],
  ["Nicola", "La Rezza", "CASS", [
    ["15:00", "21:00", "", "", "6,0"],
    ["17:00", "21:00", "", "", "4,0"],
    ["R", "R", "R", "R", "0,0"],
    ["15:00", "21:00", "", "", "6,0"],
    ["R", "R", "R", "R", "0,0"],
    ["15:00", "21:00", "", "", "6,0"],
    ["R", "R", "R", "R", "0,0"],
  ]],
  ["Lorenzo", "Montano", "GE",
    Array.from({ length: 7 }, () => ["F", "F", "F", "F", "0,0"])],
];

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Orari");

ws.getCell(1, 1).value = "Settimana 47";
ws.getCell(1, 12).value = "ORARI LIMBIATE";
ws.getCell(1, 30).value = "da lun 17 agosto a dom 23 agosto";
ws.getCell(2, 1).value = "Stampa del: 30/07/2026, 12:06";

// Intestazione dei giorni. Nei fogli veri e' una cella unita che copre tutto
// il blocco, e quando la si legge il valore arriva ripetuto su tutte e cinque
// le colonne: l'esempio deve comportarsi allo stesso modo, altrimenti prova
// una cosa che nella realta' non capita.
GIORNI.forEach((giorno, i) => {
  for (let c = 0; c < 5; c++) ws.getCell(3, 4 + i * 5 + c).value = giorno;
});

ws.getCell(4, 1).value = "Nome";
ws.getCell(4, 2).value = "Cognome";
ws.getCell(4, 3).value = "AdL";
GIORNI.forEach((_, i) => {
  const base = 4 + i * 5;
  ["Da", "A", "Da", "A", "TOT"].forEach((label, j) => {
    ws.getCell(4, base + j).value = label;
  });
});

PERSONE.forEach(([nome, cognome, adl, giorni], r) => {
  const row = 5 + r;
  ws.getCell(row, 1).value = nome;
  ws.getCell(row, 2).value = cognome;
  ws.getCell(row, 3).value = adl;
  giorni.forEach((valori, i) => {
    const base = 4 + i * 5;
    valori.forEach((v, j) => {
      if (v !== "") ws.getCell(row, base + j).value = v;
    });
  });
});

await mkdir(new URL("../esempi/", import.meta.url), { recursive: true });
const out = new URL("../esempi/orari-limbiate.xlsx", import.meta.url);
await wb.xlsx.writeFile(out);
console.log("scritto:", out.pathname);
