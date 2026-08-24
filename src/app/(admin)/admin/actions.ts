"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const creaSchema = z.object({
  companyName: z.string().trim().min(2, "Inserisci il nome dell'azienda."),
  fullName: z.string().trim().min(2, "Inserisci nome e cognome del responsabile."),
  email: z.string().trim().toLowerCase().email("Indirizzo email non valido."),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri."),
});

/** Crea l'azienda e il suo primo responsabile in un colpo solo: un'azienda
 *  senza nessuno che possa entrarci non serve a niente. */
export async function creaAzienda(
  input: z.input<typeof creaSchema>,
): Promise<ActionResult> {
  await requirePlatformAdmin();

  const parsed = creaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { companyName, fullName, email, password } = parsed.data;

  const admin = createAdminClient();

  const { data: company, error: companyError } = await admin
    .from("companies")
    .insert({ name: companyName })
    .select("id")
    .single();

  if (companyError || !company) {
    return { ok: false, error: "Non è stato possibile creare l'azienda." };
  }

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
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
    id: created.user.id,
    company_id: company.id,
    full_name: fullName,
    email,
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

  revalidatePath("/admin");
  return { ok: true };
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
