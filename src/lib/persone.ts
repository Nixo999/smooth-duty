import "server-only";
import { z } from "zod";
import { nomiDaElenco } from "@/lib/elenco";
import { createAdminClient } from "@/lib/supabase/admin";

/** Creazione di persone in blocco, condivisa fra il pannello del
 *  responsabile e quello dell'amministratore.
 *
 *  Sta qui e non in un file "use server" di proposito: là dentro ogni
 *  funzione esportata diventa un punto di ingresso chiamabile dal browser, e
 *  una che accetta l'azienda come parametro sarebbe un modo per scrivere
 *  dentro l'azienda di qualcun altro. Chi la chiama ha già controllato di
 *  averne il diritto. */

export const rapportoSchema = z
  .object({
    department_id: z.string().uuid().nullable(),
    on_call: z.boolean(),
    contract_hours: z.number().min(0).max(80).nullable(),
  })
  .transform((v) => ({
    ...v,
    contract_hours: v.on_call ? null : v.contract_hours,
  }));

export type RapportoInput = z.input<typeof rapportoSchema>;

export type EsitoElenco =
  | { ok: true; creati: number; nomi: string[] }
  | { ok: false; error: string };

export async function creaPersoneDaElenco(
  companyId: string,
  elenco: string,
  rapporto: RapportoInput,
): Promise<EsitoElenco> {
  const parsed = rapportoSchema.safeParse(rapporto);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const nomi = nomiDaElenco(elenco);

  if (nomi.length === 0) {
    return { ok: false, error: "Nell'elenco non c'è nessun nome." };
  }
  if (nomi.length > 200) {
    return { ok: false, error: "Troppi nomi in una volta sola (massimo 200)." };
  }

  const admin = createAdminClient();

  // Chi c'è già non si duplica: incollare due volte lo stesso elenco è la
  // cosa più facile del mondo, e ritrovarsi la squadra doppia è un guaio da
  // ripulire a mano.
  const { data: esistenti } = await admin
    .from("profiles")
    .select("full_name")
    .eq("company_id", companyId);

  const gia = new Set(
    (esistenti ?? []).map((p) => p.full_name.toLowerCase().replace(/\s+/g, " ")),
  );
  const nuovi = nomi.filter((n) => !gia.has(n.toLowerCase()));

  if (nuovi.length === 0) {
    return { ok: false, error: "Sono già tutti in squadra." };
  }

  const { error } = await admin.from("profiles").insert(
    nuovi.map((nome) => ({
      company_id: companyId,
      user_id: null,
      full_name: nome,
      email: null,
      role: "dipendente" as const,
      must_change_password: false,
      ...parsed.data,
    })),
  );

  if (error) return { ok: false, error: error.message };

  return { ok: true, creati: nuovi.length, nomi: nuovi };
}
