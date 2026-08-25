"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ETICHETTA } from "@/lib/assenze";
import { requireCapo, requireMember } from "@/lib/auth";
import { durationMinutes, hhmm } from "@/lib/date";
import {
  COLONNE_IMPOSTAZIONI,
  normalizzaImpostazioni,
} from "@/lib/impostazioni";
import { giorniCoinvolti, mondayOf, weekDaysISO } from "@/lib/week";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Esito di un salvataggio: l'id serve a chi tiene la storia delle
 *  modifiche (annulla/ripeti), `richiede` a contare quanti turni
 *  aspettano un si' dell'interessato. */
export type SalvaResult =
  | { ok: true; id: string; richiede: string | null }
  | { ok: false; error: string };

/** Se la settimana e' rimasta senza turni torna bozza da sola: una
 *  settimana svuotata non e' "pubblicata e vuota", e' da rifare. */
async function riportaInBozzaSeVuota(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  lunedi: string,
) {
  const giorni = weekDaysISO(lunedi);
  const { count } = await supabase
    .from("shifts")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .gte("date", giorni[0])
    .lte("date", giorni[6]);
  if (!count) {
    await supabase
      .from("published_weeks")
      .delete()
      .eq("company_id", companyId)
      .eq("monday", lunedi);
  }
}

const time = z.string().regex(/^\d{2}:\d{2}$/, "Orario non valido.");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida.");

const shiftSchema = z
  .object({
    id: z.string().uuid().optional(),
    profile_id: z.string().uuid().nullable(),
    // Reparto solo per questo turno: serve a dire "oggi copre in sala".
    // null = vale quello della persona.
    department_id: z.string().uuid().nullable(),
    date: day,
    start_time: time,
    end_time: time,
    title: z.string().trim().max(80).optional().or(z.literal("")),
    location: z.string().trim().max(80).optional().or(z.literal("")),
    notes: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((v) => v.start_time !== v.end_time, {
    message: "L'ora di fine non può essere uguale a quella di inizio.",
    path: ["end_time"],
  });

export type ShiftInput = z.input<typeof shiftSchema>;

/** Vuoto significa "non compilato", non stringa vuota: in colonna deve
 *  finire NULL, altrimenti le viste dovrebbero distinguere due casi identici. */
const orNull = (v?: string) => (v && v.trim() ? v.trim() : null);

export async function salvaTurno(input: ShiftInput): Promise<SalvaResult> {
  const user = await requireCapo();

  const parsed = shiftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const v = parsed.data;

  const supabase = await createClient();

  // Il turno com'era, se esiste. Serve a due cose: la data di prima —
  // spostarlo di settimana puo' lasciare vuota quella vecchia, che allora
  // torna bozza — e a capire che cosa e' cambiato davvero.
  let prima: {
    date: string;
    start_time: string;
    end_time: string;
    profile_id: string | null;
    department_id: string | null;
  } | null = null;
  if (v.id) {
    const { data: vecchio } = await supabase
      .from("shifts")
      .select("date, start_time, end_time, profile_id, department_id")
      .eq("id", v.id)
      .maybeSingle();
    prima = vecchio ?? null;
  }
  const dataPrima = prima?.date ?? null;

  /** Di questo turno e' cambiato solo il reparto: stessa persona, stesso
   *  giorno, stessi orari. E' il caso di chi oggi copre in sala invece che
   *  in cassa, e di suo non chiede niente a nessuno — le ore sono quelle. */
  const soloReparto =
    prima !== null &&
    prima.date === v.date &&
    hhmm(prima.start_time) === v.start_time &&
    hhmm(prima.end_time) === v.end_time &&
    prima.profile_id === v.profile_id &&
    prima.department_id !== v.department_id;

  // A chi e' assente quel giorno un turno nuovo non si assegna: verrebbe al
  // mondo gia' "in trasparenza", non contato da nessuna parte, e chi lo ha
  // messo crederebbe di aver coperto un buco. I turni che esistevano gia'
  // quando l'assenza e' arrivata restano: sono loro il buco da coprire.
  if (v.profile_id) {
    const { data: assenza } = await supabase
      .from("absences")
      .select("type, start_date, end_date")
      .eq("profile_id", v.profile_id)
      .lte("start_date", v.date)
      .or(`end_date.is.null,end_date.gte.${v.date}`)
      .limit(1)
      .maybeSingle();
    if (assenza) {
      const fino = assenza.end_date
        ? ` fino al ${assenza.end_date.split("-").reverse().join("/")}`
        : ", senza data di rientro";
      return {
        ok: false,
        error: `Quel giorno la persona è assente (${ETICHETTA(assenza.type).toLowerCase()}${fino}): scegli un altro giorno o un'altra persona.`,
      };
    }
  }

  /* ------------------------------------------ serve un si' della persona?
   *
   *  Dipende dalle impostazioni dell'azienda. Le regole, in ordine:
   *  - se e' cambiato solo il reparto decide quello e basta: gli orari non
   *    si sono mossi, quindi le regole sulle ore non hanno niente da dire,
   *    e di suo un cambio di reparto non chiede niente;
   *  - modificare un turno di una settimana gia' pubblicata (non in bozza)
   *    va accettato — con due interruttori diversi a seconda che la
   *    modifica generi straordinario o no;
   *  - un turno nuovo che porta oltre le ore da contratto e' uno
   *    straordinario, e va accettato;
   *  - con gli orari preimpostati accesi, un turno con orario diverso da
   *    quello scritto sul contratto della persona va accettato.
   *  Ogni salvataggio ricalcola e azzera il si' precedente: accettare una
   *  cosa e ritrovarsene un'altra sarebbe peggio che riconfermare. */
  let richiede: string | null = null;
  if (v.profile_id) {
    const lunedi = mondayOf(v.date);
    const giorniSettimana = weekDaysISO(lunedi);

    const [impostazioniRes, personaRes, turniSettimanaRes, bozzaRes] =
      await Promise.all([
        supabase
          .from("company_settings")
          .select(COLONNE_IMPOSTAZIONI)
          .eq("company_id", user.company_id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("contract_hours, on_call, preset_start, preset_end")
          .eq("id", v.profile_id)
          .maybeSingle(),
        supabase
          .from("shifts")
          .select("id, start_time, end_time")
          .eq("profile_id", v.profile_id)
          .gte("date", giorniSettimana[0])
          .lte("date", giorniSettimana[6]),
        supabase
          .from("published_weeks")
          .select("monday")
          .eq("company_id", user.company_id)
          .eq("monday", lunedi)
          .maybeSingle(),
      ]);

    const imp = normalizzaImpostazioni(impostazioniRes.data as never);
    const persona = personaRes.data;
    const pubblicata = Boolean(bozzaRes.data);

    // Le ore della settimana com'era prima, senza il turno che si sta
    // salvando, piu' il turno nuovo: e' il totale che varra' dopo.
    const minutiAltri = (turniSettimanaRes.data ?? [])
      .filter((t) => t.id !== v.id)
      .reduce((n, t) => n + durationMinutes(t.start_time, t.end_time), 0);
    const minutiDopo = minutiAltri + durationMinutes(v.start_time, v.end_time);

    const straordinario =
      Boolean(persona) &&
      !persona!.on_call &&
      persona!.contract_hours !== null &&
      minutiDopo > Number(persona!.contract_hours) * 60;

    // "Settimana gia' turnata" = gia' pubblicata: prima della
    // pubblicazione il tabellone e' un foglio di lavoro, e correggerlo
    // non deve chiedere niente a nessuno.
    const modifica = Boolean(v.id) && pubblicata;

    const orarioDiverso =
      imp.orari_preimpostati &&
      Boolean(persona?.preset_start && persona?.preset_end) &&
      (v.start_time !== String(persona!.preset_start).slice(0, 5) ||
        v.end_time !== String(persona!.preset_end).slice(0, 5));

    if (soloReparto) {
      richiede = imp.conferma_cambio_reparto ? "cambio_reparto" : null;
    } else if (modifica && straordinario && imp.conferma_modifiche_straordinari) {
      richiede = "modifica_straordinario";
    } else if (modifica && !straordinario && imp.conferma_modifiche) {
      richiede = "modifica";
    } else if (!v.id && straordinario && imp.conferma_straordinari) {
      richiede = "straordinario";
    } else if (orarioDiverso) {
      richiede = "orario_diverso";
    }
  }

  const row = {
    company_id: user.company_id,
    profile_id: v.profile_id,
    department_id: v.department_id,
    date: v.date,
    start_time: v.start_time,
    end_time: v.end_time,
    title: orNull(v.title),
    location: orNull(v.location),
    notes: orNull(v.notes),
    richiede_conferma: richiede,
    confermato_at: null,
  };

  let id = v.id ?? "";
  if (v.id) {
    const { error } = await supabase.from("shifts").update(row).eq("id", v.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: creato, error } = await supabase
      .from("shifts")
      .insert({ ...row, created_by: user.id })
      .select("id")
      .single();
    if (error || !creato) return { ok: false, error: error?.message ?? "Salvataggio non riuscito." };
    id = creato.id;
  }

  if (dataPrima && mondayOf(dataPrima) !== mondayOf(v.date)) {
    await riportaInBozzaSeVuota(supabase, user.company_id, mondayOf(dataPrima));
  }

  revalidatePath("/turni");
  // Anche la Supervisione: da li' il responsabile modifica i turni.
  revalidatePath("/supervisione");
  return { ok: true, id, richiede };
}

export async function eliminaTurno(id: string): Promise<ActionResult> {
  const user = await requireCapo();

  const supabase = await createClient();

  // La data prima di cancellare: se era l'ultimo turno della settimana,
  // la settimana torna bozza.
  const { data: turno } = await supabase
    .from("shifts")
    .select("date")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (turno?.date) {
    await riportaInBozzaSeVuota(supabase, user.company_id, mondayOf(turno.date));
  }

  revalidatePath("/turni");
  // Anche la Supervisione: da li' il responsabile modifica i turni.
  revalidatePath("/supervisione");
  return { ok: true };
}

/** Un turno come torna indietro da uno svuotamento. Sono i campi che
 *  descrivono il turno, non il suo stato: le conferme non ci sono:
 *  vedi `ripristinaTurni`. */
export type TurnoRipristinabile = {
  profile_id: string | null;
  department_id: string | null;
  date: string;
  start_time: string; // HH:MM
  end_time: string;
  title: string | null;
  location: string | null;
  notes: string | null;
};

/** Oltre questa soglia lo svuotamento non promette il ritorno indietro: una
 *  settimana cosi' non si rimette in piedi con un solo insert, e promettere
 *  un annullamento che poi fallisce e' peggio che non prometterlo. Duemila
 *  turni sono un tabellone da trecento persone: nessuna azienda vera ci
 *  arriva, ma il limite dev'esserci. */
const MAX_RIPRISTINO = 2000;

export type SvuotaResult =
  | {
      ok: true;
      /** I turni cancellati, per rimetterli. null se erano troppi: la
       *  settimana e' comunque svuotata, ma senza rete. */
      ritratto: TurnoRipristinabile[] | null;
    }
  | { ok: false; error: string };

/** Svuota la settimana, bozza o pubblicata che sia. Vuota, torna bozza:
 *  la conferma la chiede l'interfaccia, qui si esegue e basta.
 *
 *  Restituisce i turni che ha cancellato, ed e' il server a fotografarli
 *  proprio mentre li toglie: il tabellone che il browser ha in mano puo'
 *  essere di dieci minuti fa, e rimettere in piedi quello cancellerebbe in
 *  silenzio i turni aggiunti nel frattempo da un altro responsabile. */
export async function eliminaTuttiITurni(monday: string): Promise<SvuotaResult> {
  const user = await requireCapo();

  const parsed = day.safeParse(monday);
  if (!parsed.success) return { ok: false, error: "Data non valida." };
  const lunedi = mondayOf(parsed.data);
  const giorni = weekDaysISO(lunedi);

  const supabase = await createClient();
  const { data: cancellati, error } = await supabase
    .from("shifts")
    .delete()
    .eq("company_id", user.company_id)
    .gte("date", giorni[0])
    .lte("date", giorni[6])
    .select("profile_id, department_id, date, start_time, end_time, title, location, notes");
  if (error) return { ok: false, error: error.message };

  await supabase
    .from("published_weeks")
    .delete()
    .eq("company_id", user.company_id)
    .eq("monday", lunedi);

  revalidatePath("/turni");
  revalidatePath("/supervisione");

  const righe = cancellati ?? [];
  return {
    ok: true,
    ritratto:
      righe.length === 0 || righe.length > MAX_RIPRISTINO
        ? null
        : righe.map((t) => ({
            ...t,
            // In colonna gli orari hanno i secondi, lo schema li vuole senza.
            start_time: hhmm(t.start_time),
            end_time: hhmm(t.end_time),
          })),
  };
}

/** I turni che tornano indietro. Le lunghezze sono larghe e i messaggi in
 *  italiano perche' qui non si sta compilando un modulo: sono righe che il
 *  database aveva gia' accettato, e rifiutarle ora vorrebbe dire perdere una
 *  settimana per una nota di troppo. */
const ripristinoSchema = z.object({
  monday: day,
  turni: z
    .array(
      z.object({
        profile_id: z.string().uuid().nullable(),
        department_id: z.string().uuid().nullable(),
        date: day,
        start_time: time,
        end_time: time,
        title: z.string().max(2000, "Mansione troppo lunga.").nullable(),
        location: z.string().max(2000, "Luogo troppo lungo.").nullable(),
        notes: z.string().max(5000, "Note troppo lunghe.").nullable(),
      }),
    )
    .min(1, "Non c'è niente da rimettere.")
    .max(MAX_RIPRISTINO, "Troppi turni da rimettere in una volta."),
});

export type RipristinoInput = z.input<typeof ripristinoSchema>;

/** Rimette in piedi i turni di una settimana svuotata: e' quello che fa la
 *  freccia indietro dopo «Svuota».
 *
 *  Tre cose che non fa, tutte volute. Non ricrea le conferme: il si' di un
 *  dipendente lo scrive solo lui, dalla funzione `conferma_turno`, e un
 *  responsabile non deve poterlo dichiarare al posto suo — la settimana
 *  torna comunque bozza, dove le conferme non servono. Non ripubblica la
 *  settimana, per la stessa ragione per cui svuotarla la riporta in bozza.
 *  E non controlla le assenze come fa `salvaTurno`: quei turni esistevano
 *  gia', e il turno di chi e' assente e' proprio il buco da tenere in vista. */
export async function ripristinaTurni(input: RipristinoInput): Promise<ActionResult> {
  const user = await requireCapo();

  const parsed = ripristinoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const lunedi = mondayOf(parsed.data.monday);
  const giorni = weekDaysISO(lunedi);

  // I turni tornano nella settimana da cui sono stati tolti, non altrove.
  if (parsed.data.turni.some((t) => t.date < giorni[0] || t.date > giorni[6])) {
    return { ok: false, error: "Ci sono turni fuori dalla settimana da rimettere." };
  }

  const supabase = await createClient();

  // Solo su una settimana ancora vuota. Fra lo svuotamento e la freccia
  // indietro ci si puo' aver copiato dentro un'altra settimana, o averla
  // rifatta a mano: rimettere il vecchio tabellone sopra il nuovo darebbe
  // un doppione, e nessuno saprebbe piu' quale dei due vale.
  const { count } = await supabase
    .from("shifts")
    .select("id", { count: "exact", head: true })
    .eq("company_id", user.company_id)
    .gte("date", giorni[0])
    .lte("date", giorni[6]);
  if (count) {
    return {
      ok: false,
      error:
        "La settimana non è più vuota: i turni di prima non si rimettono sopra quelli nuovi.",
    };
  }

  const { error } = await supabase.from("shifts").insert(
    parsed.data.turni.map((t) => ({
      ...t,
      company_id: user.company_id,
      created_by: user.id,
    })),
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/turni");
  revalidatePath("/supervisione");
  return { ok: true };
}

/* ------------------------------------------------------------- copia ---- */

const copiaSchema = z.object({
  modo: z.enum(["settimana", "giorno"]),
  da: day,
  a: day,
  sovrascrivi: z.boolean(),
});

export type CopiaInput = z.input<typeof copiaSchema>;

export type Anteprima = { origine: number; destinazione: number };

/** Quanti turni ci sono nell'origine e quanti ne verrebbero travolti nella
 *  destinazione. Serve a mostrare i numeri veri prima di premere, invece di
 *  far scoprire dopo che si e' cancellato qualcosa. */
export async function anteprimaCopia(
  input: CopiaInput,
): Promise<{ ok: true; dati: Anteprima } | { ok: false; error: string }> {
  const user = await requireCapo();

  const parsed = copiaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { modo, da, a } = parsed.data;

  const supabase = await createClient();

  const conta = async (giorni: string[]) => {
    const { count } = await supabase
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", user.company_id)
      .in("date", giorni);
    return count ?? 0;
  };

  return {
    ok: true,
    dati: {
      origine: await conta(giorniCoinvolti(modo, da)),
      destinazione: await conta(giorniCoinvolti(modo, a)),
    },
  };
}

export type CopiaResult =
  | { ok: true; copiati: number; sostituiti: number; vaiA: string }
  | { ok: false; error: string };

/** Copia i turni da una settimana (o da un giorno) a un'altra.
 *
 *  Per una settimana la corrispondenza e' per posizione: il lunedi' finisce
 *  sul lunedi', non a distanza di sette giorni per volta — cosi' funziona
 *  anche saltando avanti di mesi. */
export async function copiaTurni(input: CopiaInput): Promise<CopiaResult> {
  const user = await requireCapo();

  const parsed = copiaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { modo, da, a, sovrascrivi } = parsed.data;

  const origine = giorniCoinvolti(modo, da);
  const destinazione = giorniCoinvolti(modo, a);

  if (origine[0] === destinazione[0]) {
    return { ok: false, error: "Origine e destinazione sono la stessa cosa." };
  }

  const supabase = await createClient();

  const { data: turni, error } = await supabase
    .from("shifts")
    .select("profile_id, department_id, date, start_time, end_time, title, location, notes")
    .eq("company_id", user.company_id)
    .in("date", origine);

  if (error) return { ok: false, error: error.message };
  if (!turni || turni.length === 0) {
    return {
      ok: false,
      error:
        modo === "settimana"
          ? "La settimana da copiare è vuota."
          : "Il giorno da copiare è vuoto.",
    };
  }

  let sostituiti = 0;
  if (sovrascrivi) {
    const { count, error: deleteError } = await supabase
      .from("shifts")
      .delete({ count: "exact" })
      .eq("company_id", user.company_id)
      .in("date", destinazione);

    if (deleteError) return { ok: false, error: deleteError.message };
    sostituiti = count ?? 0;
  }

  const righe = turni.map((t) => {
    const posizione = origine.indexOf(t.date);
    return {
      ...t,
      company_id: user.company_id,
      created_by: user.id,
      date: destinazione[posizione] ?? destinazione[0],
    };
  });

  const { error: insertError } = await supabase.from("shifts").insert(righe);
  if (insertError) return { ok: false, error: insertError.message };

  revalidatePath("/turni");
  revalidatePath("/supervisione");
  return {
    ok: true,
    copiati: righe.length,
    sostituiti,
    vaiA: destinazione[0],
  };
}

/* ------------------------------------------------------ pubblicazione --- */

/** Pubblica una settimana. Ogni settimana nasce bozza — i dipendenti non
 *  la vedono — e lo resta finche' il responsabile non preme Pubblica: da
 *  li' in poi e' visibile, e le modifiche seguono le regole di conferma. */
export async function pubblicaSettimana(monday: string): Promise<ActionResult> {
  const user = await requireCapo();

  const parsed = day.safeParse(monday);
  if (!parsed.success) return { ok: false, error: "Data non valida." };
  const lunedi = mondayOf(parsed.data);

  const supabase = await createClient();
  const { error } = await supabase
    .from("published_weeks")
    .upsert({ company_id: user.company_id, monday: lunedi });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/turni");
  revalidatePath("/supervisione");
  return { ok: true };
}

/** Il si' del dipendente su un turno che lo richiede. Passa da una funzione
 *  SECURITY DEFINER: l'unica cosa che puo' toccare e' la conferma del
 *  proprio turno, non gli orari. */
export async function confermaTurno(id: string): Promise<ActionResult> {
  await requireMember();

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "Turno non valido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("conferma_turno", { turno: parsed.data });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/turni");
  return { ok: true };
}
