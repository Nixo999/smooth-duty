"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapo } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  creaPersoneDaElenco,
  sincronizzaReparti,
  type RapportoInput,
} from "@/lib/persone";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

function aggiorna() {
  revalidatePath("/squadra");
  revalidatePath("/turni");
  revalidatePath("/supervisione");
  revalidatePath("/prospetto");
}

/** Ore da contratto e "a chiamata" sono la stessa domanda posta in due modi:
 *  chi è a chiamata non ha un monte ore da rispettare. Tenere le due cose
 *  separate lascerebbe salvare "a chiamata con 20 ore", che non vuol dire
 *  niente e poi va interpretato da qualche parte. */
const rapporto = z
  .object({
    department_id: z.string().uuid().nullable(),
    reparti: z.array(z.string().uuid()).max(20),
    on_call: z.boolean(),
    contract_hours: z.number().min(0).max(80).nullable(),
  })
  .transform((v) => ({
    ...v,
    contract_hours: v.on_call ? null : v.contract_hours,
    reparti: [
      ...new Set(v.department_id ? [v.department_id, ...v.reparti] : v.reparti),
    ],
  }));

/** L'accesso è facoltativo. Una persona può stare in squadra, andare in
 *  turno e comparire nei conti senza mai entrare nell'app: su un tabellone
 *  da trenta persone, pretendere trenta indirizzi email prima di poter
 *  scrivere il primo turno è un ostacolo senza ragione. */
const accesso = z
  .object({
    email: z.string().trim().toLowerCase().email("Indirizzo email non valido."),
    password: z.string().min(5, "La password deve avere almeno 5 caratteri."),
  })
  .nullable();

const nuovoSchema = z
  .object({
    fullName: z.string().trim().min(2, "Inserisci nome e cognome."),
    role: z.enum(["capo", "dipendente"]),
    accesso,
  })
  .and(rapporto)
  .refine((v) => v.accesso !== null || v.role !== "capo", {
    message: "Un responsabile deve poter entrare: dagli anche un accesso.",
    path: ["accesso"],
  });

export async function aggiungiPersona(
  input: z.input<typeof nuovoSchema>,
): Promise<ActionResult> {
  const capo = await requireCapo();

  const parsed = nuovoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { fullName, role, accesso: credenziali, reparti, ...campi } = parsed.data;

  const admin = createAdminClient();

  let userId: string | null = null;
  if (credenziali) {
    const { data: creato, error } = await admin.auth.admin.createUser({
      email: credenziali.email,
      password: credenziali.password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !creato.user) {
      return {
        ok: false,
        error: error?.message.toLowerCase().includes("already")
          ? "Esiste già un account con questa email."
          : "Non è stato possibile creare l'accesso.",
      };
    }
    userId = creato.user.id;
  }

  const { data: creata, error: profileError } = await admin
    .from("profiles")
    .insert({
      company_id: capo.company_id,
      user_id: userId,
      full_name: fullName,
      email: credenziali?.email ?? null,
      role,
      ...campi,
      // Chi non ha un accesso non ha una password da cambiare.
      must_change_password: userId !== null,
    })
    .select("id")
    .single();

  if (profileError || !creata) {
    if (userId) await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: "Non è stato possibile creare la persona." };
  }

  await sincronizzaReparti(creata.id, reparti);

  aggiorna();
  return { ok: true };
}

/** Aggiunge piu' persone in una volta, da un elenco di nomi separati da
 *  virgola. Nessuna di loro ha un accesso: si da' dopo, a chi serve. */
export async function aggiungiPersoneDaElenco(
  elenco: string,
  rapportoBase: RapportoInput,
) {
  const capo = await requireCapo();
  const esito = await creaPersoneDaElenco(capo.company_id, elenco, rapportoBase);
  if (esito.ok) aggiorna();
  return esito;
}

/** Dà l'accesso a chi è già in squadra ma finora non entrava nell'app. */
export async function creaAccesso(
  profileId: string,
  email: string,
  password: string,
): Promise<ActionResult> {
  const capo = await requireCapo();

  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().email("Indirizzo email non valido."),
      password: z.string().min(5, "La password deve avere almeno 5 caratteri."),
    })
    .safeParse({ email, password });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: persona } = await supabase
    .from("profiles")
    .select("id, full_name, user_id, company_id")
    .eq("id", profileId)
    .maybeSingle();

  if (!persona || persona.company_id !== capo.company_id) {
    return { ok: false, error: "Persona non trovata." };
  }
  if (persona.user_id) {
    return { ok: false, error: "Questa persona ha già un accesso." };
  }

  const admin = createAdminClient();
  const { data: creato, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: persona.full_name },
  });

  if (error || !creato.user) {
    return {
      ok: false,
      error: error?.message.toLowerCase().includes("already")
        ? "Esiste già un account con questa email."
        : "Non è stato possibile creare l'accesso.",
    };
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      user_id: creato.user.id,
      email: parsed.data.email,
      must_change_password: true,
    })
    .eq("id", profileId);

  if (updateError) {
    await admin.auth.admin.deleteUser(creato.user.id);
    return { ok: false, error: updateError.message };
  }

  aggiorna();
  return { ok: true };
}

const modificaSchema = z
  .object({
    id: z.string().uuid(),
    fullName: z.string().trim().min(2, "Inserisci nome e cognome."),
    role: z.enum(["capo", "dipendente"]),
    active: z.boolean(),
  })
  .and(rapporto);

export async function modificaPersona(
  input: z.input<typeof modificaSchema>,
): Promise<ActionResult> {
  const capo = await requireCapo();

  const parsed = modificaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, fullName, role, active, reparti, ...campi } = parsed.data;

  const supabase = await createClient();

  // Un responsabile puo' smettere di esserlo, purche' ne resti un altro:
  // il vincolo vero non e' "non toccare te stesso", e' che l'azienda non
  // rimanga senza nessuno che possa gestirla.
  if (id === capo.id && (role !== "capo" || !active)) {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("company_id", capo.company_id)
      .eq("role", "capo")
      .eq("active", true)
      .neq("id", capo.id);

    if (!count) {
      return {
        ok: false,
        error:
          "Sei l'unico responsabile: nominane un altro prima di togliere a te stesso il ruolo.",
      };
    }
  }

  // Un responsabile deve poter entrare: promuovere qualcuno che non ha un
  // accesso creerebbe un'azienda con un capo che non puo' accedervi.
  if (role === "capo") {
    const { data: persona } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("id", id)
      .maybeSingle();
    if (persona && !persona.user_id) {
      return {
        ok: false,
        error: "Per fare qualcuno responsabile devi prima dargli un accesso.",
      };
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, role, active, ...campi })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  const errore = await sincronizzaReparti(id, reparti);
  if (errore) return { ok: false, error: errore.message };

  aggiorna();
  return { ok: true };
}

/** Nuova password provvisoria, per quando qualcuno la dimentica.
 *  Al primo accesso dovra' comunque sceglierne una sua. */
export async function reimpostaPassword(
  profileId: string,
  password: string,
): Promise<ActionResult> {
  const capo = await requireCapo();

  if (password.length < 5) {
    return { ok: false, error: "La password deve avere almeno 5 caratteri." };
  }
  if (profileId === capo.id) {
    return {
      ok: false,
      error: "Per la tua password usa il cambio password, non questo.",
    };
  }

  // La lettura passa da RLS: se la persona fosse di un'altra azienda non
  // tornerebbe niente, ed e' quel controllo ad autorizzare il passo dopo.
  const supabase = await createClient();
  const { data: persona } = await supabase
    .from("profiles")
    .select("id, user_id")
    .eq("id", profileId)
    .maybeSingle();

  if (!persona) return { ok: false, error: "Persona non trovata." };
  if (!persona.user_id) {
    return { ok: false, error: "Questa persona non ha un accesso da reimpostare." };
  }

  const { error: flagError } = await supabase
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", profileId);
  if (flagError) return { ok: false, error: flagError.message };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(persona.user_id, {
    password,
  });
  if (error) return { ok: false, error: error.message };

  aggiorna();
  return { ok: true };
}

export async function rimuoviPersona(id: string): Promise<ActionResult> {
  const capo = await requireCapo();
  if (id === capo.id) {
    return { ok: false, error: "Non puoi eliminare te stesso." };
  }

  const supabase = await createClient();
  const { data: persona } = await supabase
    .from("profiles")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!persona) return { ok: false, error: "Persona non trovata." };

  const { error, count } = await supabase
    .from("profiles")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "Persona non trovata." };

  // L'account di accesso vive in auth.users e non viene toccato dal delete
  // sopra: va rimosso a parte, altrimenti resterebbe un login orfano.
  if (persona.user_id) {
    const admin = createAdminClient();
    await admin.auth.admin.deleteUser(persona.user_id);
  }

  aggiorna();
  return { ok: true };
}
