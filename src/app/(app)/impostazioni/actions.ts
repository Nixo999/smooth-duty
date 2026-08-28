"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CODICI_CAUSALE } from "@/lib/assenze";
import { requireCapo } from "@/lib/auth";
import { REGIMI_CHIAMATA } from "@/lib/disponibilita";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  conferma_straordinari: z.boolean(),
  conferma_modifiche: z.boolean(),
  orari_preimpostati: z.boolean(),
  conferma_cambio_reparto: z.boolean(),
  conferma_settimana: z.boolean(),
  // I tre valori arrivano dall'elenco che definisce anche il tipo: una
  // seconda copia scritta qui a mano si sarebbe scollata al primo regime
  // nuovo, e l'unica altra copia che resta e' il vincolo del database.
  regime_chiamata: z.enum(REGIMI_CHIAMATA),
  pagina_supervisione: z.boolean(),
  supervisione_dipendenti: z.boolean(),
  pagina_permessi: z.boolean(),
  causali_richiedibili: z
    .array(z.string().refine((v) => CODICI_CAUSALE.includes(v)))
    .min(1, "Lascia almeno una causale richiedibile."),
  pagina_prospetto: z.boolean(),
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

  // Le impostazioni cambiano cosa vedono gli altri, e ora anche quali pagine
  // esistono. Il menu sta nel layout, e un gruppo di route (`(app)`) non ha
  // un indirizzo suo da indicare qui: si invalida dalla radice, che porta
  // con se' i layout annidati e le loro pagine. E' il martello grosso, ma le
  // impostazioni si salvano una volta ogni tanto, e mezza app che conosce le
  // regole nuove e mezza no sarebbe peggio.
  revalidatePath("/", "layout");
  return { ok: true };
}
