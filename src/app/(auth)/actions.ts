"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string };

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

  // Da qui in poi decide la pagina: chi ha una password provvisoria finisce
  // su /cambia-password, un amministratore senza azienda su /admin.
  redirect("/");
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

export async function esci() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
