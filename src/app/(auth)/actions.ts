"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { destinazioneDi, getViewer } from "@/lib/auth";
import {
  azzera,
  consentito,
  LIMITI,
  provenienza,
  segna,
  TROPPI_TENTATIVI,
} from "@/lib/limite-tentativi";
import { createClient } from "@/lib/supabase/server";

/** Quanto dev'essere lunga una password scelta dalla persona.
 *
 *  Dieci e non otto: la lunghezza e' l'unica difesa che conta davvero contro
 *  chi prova a indovinare, e due caratteri in piu' moltiplicano il lavoro
 *  per qualche migliaio. Non si pretendono maiuscole e simboli: obbligarli
 *  produce «Password1!» su meta' delle scrivanie, che e' peggio di una frase
 *  lunga e facile da ricordare. */
const MINIMO_PASSWORD = 10;

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

  /* Provare all'infinito non si puo'. Due chiavi diverse: l'indirizzo, per
   * chi prende di mira una persona, e la provenienza, per chi prova la
   * stessa password su tutta l'azienda — quel secondo caso al primo limite
   * sfuggirebbe, perche' fa un tentativo solo per indirizzo. */
  const rete = await provenienza();
  const chiaveEmail = `accesso:${parsed.data.email}`;
  // null quando la provenienza non si sa: allora il limite per rete non si
  // applica affatto, invece di applicarsi a tutti insieme.
  const chiaveRete = rete ? `ip:${rete}` : null;

  const [okEmail, okRete] = await Promise.all([
    consentito(chiaveEmail, LIMITI.accesso),
    chiaveRete ? consentito(chiaveRete, LIMITI.accessoPerRete) : true,
  ]);
  if (!okEmail || !okRete) return { error: TROPPI_TENTATIVI };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    await Promise.all([segna(chiaveEmail), chiaveRete && segna(chiaveRete)]);
    // Volutamente generico: dire "questa email non esiste" permetterebbe a
    // chiunque di scoprire chi ha un account.
    return { error: "Email o password non corretti." };
  }

  // Entrato: il conto riparte. Chi sbaglia due volte e poi entra non deve
  // ritrovarsi a meta' del fido la settimana dopo.
  await azzera(chiaveEmail);

  // La destinazione si decide qui, non rimbalzando su "/": quel rimbalzo
  // era un giro intero di rete in piu', e sull'ingresso si sente tutto.
  redirect(destinazioneDi(await getViewer()));
}

/* ------------------------------------------------- password dimenticata */

const recuperoSchema = z.object({
  email: z.string().trim().toLowerCase().email("Indirizzo email non valido."),
});

/** Manda il link per rifarsi la password.
 *
 *  ⚠️ La risposta e' **sempre la stessa**, che l'indirizzo esista o no. Un
 *  «questo indirizzo non risulta» sarebbe comodo per chi ha sbagliato a
 *  scrivere, e sarebbe un elenco di chi lavora qui per chiunque altro: si
 *  provano indirizzi finche' uno non risponde diverso. E' la stessa regola
 *  dell'errore generico sull'accesso, e vale anche qui che scomodare la
 *  persona giusta costa meno che regalare quell'informazione.
 *
 *  Il link porta a /conferma, che e' l'unico punto in cui il codice della
 *  email diventa una sessione. */
export async function chiediRecuperoPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = recuperoSchema.safeParse({ email: formData.get("email") });
  // Un indirizzo scritto male si puo' dire: non rivela niente su chi c'e'
  // dentro, e chi ha sbagliato a digitare deve poterlo capire.
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const email = parsed.data.email;
  const rete = await provenienza();
  const chiave = `recupero:${email}`;
  const chiaveRete = rete ? `recupero-ip:${rete}` : null;

  const [okEmail, okRete] = await Promise.all([
    consentito(chiave, LIMITI.recupero),
    chiaveRete ? consentito(chiaveRete, LIMITI.accessoPerRete) : true,
  ]);
  if (!okEmail || !okRete) {
    return {
      error:
        "Hai gia' chiesto il recupero diverse volte. Controlla la posta, anche nello spam, e riprova fra un'ora.",
    };
  }

  // Qui si conta ogni richiesta, non solo quelle andate male: l'abuso e'
  // riempire di messaggi la casella di qualcuno che non ha chiesto niente.
  await Promise.all([segna(chiave), chiaveRete && segna(chiaveRete)]);

  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${proto}://${host}/conferma`,
  });

  // L'esito non si guarda di proposito: qualunque cosa risponda Supabase —
  // indirizzo sconosciuto compreso — da qui esce la stessa frase.
  return { ok: true };
}

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(MINIMO_PASSWORD, `La password deve avere almeno ${MINIMO_PASSWORD} caratteri.`),
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
    password: z
      .string()
      .min(MINIMO_PASSWORD, `La nuova password deve avere almeno ${MINIMO_PASSWORD} caratteri.`),
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
