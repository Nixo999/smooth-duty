"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CODICI_CAUSALE } from "@/lib/assenze";
import { requireCapo, requireMember } from "@/lib/auth";
import { messaggioErrore } from "@/lib/errori";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const giorno = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida.");

function aggiorna() {
  revalidatePath("/permessi");
  // L'approvazione crea un'assenza vera: la vedono anche le altre pagine.
  revalidatePath("/turni");
  revalidatePath("/supervisione");
  revalidatePath("/prospetto");
  revalidatePath("/squadra");
}

const richiestaSchema = z
  .object({
    type: z
      .string()
      .refine((v) => CODICI_CAUSALE.includes(v), "Motivo non riconosciuto."),
    start_date: giorno,
    end_date: giorno,
    note: z.string().trim().max(300).optional().or(z.literal("")),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: "La fine non può venire prima dell'inizio.",
    path: ["end_date"],
  });

export type RichiestaInput = z.input<typeof richiestaSchema>;

/** Chiunque chiede per sé, con la sua causale: ferie, malattia, permessi.
 *  La richiesta nasce «con riserva» — lo impone anche la policy sul
 *  database. */
export async function chiediPermesso(input: RichiestaInput): Promise<ActionResult> {
  const user = await requireMember();

  const parsed = richiestaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("vacation_requests").insert({
    company_id: user.company_id,
    profile_id: user.id,
    type: v.type,
    start_date: v.start_date,
    end_date: v.end_date,
    note: v.note?.trim() || null,
  });
  if (error) return { ok: false, error: messaggioErrore(error) };

  revalidatePath("/permessi");
  return { ok: true };
}

/** Si ritira solo finché è una richiesta: le decise sono storia. La regola
 *  vera sta nella policy di delete; qui si traduce l'esito in italiano. */
export async function ritiraRichiesta(id: string): Promise<ActionResult> {
  const user = await requireMember();

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("vacation_requests")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("profile_id", user.id)
    .eq("status", "richiesta");
  if (error) return { ok: false, error: messaggioErrore(error) };
  if (!count) {
    return { ok: false, error: "Questa richiesta è già stata decisa: parlane col responsabile." };
  }

  revalidatePath("/permessi");
  return { ok: true };
}

/** La decisione del responsabile. Approvare crea l'assenza vera con la
 *  causale della richiesta; rifiutare una richiesta già approvata la
 *  cancella. absence_id lega le due cose. */
export async function decidiRichiesta(
  id: string,
  approva: boolean,
): Promise<ActionResult> {
  const capo = await requireCapo();

  const supabase = await createClient();
  const { data: richiesta, error: erroreLettura } = await supabase
    .from("vacation_requests")
    .select("id, profile_id, type, start_date, end_date, note, status, absence_id")
    .eq("id", id)
    .maybeSingle();
  if (erroreLettura) return { ok: false, error: messaggioErrore(erroreLettura) };
  if (!richiesta) return { ok: false, error: "Richiesta non trovata." };

  const statoNuovo = approva ? "approvata" : "rifiutata";
  if (richiesta.status === statoNuovo) return { ok: true };

  let absenceId: string | null = richiesta.absence_id;

  if (approva) {
    const { data: assenza, error } = await supabase
      .from("absences")
      .insert({
        company_id: capo.company_id,
        profile_id: richiesta.profile_id,
        type: richiesta.type,
        start_date: richiesta.start_date,
        end_date: richiesta.end_date,
        note: richiesta.note,
        created_by: capo.id,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: messaggioErrore(error) };
    absenceId = assenza.id;
  } else if (richiesta.absence_id) {
    // Era approvata: la revoca porta via anche l'assenza che aveva creato.
    const { error } = await supabase
      .from("absences")
      .delete()
      .eq("id", richiesta.absence_id);
    if (error) return { ok: false, error: messaggioErrore(error) };
    absenceId = null;
  }

  const { error } = await supabase
    .from("vacation_requests")
    .update({ status: statoNuovo, absence_id: absenceId, decided_by: capo.id })
    .eq("id", id);
  if (error) return { ok: false, error: messaggioErrore(error) };

  aggiorna();
  return { ok: true };
}
