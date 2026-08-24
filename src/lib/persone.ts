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
    /** Reparto principale: quello scritto accanto al nome. */
    department_id: z.string().uuid().nullable(),
    /** Tutti quelli in cui puo' lavorare. Il principale ci sta dentro. */
    reparti: z.array(z.string().uuid()).max(20),
    on_call: z.boolean(),
    contract_hours: z.number().min(0).max(80).nullable(),
  })
  .transform((v) => ({
    ...v,
    contract_hours: v.on_call ? null : v.contract_hours,
    // Il principale e' per forza fra quelli in cui lavora: non avrebbe senso
    // scrivere accanto al nome un reparto dove non mette piede.
    reparti: [
      ...new Set(v.department_id ? [v.department_id, ...v.reparti] : v.reparti),
    ],
  }));

/** Riscrive i reparti di una persona. Si cancella e si riscrive invece di
 *  calcolare le differenze: sono al massimo una manciata di righe, e il
 *  codice che le confronta e' il posto dove nascono i doppioni. */
export async function sincronizzaReparti(profileId: string, reparti: string[]) {
  const admin = createAdminClient();
  await admin.from("profile_departments").delete().eq("profile_id", profileId);
  if (reparti.length === 0) return null;
  const { error } = await admin
    .from("profile_departments")
    .insert(reparti.map((department_id) => ({ profile_id: profileId, department_id })));
  return error;
}

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

  const { reparti, ...campi } = parsed.data;

  const { data: creati, error } = await admin
    .from("profiles")
    .insert(
      nuovi.map((nome) => ({
        company_id: companyId,
        user_id: null,
        full_name: nome,
        email: null,
        role: "dipendente" as const,
        must_change_password: false,
        ...campi,
      })),
    )
    .select("id");

  if (error) return { ok: false, error: error.message };

  if (reparti.length > 0 && creati) {
    await admin.from("profile_departments").insert(
      creati.flatMap((p) =>
        reparti.map((department_id) => ({ profile_id: p.id, department_id })),
      ),
    );
  }

  return { ok: true, creati: nuovi.length, nomi: nuovi };
}
