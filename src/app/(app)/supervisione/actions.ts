"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapo } from "@/lib/auth";
import { messaggioErrore } from "@/lib/errori";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ora = z.string().regex(/^\d{2}:\d{2}$/, "Orario non valido.");

/* ------------------------------------------------------------- reparti -- */

const repartoSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Dai un nome al reparto.").max(40),
  hue: z.number().int().min(0).max(360),
  position: z.number().int().min(0).max(999),
});

export type RepartoInput = z.input<typeof repartoSchema>;

export async function salvaReparto(input: RepartoInput): Promise<ActionResult> {
  const capo = await requireCapo();

  const parsed = repartoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, name, hue, position } = parsed.data;

  const supabase = await createClient();
  const riga = { name, hue, position, company_id: capo.company_id };

  const { error } = id
    ? await supabase.from("departments").update(riga).eq("id", id)
    : await supabase.from("departments").insert(riga);

  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Esiste già un reparto con questo nome." : messaggioErrore(error),
    };
  }

  revalidatePath("/supervisione");
  revalidatePath("/squadra");
  return { ok: true };
}

/** Elimina il reparto. Le fasce spariscono con lui; le persone e i turni no,
 *  restano senza reparto — cancellare i turni di qualcuno perché si è
 *  riorganizzato un reparto sarebbe un disastro silenzioso. */
export async function eliminaReparto(id: string): Promise<ActionResult> {
  await requireCapo();

  const supabase = await createClient();
  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) return { ok: false, error: messaggioErrore(error) };

  revalidatePath("/supervisione");
  revalidatePath("/squadra");
  revalidatePath("/turni");
  return { ok: true };
}

/* -------------------------------------------------------------- fasce -- */

const fasciaSchema = z
  .object({
    id: z.string().uuid().optional(),
    department_id: z.string().uuid(),
    name: z.string().trim().min(1, "Dai un nome alla fascia.").max(40),
    start_time: ora,
    end_time: ora,
    required: z.number().int().min(1, "Serve almeno una persona.").max(99),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1, "Scegli almeno un giorno."),
    position: z.number().int().min(0).max(999),
  })
  .refine((v) => v.start_time !== v.end_time, {
    message: "L'ora di fine non può essere uguale a quella di inizio.",
    path: ["end_time"],
  });

export type FasciaInput = z.input<typeof fasciaSchema>;

export async function salvaFascia(input: FasciaInput): Promise<ActionResult> {
  const capo = await requireCapo();

  const parsed = fasciaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, ...campi } = parsed.data;

  const supabase = await createClient();
  const riga = {
    ...campi,
    // Ordinati e senza ripetizioni: l'insieme dei giorni non ha un ordine
    // suo, e salvarlo come capita renderebbe diverse due righe uguali.
    weekdays: [...new Set(campi.weekdays)].sort((a, b) => a - b),
    company_id: capo.company_id,
  };

  const { error } = id
    ? await supabase.from("coverage_bands").update(riga).eq("id", id)
    : await supabase.from("coverage_bands").insert(riga);

  if (error) return { ok: false, error: messaggioErrore(error) };

  revalidatePath("/supervisione");
  return { ok: true };
}

export async function eliminaFascia(id: string): Promise<ActionResult> {
  await requireCapo();

  const supabase = await createClient();
  const { error } = await supabase.from("coverage_bands").delete().eq("id", id);
  if (error) return { ok: false, error: messaggioErrore(error) };

  revalidatePath("/supervisione");
  return { ok: true };
}
