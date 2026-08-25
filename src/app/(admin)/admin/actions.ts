"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth";
import { creaPersoneDaElenco } from "@/lib/persone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const creaSchema = z.object({
  companyName: z.string().trim().min(2, "Inserisci il nome dell'azienda."),
  /** Facoltativo: l'azienda si puo' creare vuota e popolarla dopo. */
  responsabile: z
    .object({
      fullName: z.string().trim().min(2, "Inserisci nome e cognome del responsabile."),
      email: z.string().trim().toLowerCase().email("Indirizzo email non valido."),
      password: z.string().min(5, "La password deve avere almeno 5 caratteri."),
    })
    .nullable(),
  /** Nomi separati da virgola, creati senza accesso. */
  elenco: z.string().max(8000).nullable(),
  /** Le impostazioni generali, scelte gia' alla nascita. Le causali
   *  richiedibili partono tutte accese: le rifinisce il responsabile. */
  impostazioni: z.object({
    supervisione_dipendenti: z.boolean(),
    conferma_straordinari: z.boolean(),
    conferma_modifiche: z.boolean(),
    orari_preimpostati: z.boolean(),
  }),
});

/** Crea l'azienda, e se glielo si chiede anche il suo primo responsabile e
 *  una squadra di persone senza accesso. Nessuna delle due cose e'
 *  obbligatoria: si puo' partire dall'azienda vuota e riempirla dopo. */
export async function creaAzienda(
  input: z.input<typeof creaSchema>,
): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = creaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { companyName, responsabile, elenco, impostazioni } = parsed.data;

  const admin = createAdminClient();

  const { data: company, error: companyError } = await admin
    .from("companies")
    .insert({ name: companyName })
    .select("id")
    .single();

  if (companyError || !company) {
    return {
      ok: false,
      error:
        companyError?.code === "23505"
          ? "Esiste già un'azienda con questo nome."
          : "Non è stato possibile creare l'azienda.",
    };
  }

  // Le impostazioni nascono insieme all'azienda. Se l'inserimento fallisse
  // non si butta via tutto: senza riga valgono i default, che sono gli
  // stessi valori di partenza di questo pannello.
  await admin
    .from("company_settings")
    .insert({ company_id: company.id, ...impostazioni });

  if (responsabile) {
    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email: responsabile.email,
      password: responsabile.password,
      email_confirm: true,
      user_metadata: { full_name: responsabile.fullName },
    });

    if (userError || !created.user) {
      await admin.from("companies").delete().eq("id", company.id);
      return {
        ok: false,
        error: userError?.message.toLowerCase().includes("already")
          ? "Esiste già un account con questa email."
          : "Non è stato possibile creare l'account del responsabile.",
      };
    }

    const { error: profileError } = await admin.from("profiles").insert({
      company_id: company.id,
      user_id: created.user.id,
      full_name: responsabile.fullName,
      email: responsabile.email,
      role: "capo",
      // La password gliela consegni tu: la cambia al primo accesso.
      must_change_password: true,
    });

    if (profileError) {
      // Niente account orfani: si torna indietro su tutto.
      await admin.auth.admin.deleteUser(created.user.id);
      await admin.from("companies").delete().eq("id", company.id);
      return { ok: false, error: "Non è stato possibile creare il profilo." };
    }
  }

  if (elenco && elenco.trim()) {
    const esito = await creaPersoneDaElenco(company.id, elenco, {
      department_id: null,
      reparti: [],
      on_call: false,
      contract_hours: null,
    });
    if (!esito.ok) {
      // L'azienda resta in piedi: l'elenco si ricarica, mentre buttare via
      // anche il responsabile appena creato per un nome scritto male
      // sarebbe peggio del problema.
      revalidatePath("/admin");
      return { ok: false, error: `Azienda creata, ma l'elenco no: ${esito.error}` };
    }
  }

  revalidatePath("/admin");
  return { ok: true };
}

/** Carica una squadra da un elenco di nomi separati da virgola. Le persone
 *  nascono senza accesso: l'email si da' dopo, e solo a chi serve. */
export async function creaPersoneInAzienda(companyId: string, elenco: string) {
  await requirePlatformAdmin();

  const esito = await creaPersoneDaElenco(companyId, elenco, {
    department_id: null,
    reparti: [],
    on_call: false,
    contract_hours: null,
  });

  if (esito.ok) {
    revalidatePath("/admin");
    revalidatePath("/squadra");
  }
  return esito;
}

export async function rinominaAzienda(
  id: string,
  name: string,
): Promise<ActionResult> {
  await requirePlatformAdmin();

  const trimmed = name.trim();
  if (trimmed.length < 2) return { ok: false, error: "Nome troppo corto." };

  // Client normale: e' RLS a stabilire che un amministratore puo' farlo.
  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ name: trimmed })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}

/** Elimina l'azienda con tutto quello che contiene. */
export async function eliminaAzienda(id: string): Promise<ActionResult> {
  const viewer = await requirePlatformAdmin();

  const supabase = await createClient();

  const { data: people, error: readError } = await supabase
    .from("profiles")
    .select("id")
    .eq("company_id", id);

  if (readError) return { ok: false, error: readError.message };

  if (people?.some((p) => p.id === viewer.userId)) {
    return {
      ok: false,
      error: "Fai parte di questa azienda: non puoi eliminarla da qui.",
    };
  }

  // Turni e profili se ne vanno per cascata insieme all'azienda.
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Gli account di accesso vivono in auth.users, che la cascata non tocca:
  // senza questo passaggio resterebbero login orfani, capaci di autenticarsi
  // ma senza piu' nessun profilo.
  const admin = createAdminClient();
  for (const person of people ?? []) {
    await admin.auth.admin.deleteUser(person.id);
  }

  revalidatePath("/admin");
  return { ok: true };
}

const accountSchema = z.object({
  company_id: z.string().uuid(),
  fullName: z.string().trim().min(2, "Inserisci nome e cognome."),
  email: z.string().trim().toLowerCase().email("Indirizzo email non valido."),
  password: z.string().min(5, "La password deve avere almeno 5 caratteri."),
  role: z.enum(["capo", "dipendente"]),
});

/** Crea un account dentro un'azienda, da amministratore.
 *
 *  E' la stessa cosa che fa il responsabile dalla sua Squadra, ma senza
 *  passare da lui: serve per rimettere in piedi un'azienda che e' rimasta
 *  senza nessuno che possa entrarci, o per aggiungere un secondo
 *  responsabile. */
export async function creaAccountInAzienda(
  input: z.input<typeof accountSchema>,
): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { company_id, fullName, email, password, role } = parsed.data;

  const admin = createAdminClient();

  // L'azienda deve esistere: senza questo controllo un identificativo
  // inventato creerebbe un account che non appartiene a nessuno.
  const { data: azienda } = await admin
    .from("companies")
    .select("id")
    .eq("id", company_id)
    .maybeSingle();

  if (!azienda) return { ok: false, error: "Azienda non trovata." };

  const { data: creato, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (userError || !creato.user) {
    return {
      ok: false,
      error: userError?.message.toLowerCase().includes("already")
        ? "Esiste già un account con questa email."
        : "Non è stato possibile creare l'account.",
    };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    company_id,
    user_id: creato.user.id,
    full_name: fullName,
    email,
    role,
    // La password gliela consegni tu: la cambia al primo accesso.
    must_change_password: true,
  });

  if (profileError) {
    // Niente account orfani: si torna indietro.
    await admin.auth.admin.deleteUser(creato.user.id);
    return { ok: false, error: "Non è stato possibile creare il profilo." };
  }

  revalidatePath("/admin");
  return { ok: true };
}

/** Assegna una nuova password provvisoria: da usare quando qualcuno la
 *  dimentica. Al primo accesso dovra' comunque cambiarla. */
export async function reimpostaPassword(
  profileId: string,
  password: string,
): Promise<ActionResult> {
  await requirePlatformAdmin();

  if (password.length < 8) {
    return { ok: false, error: "La password deve avere almeno 8 caratteri." };
  }

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

  revalidatePath("/admin");
  return { ok: true };
}
