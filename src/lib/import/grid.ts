import ExcelJS from "exceljs";
import { ErroreLeggibile } from "@/lib/errori";
import Papa from "papaparse";

/** Il contenuto grezzo di un foglio: righe di celle, niente interpretazione.
 *  Separare "leggere il file" da "capire cosa c'e' scritto" permette di
 *  provare il secondo pezzo senza avere un file vero sottomano. */
export type Cell = string | number | Date | null;
export type Grid = Cell[][];

export type ReadResult = {
  grid: Grid;
  sheetName: string;
  sheetNames: string[];
};

/** ExcelJS restituisce forme diverse a seconda di come e' fatta la cella:
 *  testo formattato, formula col risultato, collegamento. Qui diventano tutte
 *  un valore semplice. */
function normalize(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;

  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[]).map((p) => p.text ?? "").join("");
    }
    if ("result" in v) return normalize(v.result);
    if ("text" in v) return normalize(v.text);
    if ("error" in v) return null;
  }
  return String(value);
}

export async function readSpreadsheet(
  file: File,
  sheet?: string,
): Promise<ReadResult> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: false,
    });
    return {
      grid: (parsed.data ?? []).map((row) => row.map((c) => (c === "" ? null : c))),
      sheetName: "CSV",
      sheetNames: ["CSV"],
    };
  }

  if (name.endsWith(".xls")) {
    throw new ErroreLeggibile(
      "Il formato .xls è quello vecchio di Excel. Aprilo e salvalo come .xlsx, poi ricaricalo.",
    );
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheetNames = workbook.worksheets.map((w) => w.name);
  const worksheet =
    (sheet ? workbook.worksheets.find((w) => w.name === sheet) : null) ??
    workbook.worksheets[0];

  if (!worksheet) throw new ErroreLeggibile("Il file non contiene nessun foglio.");

  const width = Math.max(worksheet.columnCount, 1);
  const grid: Grid = [];

  // includeEmpty: le righe vuote contano, perche' gli indici di riga devono
  // corrispondere a quelli che l'utente vede in Excel.
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: Cell[] = [];
    for (let c = 1; c <= width; c++) {
      cells.push(normalize(row.getCell(c).value));
    }
    grid[rowNumber - 1] = cells;
  });

  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) grid[i] = new Array<Cell>(width).fill(null);
  }

  return { grid, sheetName: worksheet.name, sheetNames };
}
