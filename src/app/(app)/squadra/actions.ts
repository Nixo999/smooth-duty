"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapo } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Ore da contratto e "a chiamata" sono la stessa domanda posta in due modi:
 *  chi è a chiamata non ha un monte ore da rispettare. Tenere le due cose
 *  separate lascerebbe salvare "a chiamata con 20 ore", che non vuol dire
 *  niente e poi va interpretato da qualche parte. */
const rapporto = z
  .object({
    department_id: z.string().uuid().nullable(),
    on_call: z.boolean(),
    contract_hours: z.number().min(0).max(80).nullable(),
  })
  .transform((v) => ({
    ...v,
    contract_hours: v.on_call ? null : v.contract_hours,
  }));

const nuovoSchema = z
  .object({
    fullName: z.string().trim().min(2, "Inserisci nome e cognome."),
    email: z.string().trim().toLowerCase().email("Indirizzo email non valido."),
    password: z.string().min(8, "La password deve avere almeno 8 caratteri."),
    role: z.enum(["capo", "dipendente"]),
  })
  .and(rapporto);

/** Crea l'account del dipendente gia' confermato, cosi' puo' entrare subito
 *  con le credenziali che il responsabile gli consegna. La password e'
 *  provvisoria: al primo accesso l'app lo obbliga a sceglierne una sua. */
export async function aggiungiPersona(
  input: z.input<typeof nuovoSchema>,
): Promise<ActionResult> {
  const capo = await requireCapo();

  const parsed = nuovoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { fullName, email, password, role, department_id, contract_hours, on_call } =
    parsed.data;

  const admin = createAdminClient();

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (userError || !created.user) {
    return {
      ok: false,
      error: userError?.message.toLowerCase().includes("already")
        ? "Esiste già un account con questa email."
        : "Non è stato possibile creare l'account.",
    };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    company_id: capo.company_id,
    full_name: fullName,
    email,
    role,
    department_id,
    contract_hours,
    on_call,
    // La password gliela consegni tu: la cambia al primo accesso.
    must_change_password: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: "Non è stato possibile creare il profilo." };
  }

  revalidatePath("/squadra");
  revalidatePath("/turni");
  revalidatePath("/supervisione");
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
  const { id, fullName, role, active, department_id, contract_hours, on_call } =
    parsed.data;

  // Se il capo togliesse a se stesso il ruolo o l'accesso, l'azienda
  // resterebbe senza nessuno che puo' gestirla.
  if (id === capo.id && (role !== "capo" || !active)) {
    return { ok: false, error: "Non puoi togliere a te stesso i permessi." };
  }

  // Client normale, non admin: RLS garantisce che la persona sia della
  // stessa azienda senza doverlo ricontrollare a mano.
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      role,
      active,
      department_id,
      contract_hours,
      on_call,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/squadra");
  revalidatePath("/turni");
  revalidatePath("/supervisione");
  return { ok: true };
}

/** Nuova password provvisoria, per quando qualcuno la dimentica.
 *  Al primo accesso dovra' comunque sceglierne una sua. */
export async function reimpostaPassword(
  profileId: string,
  password: string,
): Promise<ActionResult> {
  const capo = await requireCapo();

  if (password.length < 8) {
    return { ok: false, error: "La password deve avere almeno 8 caratteri." };
  }
  if (profileId === capo.id) {
    return {
      ok: false,
      error: "Per la tua password usa il cambio password, non questo.",
    };
  }

  // L'update passa da RLS: se la persona fosse di un'altra azienda non
  // toccherebbe nessuna riga, ed e' quel conteggio ad autorizzare il passo
  // successivo con la chiave che scavalca le regole.
  const supabase = await createClient();
  const { error: flagError, count } = await supabase
    .from("profiles")
    .update({ must_change_password: true }, { count: "exact" })
    .eq("id", profileId);

  if (flagError) return { ok: false, error: flagError.message };
  if (!count) return { ok: false, error: "Persona non trovata." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(profileId, { password });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/squadra");
  return { ok: true };
}

export async function rimuoviPersona(id: string): Promise<ActionResult> {
  const capo = await requireCapo();
  if (id === capo.id) {
    return { ok: false, error: "Non puoi eliminare il tuo stesso account." };
  }

  // La cancellazione del profilo passa da RLS, quindi fallisce se la persona
  // e' di un'altra azienda: e' il controllo che autorizza il passo dopo.
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("profiles")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "Persona non trovata." };

  // L'account di accesso vive in auth.users e non viene toccato dal delete
  // sopra: va rimosso a parte, altrimenti resterebbe un login orfano.
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(id);

  revalidatePath("/squadra");
  revalidatePath("/turni");
  revalidatePath("/supervisione");
  return { ok: true };
}
