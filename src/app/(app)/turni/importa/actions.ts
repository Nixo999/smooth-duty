"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapo } from "@/lib/auth";
import { ErroreLeggibile, messaggioErrore } from "@/lib/errori";
import { readSpreadsheet } from "@/lib/import/grid";
import { parseGrid } from "@/lib/import/parse";
import type { ParseResult } from "@/lib/import/types";
import { createClient } from "@/lib/supabase/server";

export type AnalisiResult =
  | { ok: true; result: ParseResult }
  | { ok: false; error: string };

const MAX_BYTES = 5 * 1024 * 1024;

export async function analizzaFile(formData: FormData): Promise<AnalisiResult> {
  await requireCapo();

  const file = formData.get("file");
  const sheet = formData.get("sheet");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Nessun file selezionato." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Il file supera i 5 MB." };
  }

  try {
    const { grid, sheetName, sheetNames } = await readSpreadsheet(
      file,
      typeof sheet === "string" && sheet ? sheet : undefined,
    );
    return { ok: true, result: parseGrid(grid, sheetName, sheetNames) };
  } catch (error) {
    // Il lettore solleva due specie di errori: quelli scritti per chi carica
    // il file (il `.xls` da riconvertire, il foglio senza intestazione), che
    // vanno mostrati come sono, e quelli della libreria che apre l'Excel, che
    // parlano inglese e di archivi ZIP. Si distinguono dal marcatore, non dal
    // testo: un elenco di frasi note si scollerebbe al primo ritocco.
    if (error instanceof ErroreLeggibile) return { ok: false, error: error.message };
    return {
      ok: false,
      error:
        "Questo file non si riesce a leggere, e non è stato importato niente. " +
        "Controlla che sia un .xlsx o un .csv integro, poi ricaricalo.",
    };
  }
}

const time = z.string().regex(/^\d{2}:\d{2}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const importSchema = z.object({
  shifts: z
    .array(
      z.object({
        profile_id: z.string().uuid().nullable(),
        date: day,
        start: time,
        end: time,
        title: z.string().trim().max(80).nullable(),
      }),
    )
    .min(1, "Non c'è niente da importare.")
    .max(3000, "Troppi turni in una volta sola."),
  giorni: z.array(day).min(1).max(120),
  sostituisci: z.boolean(),
});

export type ImportInput = z.input<typeof importSchema>;

export type ImportResult =
  | { ok: true; inseriti: number; rimossi: number }
  | { ok: false; error: string };

export async function importaTurni(input: ImportInput): Promise<ImportResult> {
  const capo = await requireCapo();

  const parsed = importSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { shifts, giorni, sostituisci } = parsed.data;

  const supabase = await createClient();

  // Gli abbinamenti nome → persona li ha decisi il browser, quindi vanno
  // ricontrollati: qui si verifica che ogni identificativo sia davvero di
  // questa azienda. Il database ha lo stesso controllo in un trigger, ma un
  // messaggio chiaro e' meglio di un errore di vincolo.
  const wanted = [...new Set(shifts.map((s) => s.profile_id).filter(Boolean))] as string[];
  if (wanted.length > 0) {
    const { data: valid, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("company_id", capo.company_id)
      .in("id", wanted);

    if (error) return { ok: false, error: messaggioErrore(error) };
    if ((valid?.length ?? 0) !== wanted.length) {
      return {
        ok: false,
        error: "Alcune persone indicate non fanno parte di questa azienda.",
      };
    }
  }

  let rimossi = 0;
  if (sostituisci) {
    const { count, error } = await supabase
      .from("shifts")
      .delete({ count: "exact" })
      .eq("company_id", capo.company_id)
      .in("date", giorni);

    if (error) return { ok: false, error: messaggioErrore(error) };
    rimossi = count ?? 0;
  }

  const rows = shifts.map((s) => ({
    company_id: capo.company_id,
    profile_id: s.profile_id,
    date: s.date,
    start_time: s.start,
    end_time: s.end,
    title: s.title,
    created_by: capo.id,
  }));

  // A blocchi: una singola insert da migliaia di righe supera i limiti della
  // richiesta e fallisce senza dire perche'.
  let inseriti = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase.from("shifts").insert(chunk);
    if (error) {
      // Fermarsi a meta' e' l'unico caso in cui la prima frase non puo'
      // essere «non e' cambiato niente»: dei turni sono entrati davvero, e
      // chi legge deve saperlo prima di ricaricare tutto il foglio.
      return {
        ok: false,
        error:
          inseriti === 0
            ? messaggioErrore(error)
            : `Importati ${inseriti} turni su ${rows.length}, poi l'importazione si è fermata. ` +
              `Quelli entrati restano al loro posto: guarda il tabellone e ricarica il foglio con i giorni che mancano.`,
      };
    }
    inseriti += chunk.length;
  }

  revalidatePath("/turni");
  return { ok: true, inseriti, rimossi };
}
