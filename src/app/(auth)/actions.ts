"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { destinazioneDi, getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** `ok` lo usa solo il cambio password volontario: le altre azioni finiscono
 *  con un redirect, e chi resta sulla pagina ha bisogno di sapere che è
 *  andata bene per chiudersi il pannello da sola. */
export type FormState = { error?: string; ok?: boolean };

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Indirizzo email non valido."),
  password: z.string().min(1, "Inserisci la password."),
});

export async function accedi(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Volutamente generico: dire "questa email non esiste" permetterebbe a
    // chiunque di scoprire chi ha un account.
    return { error: "Email o password non corretti." };
  }

  // La destinazione si decide qui, non rimbalzando su "/": quel rimbalzo
  // era un giro intero di rete in piu', e sull'ingresso si sente tutto.
  redirect(destinazioneDi(await getViewer()));
}

const passwordSchema = z
  .object({
    password: z.string().min(8, "La password deve avere almeno 8 caratteri."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Le due password non coincidono.",
    path: ["confirm"],
  });

export async function cambiaPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return {
      error: error.message.toLowerCase().includes("different")
        ? "Scegli una password diversa da quella provvisoria."
        : "Non è stato possibile salvare la password.",
    };
  }

  // Il flag lo abbassa una funzione SECURITY DEFINER: dare all'utente il
  // permesso di scrivere su profiles gli lascerebbe cambiare anche il ruolo.
  const { error: flagError } = await supabase.rpc("mark_password_changed");
  if (flagError) {
    return { error: "Password cambiata, ma il profilo non si è aggiornato." };
  }

  redirect("/turni");
}

const miaPasswordSchema = z
  .object({
    attuale: z.string().min(1, "Scrivi la password che usi adesso."),
    password: z.string().min(8, "La nuova password deve avere almeno 8 caratteri."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Le due password non coincidono.",
    path: ["confirm"],
  })
  .refine((v) => v.password !== v.attuale, {
    message: "La nuova password è uguale a quella di adesso.",
    path: ["password"],
  });

/** Il cambio password voluto, quello che si può fare in qualsiasi momento.
 *  È un'altra cosa da `cambiaPassword`, che serve solo al primo accesso.
 *
 *  Qui si chiede anche la password di adesso e la si verifica rifacendo
 *  l'accesso: Supabase da solo non la controlla, e senza quel passaggio
 *  chiunque trovasse aperta l'app di un collega — su un telefono lasciato
 *  sul bancone — potrebbe prendersi il suo account in tre secondi.
 *
 *  Il flag `must_change_password` non si tocca: chi ce l'ha alzato non
 *  arriva nemmeno a vedere questo pannello, viene mandato prima alla pagina
 *  che glielo abbassa. */
export async function cambiaLaMiaPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = miaPasswordSchema.safeParse({
    attuale: formData.get("attuale"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const { error: accessoError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.attuale,
  });
  if (accessoError) {
    return { error: "La password di adesso non è corretta." };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return {
      error: error.message.toLowerCase().includes("different")
        ? "Scegli una password diversa da quella di adesso."
        : "Non è stato possibile salvare la password.",
    };
  }

  return { ok: true };
}

export async function esci() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
