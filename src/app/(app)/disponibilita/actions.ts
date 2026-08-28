"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { oggiCivile } from "@/lib/date";
import { versoDelRegime } from "@/lib/disponibilita";
import type { VersoDichiarazione } from "@/lib/disponibilita";
import {
  COLONNE_IMPOSTAZIONI,
  normalizzaImpostazioni,
} from "@/lib/impostazioni";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida.");
const time = z.string().regex(/^\d{2}:\d{2}$/, "Orario non valido.");

const segnaSchema = z
  .object({
    profile_id: z.string().uuid(),
    // Il tetto non è prudenza burocratica: si segna un mese alla volta, e
    // un elenco più lungo di così è un errore del browser, non una persona
    // che sa quando lavora fra sei mesi.
    giorni: z.array(day).min(1, "Non hai scelto nessun giorno.").max(120),
    // O tutt'e due o nessuno: mezza fascia diventerebbe «da mezzanotte»
    // senza che nessuno l'abbia detto.
    dalle: time.nullable().default(null),
    alle: time.nullable().default(null),
    nota: z.string().trim().max(200).optional(),
  })
  .refine((v) => (v.dalle === null) === (v.alle === null), {
    message: "Servono tutt'e due gli orari, o nessuno dei due.",
    path: ["alle"],
  })
  .refine((v) => v.dalle === null || v.dalle !== v.alle, {
    message: "L'ora di fine non può essere uguale a quella di inizio.",
    path: ["alle"],
  });

export type SegnaInput = z.input<typeof segnaSchema>;

/** Chi può scrivere su questo calendario, e in che verso.
 *
 *  Tre controlli e non uno solo, perché sono tre cose diverse che possono
 *  andare storte: il regime dell'azienda (sotto `on_demand` il calendario
 *  non esiste), chi sta scrivendo (l'interessato o il responsabile) e su chi
 *  (solo chi è a chiamata: a chi ha un monte ore questo calendario non
 *  direbbe niente, e sarebbe una seconda disciplina addosso alla stessa
 *  persona). */
type Permesso =
  | { ok: true; verso: VersoDichiarazione }
  | { ok: false; error: string };

async function permesso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; company_id: string; role: string },
  profileId: string,
): Promise<Permesso> {
  const { data: riga } = await supabase
    .from("company_settings")
    .select(COLONNE_IMPOSTAZIONI)
    .eq("company_id", user.company_id)
    .maybeSingle();
  const verso = versoDelRegime(normalizzaImpostazioni(riga as never).regime_chiamata);

  if (!verso) {
    return {
      ok: false,
      error:
        "Con «Chiedi ogni volta» il calendario non si usa: i turni si propongono e si accettano uno per uno.",
    };
  }
  if (user.role !== "capo" && profileId !== user.id) {
    return { ok: false, error: "Puoi segnare solo la tua disponibilità." };
  }

  const { data: persona } = await supabase
    .from("profiles")
    .select("on_call")
    .eq("id", profileId)
    .eq("company_id", user.company_id)
    .maybeSingle();

  if (!persona) return { ok: false, error: "Questa persona non è in squadra." };
  if (!persona.on_call) {
    return {
      ok: false,
      error:
        "Questo calendario è di chi lavora a chiamata. Chi ha un contratto a ore ha già le sue ore scritte in scheda.",
    };
  }
  return { ok: true, verso };
}

/** Segna dei giorni — tutto il giorno, o una fascia di ore.
 *
 *  Il verso non lo sceglie chi scrive: lo decide il regime dell'azienda, e
 *  viene scritto sulla riga. Cambiando regime queste dichiarazioni restano e
 *  smettono di contare, invece di rovesciarsi di senso in silenzio. */
export async function segnaDisponibilita(input: SegnaInput): Promise<ActionResult> {
  const user = await requireMember();

  const parsed = segnaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;

  const supabase = await createClient();
  const esito = await permesso(supabase, user, v.profile_id);
  if (!esito.ok) return esito;
  const { verso } = esito;

  // Il passato non si dichiara: quel giorno o è stato lavorato o non lo è
  // stato. Il controllo è anche nelle policy del database — è lì che vale
  // sempre — ma qui si può dire perché, invece di lasciar sparire delle
  // righe senza spiegazioni.
  const oggi = oggiCivile();
  const giorni = [...new Set(v.giorni)].filter((g) => g >= oggi);
  if (giorni.length === 0) {
    return { ok: false, error: "Quei giorni sono già passati: non c'è più niente da dire." };
  }

  const { data: gia } = await supabase
    .from("availability_days")
    .select("id, giorno, dalle, alle")
    .eq("company_id", user.company_id)
    .eq("profile_id", v.profile_id)
    .eq("verso", verso)
    .in("giorno", giorni);

  const esistenti = gia ?? [];

  if (v.dalle === null) {
    // «Tutto il giorno» copre qualunque fascia già scritta su quel giorno:
    // tenerle vorrebbe dire due righe che dicono la stessa cosa, e chi
    // legge il calendario si chiederebbe quale delle due vale.
    const daTogliere = esistenti.map((r) => r.id);
    if (daTogliere.length > 0) {
      await supabase.from("availability_days").delete().in("id", daTogliere);
    }
    const { error } = await supabase.from("availability_days").insert(
      giorni.map((giorno) => ({
        company_id: user.company_id,
        profile_id: v.profile_id,
        giorno,
        dalle: null,
        alle: null,
        verso,
        nota: v.nota?.trim() || null,
        creato_da: user.id,
      })),
    );
    if (error) return { ok: false, error: error.message };
  } else {
    // Una fascia su un giorno già dichiarato intero non aggiunge niente, e
    // una identica sarebbe un doppione: in tutti e due i casi il giorno si
    // salta invece di far fallire l'intero salvataggio per una riga.
    const intero = new Set(
      esistenti.filter((r) => r.dalle === null).map((r) => r.giorno),
    );
    const uguale = new Set(
      esistenti
        .filter(
          (r) =>
            r.dalle !== null &&
            String(r.dalle).slice(0, 5) === v.dalle &&
            String(r.alle).slice(0, 5) === v.alle,
        )
        .map((r) => r.giorno),
    );
    const nuovi = giorni.filter((g) => !intero.has(g) && !uguale.has(g));
    if (nuovi.length === 0) {
      return { ok: false, error: "Quelle ore erano già segnate." };
    }
    const { error } = await supabase.from("availability_days").insert(
      nuovi.map((giorno) => ({
        company_id: user.company_id,
        profile_id: v.profile_id,
        giorno,
        dalle: v.dalle,
        alle: v.alle,
        verso,
        nota: v.nota?.trim() || null,
        creato_da: user.id,
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/disponibilita");
  // Il tabellone disegna queste caselle, e la Supervisione ci passa sopra
  // quando il responsabile aggiusta un turno da lì.
  revalidatePath("/turni");
  revalidatePath("/supervisione");
  return { ok: true };
}

const togliSchema = z.object({
  profile_id: z.string().uuid(),
  giorni: z.array(day).min(1).max(120),
});

export type TogliInput = z.input<typeof togliSchema>;

/** Toglie tutto quello che è scritto su quei giorni, nel verso in vigore.
 *
 *  Si cancella per giorno e non per riga: chi ripensa a un giovedì lo pensa
 *  intero — «quel giorno posso, lascia stare quello che avevo detto» — e
 *  fargli togliere una fascia per volta sarebbe fargli rifare a mano un
 *  conto che ha già in testa. Le dichiarazioni dell'altro verso non si
 *  toccano: sono la storia di un accordo precedente, e non è questo il
 *  gesto per cancellarla. */
export async function togliDisponibilita(input: TogliInput): Promise<ActionResult> {
  const user = await requireMember();

  const parsed = togliSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;

  const supabase = await createClient();
  const esito = await permesso(supabase, user, v.profile_id);
  if (!esito.ok) return esito;

  const oggi = oggiCivile();
  const giorni = [...new Set(v.giorni)].filter((g) => g >= oggi);
  if (giorni.length === 0) {
    return { ok: false, error: "Quei giorni sono già passati: non c'è più niente da togliere." };
  }

  const { error } = await supabase
    .from("availability_days")
    .delete()
    .eq("company_id", user.company_id)
    .eq("profile_id", v.profile_id)
    .eq("verso", esito.verso)
    .in("giorno", giorni);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/disponibilita");
  revalidatePath("/turni");
  revalidatePath("/supervisione");
  return { ok: true };
}
