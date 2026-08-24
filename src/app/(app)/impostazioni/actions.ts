"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CODICI_CAUSALE } from "@/lib/assenze";
import { requireCapo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  supervisione_dipendenti: z.boolean(),
  causali_richiedibili: z
    .array(z.string().refine((v) => CODICI_CAUSALE.includes(v)))
    .min(1, "Lascia almeno una causale richiedibile."),
  conferma_straordinari: z.boolean(),
  conferma_modifiche: z.boolean(),
  conferma_modifiche_straordinari: z.boolean(),
  orari_preimpostati: z.boolean(),
});

export type ImpostazioniInput = z.input<typeof schema>;

export async function salvaImpostazioni(
  input: ImpostazioniInput,
): Promise<ActionResult> {
  const capo = await requireCapo();

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("company_settings").upsert({
    company_id: capo.company_id,
    ...parsed.data,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };

  // Le impostazioni cambiano cosa vedono gli altri: si ricaricano le pagine
  // che ci guardano dentro.
  revalidatePath("/impostazioni");
  revalidatePath("/supervisione");
  revalidatePath("/permessi");
  revalidatePath("/turni");
  return { ok: true };
}
