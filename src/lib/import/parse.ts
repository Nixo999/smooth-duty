import type { Cell, Grid } from "@/lib/import/grid";
import type {
  ParsedMarker,
  ParsedPerson,
  ParsedShift,
  ParseResult,
  TotalMismatch,
} from "@/lib/import/types";

/* ------------------------------------------------------------------ celle */

function text(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return "";
  return String(cell).trim();
}

function key(cell: Cell): string {
  return text(cell)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const MESI: Record<string, number> = {
  gennaio: 1, gen: 1,
  febbraio: 2, feb: 2,
  marzo: 3, mar: 3,
  aprile: 4, apr: 4,
  maggio: 5, mag: 5,
  giugno: 6, giu: 6,
  luglio: 7, lug: 7,
  agosto: 8, ago: 8,
  settembre: 9, set: 9, sett: 9,
  ottobre: 10, ott: 10,
  novembre: 11, nov: 11,
  dicembre: 12, dic: 12,
};

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Il seriale di Excel conta i giorni dal 30/12/1899. */
function fromExcelSerial(serial: number): string | null {
  if (serial < 20000 || serial > 80000) return null;
  const ms = Math.floor(serial) * 86400000 + Date.UTC(1899, 11, 30);
  const d = new Date(ms);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function parseDateCell(cell: Cell): string | null {
  if (cell === null) return null;

  if (cell instanceof Date) {
    // Le date arrivano come mezzanotte UTC: leggerle in ora locale
    // sposterebbe il giorno indietro in tutti i fusi a ovest di Greenwich.
    return iso(cell.getUTCFullYear(), cell.getUTCMonth() + 1, cell.getUTCDate());
  }

  if (typeof cell === "number") return fromExcelSerial(cell);

  const raw = text(cell);
  if (!raw) return null;

  // "lunedì 17 agosto 2026", "lun 17 agosto", "17 ago 2026"
  const byName = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .match(/(\d{1,2})\s+([a-z]+)\.?\s*(\d{4})?/);
  if (byName) {
    const month = MESI[byName[2]];
    if (month) {
      const day = Number(byName[1]);
      const year = byName[3] ? Number(byName[3]) : new Date().getFullYear();
      if (day >= 1 && day <= 31) return iso(year, month, day);
    }
  }

  // "17/08/2026", "17-8-26"
  const numeric = raw.match(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year = Number(numeric[3]);
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return iso(year, month, day);
    }
  }

  return null;
}

export function parseTimeCell(cell: Cell): string | null {
  if (cell === null) return null;

  const hhmm = (h: number, m: number) =>
    h >= 0 && h <= 23 && m >= 0 && m <= 59
      ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      : null;

  if (cell instanceof Date) {
    return hhmm(cell.getUTCHours(), cell.getUTCMinutes());
  }

  if (typeof cell === "number") {
    // Excel tiene gli orari come frazione di giornata: 0,625 = 15:00.
    const fraction = cell - Math.floor(cell);
    if (fraction === 0 && cell !== 0) return null;
    const minutes = Math.round(fraction * 1440);
    return hhmm(Math.floor(minutes / 60) % 24, minutes % 60);
  }

  const raw = text(cell);
  const match = raw.match(/^(\d{1,2})\s*[:.,h]\s*(\d{2})/i);
  if (match) return hhmm(Number(match[1]), Number(match[2]));

  return null;
}

/** "6,5" e "6.5" valgono lo stesso: nei file italiani il separatore decimale
 *  e' la virgola, ma capita di trovarli esportati all'inglese. */
export function parseDecimal(cell: Cell): number | null {
  if (cell === null) return null;
  if (typeof cell === "number") return cell;
  const raw = text(cell).replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;
  return Number(raw);
}

const MARKERS: Record<string, string> = {
  r: "Riposo",
  f: "Ferie",
  a: "Assenza",
  m: "Malattia",
  p: "Permesso",
  rc: "Recupero",
  fs: "Festivo",
};

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  // Fine minore o uguale all'inizio: il turno scavalca la mezzanotte.
  if (diff <= 0) diff += 1440;
  return diff;
}

/* ------------------------------------------------------- griglia "larga" */

const DA = ["da", "dalle", "inizio", "entrata", "in"];
const A = ["a", "alle", "fine", "uscita", "out"];
const TOT = ["tot", "totale", "ore", "oretot"];
const NOME = ["nome", "nomeecognome", "dipendente", "lavoratore", "persona", "operatore"];
const COGNOME = ["cognome"];
const REPARTO = ["adl", "reparto", "area", "mansione", "ruolo", "settore"];

type DayColumn = { col: number; date: string };

function findDayRow(grid: Grid): { rowIndex: number; days: DayColumn[] } | null {
  const limit = Math.min(grid.length, 30);

  for (let r = 0; r < limit; r++) {
    const found: DayColumn[] = [];
    let precedente: string | null = null;

    for (let c = 0; c < grid[r].length; c++) {
      const date = parseDateCell(grid[r][c]);
      if (!date) continue;

      // Nei fogli veri l'intestazione del giorno e' una cella unita che copre
      // tutto il blocco, e arriva ripetuta su ogni colonna. Vale la prima:
      // e' li' che comincia il giorno.
      if (date === precedente) continue;
      found.push({ col: c, date });
      precedente = date;
    }

    // Tre date sulla stessa riga non capitano per caso: una intestazione di
    // stampa ne contiene una sola, e viene scartata qui.
    if (found.length >= 3) {
      const dates = found.map((d) => d.date);
      if (new Set(dates).size === found.length) return { rowIndex: r, days: found };
    }
  }
  return null;
}

function findHeaderRow(grid: Grid, from: number): number | null {
  for (let r = from; r < Math.min(grid.length, from + 5); r++) {
    if (grid[r].some((cell) => NOME.includes(key(cell)))) return r;
  }
  return null;
}

function columnsIn(header: Cell[], from: number, to: number, names: string[]) {
  const cols: number[] = [];
  for (let c = from; c < to; c++) {
    if (names.includes(key(header[c]))) cols.push(c);
  }
  return cols;
}

function parseWide(grid: Grid, warnings: string[]): ParsedPerson[] | null {
  const dayRow = findDayRow(grid);
  if (!dayRow) return null;

  const headerRow = findHeaderRow(grid, dayRow.rowIndex + 1);
  if (headerRow === null) {
    warnings.push(
      "Ho trovato le colonne dei giorni ma non la riga con «Nome»: controlla che ci sia.",
    );
    return null;
  }

  const header = grid[headerRow];
  const width = Math.max(...grid.map((r) => r.length));

  const nomeCol = header.findIndex((c) => NOME.includes(key(c)));
  const cognomeCol = header.findIndex((c) => COGNOME.includes(key(c)));
  const repartoCol = header.findIndex((c) => REPARTO.includes(key(c)));

  // Ogni giorno occupa le colonne che vanno dalla sua intestazione a quella
  // del giorno dopo.
  const blocks = dayRow.days.map((day, i) => {
    const to = dayRow.days[i + 1]?.col ?? width;
    const daCols = columnsIn(header, day.col, to, DA);
    const aCols = columnsIn(header, day.col, to, A);
    const totCol = columnsIn(header, day.col, to, TOT)[0] ?? null;

    const pairs: [number, number][] = [];
    if (daCols.length && aCols.length) {
      const n = Math.min(daCols.length, aCols.length);
      for (let i = 0; i < n; i++) pairs.push([daCols[i], aCols[i]]);
    } else {
      // Nessuna etichetta Da/A: si assume il blocco a coppie, con l'ultima
      // colonna riservata al totale.
      const span = to - day.col - (totCol !== null ? 1 : 0);
      for (let i = 0; i + 1 < span; i += 2) {
        pairs.push([day.col + i, day.col + i + 1]);
      }
    }
    return { date: day.date, pairs, totCol };
  });

  const people: ParsedPerson[] = [];

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    const nome = nomeCol >= 0 ? text(row[nomeCol]) : "";
    const cognome = cognomeCol >= 0 ? text(row[cognomeCol]) : "";
    const fullName = `${nome} ${cognome}`.trim();

    if (!fullName) continue;
    if (key(row[nomeCol]) === "totale") continue;

    const shifts: ParsedShift[] = [];
    const markers: ParsedMarker[] = [];
    const mismatches: TotalMismatch[] = [];

    for (const block of blocks) {
      let minutes = 0;
      const codes = new Set<string>();

      for (const [daCol, aCol] of block.pairs) {
        const start = parseTimeCell(row[daCol]);
        const end = parseTimeCell(row[aCol]);

        if (start && end) {
          shifts.push({ date: block.date, start, end });
          minutes += minutesBetween(start, end);
          continue;
        }

        if (start && !end) {
          warnings.push(
            `${fullName}, ${block.date}: c'è l'ora di inizio (${start}) ma non quella di fine. Turno saltato.`,
          );
          continue;
        }

        for (const cell of [row[daCol], row[aCol]]) {
          const code = key(cell);
          if (code && MARKERS[code]) codes.add(code);
          else if (code && !parseTimeCell(cell)) {
            warnings.push(
              `${fullName}, ${block.date}: non capisco «${text(cell)}». Ignorato.`,
            );
          }
        }
      }

      for (const code of codes) {
        markers.push({ date: block.date, code: code.toUpperCase(), label: MARKERS[code] });
      }

      // Il confronto con la colonna TOT e' la nostra verifica: se le ore che
      // calcoliamo non coincidono con quelle stampate, abbiamo letto male.
      if (block.totCol !== null) {
        const dichiarato = parseDecimal(row[block.totCol]);
        if (dichiarato !== null) {
          const calcolato = minutes / 60;
          if (Math.abs(dichiarato - calcolato) > 0.02) {
            mismatches.push({ date: block.date, dichiarato, calcolato });
          }
        }
      }
    }

    people.push({
      index: people.length,
      nome,
      cognome,
      fullName,
      reparto: repartoCol >= 0 ? text(row[repartoCol]) || null : null,
      shifts,
      markers,
      mismatches,
    });
  }

  return people;
}

/* -------------------------------------------------------- elenco "lungo" */

function parseLong(grid: Grid): { people: ParsedPerson[] } | null {
  const DATE = ["data", "giorno"];

  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const header = grid[r];
    const find = (names: string[]) => header.findIndex((c) => names.includes(key(c)));

    const nomeCol = find(NOME);
    const dateCol = find(DATE);
    const startCol = find(DA);
    const endCol = find(A);
    if (nomeCol < 0 || dateCol < 0 || startCol < 0 || endCol < 0) continue;

    const cognomeCol = find(COGNOME);
    const repartoCol = find(REPARTO);
    const byName = new Map<string, ParsedPerson>();

    for (let i = r + 1; i < grid.length; i++) {
      const row = grid[i];
      const nome = text(row[nomeCol]);
      const cognome = cognomeCol >= 0 ? text(row[cognomeCol]) : "";
      const fullName = `${nome} ${cognome}`.trim();
      const date = parseDateCell(row[dateCol]);
      const start = parseTimeCell(row[startCol]);
      const end = parseTimeCell(row[endCol]);

      if (!fullName || !date || !start || !end) continue;

      let person = byName.get(fullName);
      if (!person) {
        person = {
          index: byName.size,
          nome,
          cognome,
          fullName,
          reparto: repartoCol >= 0 ? text(row[repartoCol]) || null : null,
          shifts: [],
          markers: [],
          mismatches: [],
        };
        byName.set(fullName, person);
      }
      person.shifts.push({ date, start, end });
    }

    if (byName.size > 0) return { people: [...byName.values()] };
  }

  return null;
}

/* -------------------------------------------------------------- ingresso */

export function parseGrid(
  grid: Grid,
  sheetName: string,
  sheetNames: string[],
): ParseResult {
  const warnings: string[] = [];

  let layout: "wide" | "long" = "wide";
  let people = parseWide(grid, warnings);

  if (!people || people.every((p) => p.shifts.length === 0)) {
    const long = parseLong(grid);
    if (long) {
      layout = "long";
      people = long.people;
      warnings.length = 0;
    }
  }

  if (!people) {
    throw new Error(
      "Non riconosco la struttura del foglio. Serve una riga con i giorni e una con «Nome», " +
        "oppure un elenco con le colonne Nome, Data, Da, A.",
    );
  }

  const days = [
    ...new Set(people.flatMap((p) => p.shifts.map((s) => s.date))),
  ].sort();

  // Le persone senza nemmeno un turno non servono a chi deve controllare
  // l'importazione, ma vanno contate: chi ha solo R o F resta in elenco.
  const kept = people.filter((p) => p.shifts.length > 0 || p.markers.length > 0);

  return {
    layout,
    sheetName,
    sheetNames,
    days,
    people: kept.map((p, i) => ({ ...p, index: i })),
    warnings,
  };
}
