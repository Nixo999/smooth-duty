"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CODICI_CAUSALE } from "@/lib/assenze";
import { requireCapo, requireMember } from "@/lib/auth";
import { messaggioErrore } from "@/lib/errori";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const giorno = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida.");

const apriSchema = z.object({
  profile_id: z.string().uuid(),
  type: z
    .string()
    .refine((v) => CODICI_CAUSALE.includes(v), "Motivo non riconosciuto."),
  start_date: giorno,
  // Vuota di proposito nel caso normale: chi si ammala non sa quando torna.
  end_date: giorno.nullable(),
  note: z.string().trim().max(300).nullable(),
});

export type ApriAssenzaInput = z.input<typeof apriSchema>;

function aggiorna() {
  revalidatePath("/turni");
  revalidatePath("/supervisione");
  revalidatePath("/squadra");
}

export async function apriAssenza(input: ApriAssenzaInput): Promise<ActionResult> {
  const capo = await requireCapo();

  const parsed = apriSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;

  if (v.end_date && v.end_date < v.start_date) {
    return { ok: false, error: "La fine non può venire prima dell'inizio." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("absences").insert({
    company_id: capo.company_id,
    profile_id: v.profile_id,
    type: v.type,
    start_date: v.start_date,
    end_date: v.end_date,
    note: v.note,
    created_by: capo.id,
  });

  if (error) {
    // L'indice che ammette una sola assenza aperta per persona.
    return {
      ok: false,
      error:
        error.code === "23505"
          ? "Questa persona ha già un'assenza in corso: chiudila prima di aprirne un'altra."
          : messaggioErrore(error),
    };
  }

  aggiorna();
  return { ok: true };
}

const chiudiSchema = z.object({
  id: z.string().uuid(),
  /** Primo giorno in cui torna: l'assenza finisce il giorno prima. */
  primo_giorno: giorno,
});

export async function chiudiAssenza(
  input: z.input<typeof chiudiSchema>,
): Promise<ActionResult> {
  await requireCapo();

  const parsed = chiudiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const fine = new Date(`${parsed.data.primo_giorno}T12:00:00`);
  fine.setDate(fine.getDate() - 1);
  const ultimoGiorno = fine.toISOString().slice(0, 10);

  const supabase = await createClient();
  const { error } = await supabase
    .from("absences")
    .update({ end_date: ultimoGiorno })
    .eq("id", parsed.data.id);

  if (error) {
    return {
      ok: false,
      error:
        error.code === "23514"
          ? "Il rientro non può essere prima dell'inizio dell'assenza."
          : messaggioErrore(error),
    };
  }

  aggiorna();
  return { ok: true };
}

export async function eliminaAssenza(id: string): Promise<ActionResult> {
  await requireCapo();

  const supabase = await createClient();
  const { error } = await supabase.from("absences").delete().eq("id", id);
  if (error) return { ok: false, error: messaggioErrore(error) };

  aggiorna();
  return { ok: true };
}

/** Il rientro lo conferma la persona stessa: è il «finché non conferma che
 *  torna» della richiesta. Passa da una funzione SECURITY DEFINER perché
 *  l'unica cosa che deve poter toccare è la fine della propria assenza
 *  aperta — con un permesso di scrittura su absences potrebbe spostarsi
 *  l'inizio, o chiudere quella di un collega. */
export async function confermaRientro(primoGiorno: string): Promise<ActionResult> {
  await requireMember();

  const parsed = giorno.safeParse(primoGiorno);
  if (!parsed.success) return { ok: false, error: "Data non valida." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("conferma_rientro", {
    primo_giorno: parsed.data,
  });

  if (error) return { ok: false, error: messaggioErrore(error) };

  aggiorna();
  return { ok: true };
}
