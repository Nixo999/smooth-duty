"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ETICHETTA } from "@/lib/assenze";
import { requireCapo, requireMember } from "@/lib/auth";
import { messaggioErrore } from "@/lib/errori";
import { dayLong, durationMinutes, formatDuration, fromISODate, hhmm } from "@/lib/date";
import { esitoAssegnazione, spiegaBlocco, versoDelRegime } from "@/lib/disponibilita";
import type { Dichiarazione } from "@/lib/disponibilita";
import { minutiPerPersona, siLavoreraDavvero } from "@/lib/ore-effettive";
import { chiStaSottoContratto } from "@/lib/pubblicazione";
import type { SottoContratto } from "@/lib/pubblicazione";
import {
  COLONNE_IMPOSTAZIONI,
  normalizzaImpostazioni,
} from "@/lib/impostazioni";
import { addDays, giorniCoinvolti, mondayOf, weekDaysISO } from "@/lib/week";
import { createClient } from "@/lib/supabase/server";
import { conseguenzaDelSalvataggio } from "@/lib/conferme";
import { MOTIVI_RIFIUTO } from "@/lib/types";
import type { MotivoAvviso, MotivoRifiuto, StatoTurno } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Pubblicare può non riuscire per un motivo che non è un errore: qualcuno
 *  sta sotto le sue ore da contratto. Allora arriva anche l'elenco, perché
 *  la schermata possa mostrarlo e chiedere se procedere lo stesso. */
export type PubblicaResult =
  | { ok: true }
  | { ok: false; error: string; sotto?: SottoContratto[] };

/** Esito di un salvataggio: l'id serve a chi tiene la storia delle
 *  modifiche (annulla/ripeti), `richiede` a contare quanti turni sono
 *  preapprovati — valgono subito, ma l'interessato li può rifiutare — e
 *  `avviso` quanti hanno solo avvertito qualcuno. I due si escludono: o si
 *  chiede o si informa, mai tutti e due sullo stesso salvataggio. */
export type SalvaResult =
  | { ok: true; id: string; richiede: string | null; avviso: MotivoAvviso | null }
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

/** Un turno com'era: la fotografia che permette di rimetterlo dov'era.
 *  `profile_id` è facoltativo perché le fotografie scattate prima che ci
 *  fosse non lo portano; quelle tornano alla persona che il turno ce l'ha
 *  adesso, che è il meglio che se ne può fare. */
const statoSchema = z.object({
  profile_id: z.string().nullable().optional(),
  date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  department_id: z.string().nullable(),
  title: z.string().nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
});

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

/** «Il turno che avevi non ce l'hai più»: l'avviso di chi perde un turno,
 *  perché è stato cancellato o passato a un altro.
 *
 *  È il caso in cui un avviso serve di più e in cui è più facile
 *  dimenticarlo: il turno sparisce dal tabellone, e con lui l'unica cosa che
 *  avrebbe potuto dirlo. Chi lo perde non ha niente da concedere — non gli
 *  si chiede un permesso — ma se ne accorgerebbe soltanto presentandosi.
 *
 *  Silenzio se la settimana è ancora in bozza (nessuno l'ha mai vista) o se
 *  l'azienda ha spento le conferme sulle modifiche. */
async function avvisaChiPerdeIlTurno(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  turno: {
    id: string;
    profile_id: string | null;
    date: string;
    start_time: string;
    end_time: string;
    department_id: string | null;
    title: string | null;
    location: string | null;
    notes: string | null;
  },
  opzioni: { cancellato: boolean },
) {
  if (!turno.profile_id) return; // un turno scoperto non toglie niente a nessuno

  const lunedi = mondayOf(turno.date);
  const [impRes, pubblicataRes] = await Promise.all([
    supabase
      .from("company_settings")
      .select(COLONNE_IMPOSTAZIONI)
      .eq("company_id", companyId)
      .maybeSingle(),
    supabase
      .from("published_weeks")
      .select("monday")
      .eq("company_id", companyId)
      .eq("monday", lunedi)
      .maybeSingle(),
  ]);

  if (!pubblicataRes.data) return;
  if (!normalizzaImpostazioni(impRes.data as never).conferma_modifiche) return;

  await supabase.from("shift_notices").insert({
    company_id: companyId,
    profile_id: turno.profile_id,
    // Cancellando il turno il riferimento si azzera da solo
    // (on delete set null): l'avviso resta, ed è quello che conta.
    shift_id: opzioni.cancellato ? null : turno.id,
    motivo: "turno_rimosso",
    giorno: turno.date,
    turno_prima: {
      profile_id: turno.profile_id,
      date: turno.date,
      start_time: hhmm(turno.start_time),
      end_time: hhmm(turno.end_time),
      department_id: turno.department_id,
      title: turno.title,
      location: turno.location,
      notes: turno.notes,
    },
    turno_dopo: null,
  });
}

/** Le dichiarazioni di disponibilità delle persone indicate, sui giorni
 *  indicati, raccolte per persona.
 *
 *  Si legge un giorno in più della coda: un turno 22:00–06:00 occupa anche
 *  la mattina dopo, e chi ha detto «sabato non posso» non è disponibile
 *  nemmeno per le sei ore di sabato che nascono dal venerdì.
 *
 *  Restituisce una mappa vuota quando non c'è niente da chiedere — nessuna
 *  persona a chiamata, o un regime che il calendario non lo usa — perché la
 *  domanda giusta da non fare è quella che non serve. */
async function dichiarazioniDi(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  profileIds: string[],
  giorni: string[],
): Promise<Map<string, Dichiarazione[]>> {
  const per = new Map<string, Dichiarazione[]>();
  if (profileIds.length === 0 || giorni.length === 0) return per;

  const ordinati = [...giorni].sort();
  const { data } = await supabase
    .from("availability_days")
    .select("profile_id, giorno, dalle, alle, verso")
    .eq("company_id", companyId)
    .in("profile_id", profileIds)
    .gte("giorno", ordinati[0])
    .lte("giorno", addDays(ordinati[ordinati.length - 1], 1));

  for (const r of data ?? []) {
    const lista = per.get(r.profile_id);
    const riga = {
      giorno: r.giorno,
      dalle: r.dalle,
      alle: r.alle,
      verso: r.verso,
    } as Dichiarazione;
    if (lista) lista.push(riga);
    else per.set(r.profile_id, [riga]);
  }
  return per;
}

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
    title: string | null;
    location: string | null;
    notes: string | null;
    stato_prima: unknown;
    confermato_at: string | null;
  } | null = null;
  if (v.id) {
    const { data: vecchio } = await supabase
      .from("shifts")
      .select(
        "date, start_time, end_time, profile_id, department_id, title, location, notes, stato_prima, confermato_at",
      )
      .eq("id", v.id)
      .maybeSingle();
    prima = vecchio ?? null;
  }
  const dataPrima = prima?.date ?? null;

  /** Il turno e' passato a un altro. Per chi lo riceve e' un turno nuovo —
   *  non ha un «prima» da confrontare, e infatti le sue ore vanno guardate
   *  come quelle di una nuova assegnazione — mentre per chi lo perde e'
   *  l'avviso piu' importante che ci sia. */
  const cambioPersona =
    prima !== null && prima.profile_id !== null && prima.profile_id !== v.profile_id;

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

  /* ------------------------- la persona lo puo' rifiutare? e per quale
   *  ragione?
   *
   *  Il turno vale comunque: qui si decide solo se ha qualcosa di
   *  particolare da segnalare all'interessato, che allora ha la facolta' di
   *  dire di no. Dipende dalle impostazioni dell'azienda; le regole, in
   *  ordine:
   *  - se e' cambiato solo il reparto decide quello e basta: gli orari non
   *    si sono mossi, quindi le regole sulle ore non hanno niente da dire,
   *    e di suo un cambio di reparto non si segnala nemmeno;
   *  - modificare un turno di una settimana gia' pubblicata (non in bozza)
   *    si puo' rifiutare — con due interruttori diversi a seconda che la
   *    modifica generi straordinario o no;
   *  - un turno nuovo che porta oltre le ore da contratto e' uno
   *    straordinario, e si puo' rifiutare;
   *  - con gli orari preimpostati accesi, un turno con orario diverso da
   *    quello scritto sul contratto della persona si puo' rifiutare.
   *  Ogni salvataggio ricalcola da capo e cancella il no precedente: un no
   *  dato a una versione non vale per quella dopo, che l'interessato non ha
   *  ancora visto. */
  let richiede: string | null = null;
  let avviso: MotivoAvviso | null = null;
  if (v.profile_id) {
    const lunedi = mondayOf(v.date);
    const giorniSettimana = weekDaysISO(lunedi);

    const [impostazioniRes, personaRes, turniSettimanaRes, assenzeRes, bozzaRes] =
      await Promise.all([
        supabase
          .from("company_settings")
          .select(COLONNE_IMPOSTAZIONI)
          .eq("company_id", user.company_id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("full_name, contract_hours, on_call, preset_start, preset_end")
          .eq("id", v.profile_id)
          .maybeSingle(),
        supabase
          .from("shifts")
          // `date` e `rifiutato_at` servono al conto delle ore effettive:
          // un turno rifiutato, o di un giorno in cui la persona è assente,
          // non lo fa nessuno e non porta ore. Vedi `lib/ore-effettive.ts`.
          .select("id, date, start_time, end_time, rifiutato_at")
          .eq("profile_id", v.profile_id)
          .gte("date", giorniSettimana[0])
          .lte("date", giorniSettimana[6]),
        supabase
          .from("absences")
          .select("id, profile_id, start_date, end_date")
          .eq("company_id", user.company_id)
          .eq("profile_id", v.profile_id)
          .lte("start_date", giorniSettimana[6])
          .or(`end_date.is.null,end_date.gte.${giorniSettimana[0]}`),
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

    /* --------------------------- chi e' a chiamata ha detto quando puo'
     *
     *  Sotto `indisponibilita` e `disponibilita` il calendario del
     *  lavoratore non e' un promemoria: e' l'accordo, e un turno che lo
     *  scavalca non si scrive. Il controllo sta qui e non in un trigger
     *  per la stessa ragione per cui ci sta quello delle assenze poco
     *  sopra — non e' un vincolo di integrita' dei dati, e' una regola che
     *  l'azienda ha scelto e puo' cambiare — e perche' cosi' chi ha premuto
     *  Salva legge una frase italiana invece di un errore di Postgres.
     *
     *  Sotto `on_demand` non c'e' niente da controllare: li' il calendario
     *  non esiste, e la domanda si fa dopo, al lavoratore. */
    if (persona?.on_call && versoDelRegime(imp.regime_chiamata)) {
      const dichiarazioni = await dichiarazioniDi(
        supabase,
        user.company_id,
        [v.profile_id],
        [v.date],
      );
      const esito = esitoAssegnazione({
        regime: imp.regime_chiamata,
        aChiamata: true,
        turno: { date: v.date, start_time: v.start_time, end_time: v.end_time },
        dichiarazioni: dichiarazioni.get(v.profile_id) ?? [],
      });
      if (!esito.ok) {
        return {
          ok: false,
          error: spiegaBlocco(
            esito,
            persona.full_name,
            // Il giorno che ha fermato l'assegnazione, non quello scritto
            // sul turno: su un 22:00–06:00 sono due giorni diversi, e
            // scrivere quello sbagliato manda a cercare nel posto sbagliato.
            dayLong(fromISODate(esito.giorno)),
          ),
        };
      }
    }

    // Le ore della settimana com'era prima, senza il turno che si sta
    // salvando, piu' il turno nuovo: e' il totale che varra' dopo.
    //
    // Si contano solo le ore che qualcuno fara' davvero — stessa domanda del
    // monte ore a tabellone, del totale sul telefono e del Prospetto
    // (`lib/ore-effettive.ts`). Contando anche i turni rifiutati, il
    // tabellone poteva dare la persona sotto contratto e questo salvataggio
    // dichiarare lo stesso turno uno straordinario.
    const assenze = assenzeRes.data ?? [];
    const minutiAltri = (turniSettimanaRes.data ?? [])
      .filter(
        (t) =>
          t.id !== v.id &&
          siLavoreraDavvero({ ...t, profile_id: v.profile_id }, assenze),
      )
      .reduce((n, t) => n + durationMinutes(t.start_time, t.end_time), 0);
    const minutiDopo = minutiAltri + durationMinutes(v.start_time, v.end_time);

    const straordinario =
      Boolean(persona) &&
      !persona!.on_call &&
      persona!.contract_hours !== null &&
      minutiDopo > Number(persona!.contract_hours) * 60;

    const fuoriPreset =
      Boolean(persona?.preset_start && persona?.preset_end) &&
      (v.start_time !== String(persona!.preset_start).slice(0, 5) ||
        v.end_time !== String(persona!.preset_end).slice(0, 5));

    // La decisione sta in una funzione pura, non qui: la stessa domanda la
    // fanno l'eliminazione di un turno e — un domani — l'importazione, e
    // tre risposte diverse sarebbero tre comportamenti diversi per lo
    // stesso turno. Le regole per esteso in docs/04-regole.md.
    const conseguenza = conseguenzaDelSalvataggio({
      // Per chi lo riceve e' un turno nuovo, non una modifica del suo: il
      // suo «prima» su questo turno non esiste.
      prima: prima && !cambioPersona
        ? {
            date: prima.date,
            start_time: hhmm(prima.start_time),
            end_time: hhmm(prima.end_time),
            minuti: durationMinutes(prima.start_time, prima.end_time),
          }
        : null,
      dopo: {
        date: v.date,
        start_time: v.start_time,
        end_time: v.end_time,
        minuti: durationMinutes(v.start_time, v.end_time),
      },
      soloReparto,
      pubblicata,
      straordinario,
      fuoriPreset,
      aChiamata: Boolean(persona?.on_call),
      imp,
    });

    if (conseguenza.tipo === "rifiutabile") richiede = conseguenza.motivo;
    else if (conseguenza.tipo === "avviso") avviso = conseguenza.motivo;
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
    // Ogni salvataggio riapre la partita: un no dato alla versione di prima
    // non vale per questa, che l'interessato non ha ancora visto.
    rifiutato_at: null,
    nota_rifiuto: null,
    // Com'era, per poterci tornare se l'interessato rifiuta. Solo se c'e' una
    // facolta' di rifiuto e c'era gia' un turno: un turno nato adesso non ha
    // un "prima", e infatti rifiutarlo lo toglie invece di riportarlo.
    //
    // Quale fotografia si tiene, quando ce n'era gia' una:
    //
    // - se la versione di adesso l'interessato l'aveva accettata, e' lei lo
    //   stato buono, e si scatta una fotografia nuova: c'e' un si' esplicito
    //   su quegli orari, ed e' li' che deve riportare un rifiuto successivo;
    // - altrimenti si tiene quella vecchia. Due ritocchi di fila a un turno
    //   pubblicato — 09-17 diventa 10-18, poi 11-19 — non fanno del 10-18
    //   uno stato buono: e' una versione intermedia che nessuno ha mai visto
    //   ne' accettato, e tornare li' sarebbe tornare in nessun posto.
    stato_prima: !richiede
      ? null
      : prima
        ? prima.confermato_at || !prima.stato_prima
          ? {
              profile_id: prima.profile_id,
              date: prima.date,
              start_time: hhmm(prima.start_time),
              end_time: hhmm(prima.end_time),
              department_id: prima.department_id,
              title: prima.title,
              location: prima.location,
              notes: prima.notes,
            }
          : prima.stato_prima
        : null,
  };

  let id = v.id ?? "";
  if (v.id) {
    const { error } = await supabase.from("shifts").update(row).eq("id", v.id);
    if (error) return { ok: false, error: messaggioErrore(error) };
  } else {
    const { data: creato, error } = await supabase
      .from("shifts")
      .insert({ ...row, created_by: user.id })
      .select("id")
      .single();
    if (error || !creato) return { ok: false, error: messaggioErrore(error) };
    id = creato.id;
  }

  if (dataPrima && mondayOf(dataPrima) !== mondayOf(v.date)) {
    await riportaInBozzaSeVuota(supabase, user.company_id, mondayOf(dataPrima));
  }

  // Il buco lasciato da un rifiuto e' coperto: il compito si chiude da solo.
  // Solo su un turno nuovo, e uno per volta: correggere l'orario di un altro
  // turno della stessa persona nello stesso giorno non copre niente — chi fa
  // mattina e sera ha due turni e puo' averne rifiutato uno solo — e due
  // buchi nella stessa giornata vanno riempiti tutti e due.
  if (!v.id && v.profile_id) {
    const { data: compito } = await supabase
      .from("shift_messages")
      .select("id")
      .eq("company_id", user.company_id)
      .eq("profile_id", v.profile_id)
      .eq("giorno", v.date)
      .eq("esito", "da_rifare")
      .is("risolto_at", null)
      .order("creato_at")
      .limit(1)
      .maybeSingle();
    if (compito) {
      await supabase
        .from("shift_messages")
        .update({ risolto_at: new Date().toISOString() })
        .eq("id", compito.id);
    }
  }

  // Chi il turno lo aveva e non ce l'ha piu'.
  if (cambioPersona && prima) {
    await avvisaChiPerdeIlTurno(
      supabase,
      user.company_id,
      { ...prima, id },
      { cancellato: false },
    );
  }

  // L'avviso: le ore sono calate, o il turno si e' spostato a parita' di
  // ore. Non c'e' niente da concedere, quindi non si chiede niente — ma la
  // persona lo deve sapere, e lo saprà finche' non preme «ho letto».
  //
  // Va scritto **dopo** il salvataggio e non prima: se il salvataggio
  // fallisse, resterebbe in giro l'avviso di un cambiamento mai avvenuto, e
  // sarebbe l'unica traccia rimasta di un turno che invece e' ancora quello
  // di prima.
  if (avviso && v.profile_id && prima) {
    await supabase.from("shift_notices").insert({
      company_id: user.company_id,
      profile_id: v.profile_id,
      shift_id: id,
      motivo: avviso,
      // Il giorno di cui si parla e' quello di **prima**: e' li' che la
      // persona aveva in testa di lavorare, ed e' li' che deve cercare
      // quando legge l'avviso.
      giorno: prima.date,
      turno_prima: {
        profile_id: prima.profile_id,
        date: prima.date,
        start_time: hhmm(prima.start_time),
        end_time: hhmm(prima.end_time),
        department_id: prima.department_id,
        title: prima.title,
        location: prima.location,
        notes: prima.notes,
      },
      turno_dopo: {
        profile_id: v.profile_id,
        date: v.date,
        start_time: v.start_time,
        end_time: v.end_time,
        department_id: v.department_id,
        title: orNull(v.title),
        location: orNull(v.location),
        notes: orNull(v.notes),
      },
    });
  }

  revalidatePath("/turni");
  // Anche la Supervisione: da li' il responsabile modifica i turni.
  revalidatePath("/supervisione");
  return { ok: true, id, richiede, avviso };
}

export async function eliminaTurno(id: string): Promise<ActionResult> {
  const user = await requireCapo();

  const supabase = await createClient();

  // Il turno intero prima di cancellarlo, e non solo la data: serve alla
  // settimana che puo' tornare bozza, e serve a raccontare a chi lo perde
  // che cosa ha perso. Dopo il delete non c'e' piu' niente da leggere.
  const { data: turno } = await supabase
    .from("shifts")
    .select(
      "id, profile_id, date, start_time, end_time, department_id, title, location, notes",
    )
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) return { ok: false, error: messaggioErrore(error) };

  if (turno) {
    // Prima l'avviso, poi il ritorno in bozza: se la settimana si svuota,
    // torna bozza e i dipendenti non la vedono piu' — ma chi quel turno ce
    // l'aveva in testa merita comunque di sapere che non c'e' piu'.
    await avvisaChiPerdeIlTurno(supabase, user.company_id, turno, {
      cancellato: true,
    });
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
  /** Se quel turno era rifiutabile lo resta anche tornando indietro: la
   *  facoltà è del dipendente, e non deve dipendere da uno svuotamento
   *  fatto per sbaglio dal responsabile.
   *
   *  Le risposte già date non tornano invece indietro: quei turni sono
   *  stati cancellati per davvero, e questi sono turni nuovi che gli
   *  somigliano. Chi aveva accettato se lo ritrova «in attesa», e potrà
   *  ridirlo quando la settimana verrà ripubblicata. */
  richiede_conferma: MotivoRifiuto | null;
  stato_prima: StatoTurno | null;
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
    .select(
      "profile_id, department_id, date, start_time, end_time, title, location, notes, richiede_conferma, stato_prima",
    );
  if (error) return { ok: false, error: messaggioErrore(error) };

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
        : (righe.map((t) => ({
            ...t,
            // In colonna gli orari hanno i secondi, lo schema li vuole senza.
            start_time: hhmm(t.start_time),
            end_time: hhmm(t.end_time),
          })) as TurnoRipristinabile[]),
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
        richiede_conferma: z.enum(MOTIVI_RIFIUTO).nullable(),
        stato_prima: statoSchema.nullable(),
      }),
    )
    .min(1, "Non c'è niente da rimettere.")
    .max(MAX_RIPRISTINO, "Troppi turni da rimettere in una volta."),
});

export type RipristinoInput = z.input<typeof ripristinoSchema>;

/** Rimette in piedi i turni di una settimana svuotata: e' quello che fa la
 *  freccia indietro dopo «Svuota».
 *
 *  Riporta anche la facolta' di rifiuto e la fotografia di partenza: quella
 *  facolta' e' del dipendente, e non deve dipendere da uno svuotamento fatto
 *  per sbaglio dal responsabile. Non riporta invece i no gia' dati, che
 *  parlavano di turni che nel frattempo sono stati cancellati per davvero.
 *
 *  Non ripubblica la settimana, per la stessa ragione per cui svuotarla la
 *  riporta in bozza. E non controlla le assenze come fa `salvaTurno`: quei
 *  turni esistevano gia', e il turno di chi e' assente e' proprio il buco
 *  che va tenuto in vista. */
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
  if (error) return { ok: false, error: messaggioErrore(error) };

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
  | {
      ok: true;
      copiati: number;
      sostituiti: number;
      /** Quanti sono rimasti indietro perché la persona a chiamata quel
       *  giorno non è disponibile. Si dice, non si tace: una copia che
       *  scrive meno turni di quelli che ha letto e non lo racconta fa
       *  credere che la settimana sia completa. */
      saltati: number;
      vaiA: string;
    }
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

  if (error) return { ok: false, error: messaggioErrore(error) };
  if (!turni || turni.length === 0) {
    return {
      ok: false,
      error:
        modo === "settimana"
          ? "La settimana da copiare è vuota."
          : "Il giorno da copiare è vuoto.",
    };
  }

  /* --------------------- i turni che nella destinazione non si possono
   *  scrivere.
   *
   *  Le date cambiano, e con loro le disponibilità: chi era libero il
   *  giovedì della settimana copiata può aver segnato che il giovedì dopo
   *  non c'è. Si controlla **prima** di cancellare la destinazione, non
   *  dopo: con `sovrascrivi` acceso, scoprirlo dopo vorrebbe dire aver
   *  svuotato una settimana per riempirla a metà. */
  const perPosizione = (iso: string) =>
    destinazione[origine.indexOf(iso)] ?? destinazione[0];

  let saltati = 0;
  let daScrivere = turni;

  const { data: impRiga } = await supabase
    .from("company_settings")
    .select(COLONNE_IMPOSTAZIONI)
    .eq("company_id", user.company_id)
    .maybeSingle();
  const imp = normalizzaImpostazioni(impRiga as never);

  if (versoDelRegime(imp.regime_chiamata)) {
    const conPersona = [...new Set(turni.map((t) => t.profile_id).filter(Boolean))] as string[];
    const { data: persone } = conPersona.length
      ? await supabase.from("profiles").select("id, on_call").in("id", conPersona)
      : { data: [] };
    const aChiamata = new Set(
      (persone ?? []).filter((p) => p.on_call).map((p) => p.id),
    );

    if (aChiamata.size > 0) {
      const dichiarazioni = await dichiarazioniDi(
        supabase,
        user.company_id,
        [...aChiamata],
        destinazione,
      );
      daScrivere = turni.filter((t) => {
        if (!t.profile_id || !aChiamata.has(t.profile_id)) return true;
        const esito = esitoAssegnazione({
          regime: imp.regime_chiamata,
          aChiamata: true,
          turno: {
            date: perPosizione(t.date),
            start_time: hhmm(t.start_time),
            end_time: hhmm(t.end_time),
          },
          dichiarazioni: dichiarazioni.get(t.profile_id) ?? [],
        });
        if (!esito.ok) saltati++;
        return esito.ok;
      });
    }
  }

  if (daScrivere.length === 0) {
    return {
      ok: false,
      error:
        "Nessuno di questi turni si può copiare lì: le persone a chiamata " +
        "non sono disponibili in quei giorni. Non ho toccato niente.",
    };
  }

  let sostituiti = 0;
  if (sovrascrivi) {
    const { count, error: deleteError } = await supabase
      .from("shifts")
      .delete({ count: "exact" })
      .eq("company_id", user.company_id)
      .in("date", destinazione);

    if (deleteError) return { ok: false, error: messaggioErrore(deleteError) };
    sostituiti = count ?? 0;
  }

  const righe = daScrivere.map((t) => ({
    ...t,
    company_id: user.company_id,
    created_by: user.id,
    date: perPosizione(t.date),
  }));

  const { error: insertError } = await supabase.from("shifts").insert(righe);
  if (insertError) return { ok: false, error: messaggioErrore(insertError) };

  revalidatePath("/turni");
  revalidatePath("/supervisione");
  return {
    ok: true,
    copiati: righe.length,
    sostituiti,
    saltati,
    vaiA: destinazione[0],
  };
}

/* ------------------------------------------------------ pubblicazione --- */

/** Pubblica una settimana. Ogni settimana nasce bozza — i dipendenti non
 *  la vedono — e lo resta finche' il responsabile non preme Pubblica: da
 *  li' in poi e' visibile, e le modifiche seguono le regole di conferma. */
export async function pubblicaSettimana(
  monday: string,
  /** Il responsabile ha già visto chi sta sotto contratto e ha detto di
   *  procedere lo stesso. Non è un modo di aggirare il controllo: è il
   *  controllo che ha fatto il suo lavoro, cioè far vedere una cosa che
   *  altrimenti si sarebbe scoperta a fine mese. */
  forza = false,
): Promise<PubblicaResult> {
  const user = await requireCapo();

  const parsed = day.safeParse(monday);
  if (!parsed.success) return { ok: false, error: "Data non valida." };
  const lunedi = mondayOf(parsed.data);

  const supabase = await createClient();

  // Una settimana che a qualcuno dà **meno** ore di quelle che ha per
  // contratto si pubblica solo dopo averlo detto. In bozza non si dice
  // niente — è tutto il senso della bozza, si comincia da un foglio vuoto e
  // ci si arriva — ma pubblicare vuol dire dire alla squadra «questa è la
  // settimana», e un buco di ore così altrimenti si scopre a fine mese sulla
  // busta paga, quando rimediare costa molto di più.
  //
  // Si ferma e chiede, non vieta: i motivi buoni per una settimana corta
  // esistono — un rientro a metà settimana, un accordo con la persona — e un
  // divieto secco costringerebbe a inventarsi un'assenza che non c'è pur di
  // andare avanti.
  if (!forza) {
    const sotto = await chiStaSottoIlSuoContratto(supabase, user.company_id, lunedi);
    if (sotto.length > 0) {
      return { ok: false, error: riassuntoSottoContratto(sotto), sotto };
    }
  }

  const { error } = await supabase
    .from("published_weeks")
    .upsert({ company_id: user.company_id, monday: lunedi });
  if (error) return { ok: false, error: messaggioErrore(error) };

  await chiediLaSettimanaAChiDeveRispondere(supabase, user.company_id, lunedi);

  revalidatePath("/turni");
  revalidatePath("/supervisione");
  return { ok: true };
}

/** Chi sta sotto le sue ore da contratto, in questa settimana.
 *
 *  Il conto vero sta in `chiStaSottoContratto()` (`src/lib/pubblicazione.ts`),
 *  che è puro e si prova senza database: qui si leggono solo i dati.
 *
 *  Restituisce l'elenco e non una frase perché chi lo chiama ne fa due cose
 *  diverse — un riassunto da leggere e una schermata coi nomi uno sotto
 *  l'altro — e una frase già impacchettata si potrebbe solo mostrare. */
async function chiStaSottoIlSuoContratto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  lunedi: string,
): Promise<SottoContratto[]> {
  const giorni = weekDaysISO(lunedi);

  const [personeRes, turniRes, assenzeRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, contract_hours, on_call")
      .eq("company_id", companyId)
      .eq("active", true),
    supabase
      .from("shifts")
      // `rifiutato_at` serve al conto: un turno che la persona ha rifiutato
      // non porta le sue ore, e senza questa colonna la domanda si
      // risponderebbe da sola con un sì che non è vero.
      .select("profile_id, date, start_time, end_time, rifiutato_at")
      .eq("company_id", companyId)
      .gte("date", giorni[0])
      .lte("date", giorni[6]),
    supabase
      .from("absences")
      .select("id, profile_id, start_date, end_date")
      .eq("company_id", companyId)
      .lte("start_date", giorni[6])
      .or(`end_date.is.null,end_date.gte.${giorni[0]}`),
  ]);

  // Se non si riesce a leggere non si ferma niente: una domanda basata su
  // dati che non sono arrivati fermerebbe una settimana magari a posto, e
  // l'errore vero lo dirà comunque la pagina.
  if (personeRes.error || turniRes.error) return [];

  return chiStaSottoContratto({
    persone: personeRes.data ?? [],
    turni: turniRes.data ?? [],
    assenze: assenzeRes.data ?? [],
    giorni,
  });
}

/** La stessa cosa in una frase, per chi può solo leggere un errore: le altre
 *  Server Action, e chiunque chiami `pubblicaSettimana` da fuori. */
function riassuntoSottoContratto(sotto: SottoContratto[]): string {
  // Tre nomi bastano a far capire dove guardare; trenta sarebbero un muro.
  const primi = sotto
    .slice(0, 3)
    .map((s) => `${s.nome} (${formatDuration(s.mancano)} in meno)`)
    .join(", ");
  const altri = sotto.length - 3;

  return (
    `${primi}${altri > 0 ? ` e altre ${altri} persone` : ""} ` +
    `${sotto.length === 1 ? "ha" : "hanno"} meno ore di quelle del contratto.`
  );
}

/** Alla pubblicazione, chi deve rispondere riceve **una domanda sola sulla
 *  settimana**, non una per turno.
 *
 *  Un turno per volta è il modo giusto di chiedere una modifica in corsa, ed
 *  è il modo sbagliato di chiedere «questa settimana ti va bene?»: la
 *  risposta dipende dall'insieme. Chi vede otto richieste su otto turni non
 *  sta guardando la stessa cosa che gli si sta chiedendo, e per rispondere
 *  dovrebbe rifare a mente la somma che l'app ha già fatto.
 *
 *  Due ragioni, e sono due conversazioni diverse:
 *
 *  - **straordinario** — chi ha un monte ore e questa settimana lo sfonda.
 *    Nasce solo con `conferma_settimana` acceso;
 *  - **chiamata** — chi è a chiamata, sotto il regime `on_demand`, e in
 *    questa settimana ha almeno un turno. Qui non c'è una soglia da
 *    superare: la domanda è «ci sei», e si fa sempre.
 *
 *  Le due non si incontrano mai sulla stessa persona — chi è a chiamata un
 *  monte ore non ce l'ha — e stanno nella stessa funzione perché leggono le
 *  stesse tre cose: pubblicare una settimana non deve costare sei
 *  interrogazioni per farne due domande.
 *
 *  Non tocca i turni: restano validi e si vedono, come sempre da quando il
 *  verso è rovesciato. Quello che cambia è che la settimana si presenta in
 *  arancione finché la persona non si è espressa. */
async function chiediLaSettimanaAChiDeveRispondere(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  lunedi: string,
) {
  const { data: impRiga } = await supabase
    .from("company_settings")
    .select(COLONNE_IMPOSTAZIONI)
    .eq("company_id", companyId)
    .maybeSingle();
  const imp = normalizzaImpostazioni(impRiga as never);
  const aChiamataRispondono = imp.regime_chiamata === "on_demand";
  if (!imp.conferma_settimana && !aChiamataRispondono) return;

  const giorni = weekDaysISO(lunedi);
  const [personeRes, turniRes, assenzeRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, contract_hours, on_call, user_id")
      .eq("company_id", companyId)
      .eq("active", true),
    supabase
      .from("shifts")
      // `date` e `rifiutato_at` non sono di contorno: sono le due colonne che
      // dicono se quel turno lo fara' qualcuno. Senza la prima non si puo'
      // guardare l'assenza di quel giorno, senza la seconda un no gia' detto
      // conta come ore lavorate.
      .select("profile_id, date, start_time, end_time, rifiutato_at")
      .eq("company_id", companyId)
      .gte("date", giorni[0])
      .lte("date", giorni[6]),
    supabase
      .from("absences")
      .select("id, profile_id, start_date, end_date")
      .eq("company_id", companyId)
      .lte("start_date", giorni[6])
      .or(`end_date.is.null,end_date.gte.${giorni[0]}`),
  ]);

  // Le stesse ore che ha appena contato il controllo sotto contratto, dallo
  // stesso posto: erano due conti diversi, e con un click solo l'app poteva
  // dire «sta sotto le sue ore da contratto» e subito dopo chiedere alla
  // stessa persona di confermare uno straordinario.
  const minutiDi = minutiPerPersona(turniRes.data ?? [], assenzeRes.data ?? []);

  const domande = (personeRes.data ?? [])
    // Chi non entra nell'app non può rispondere, e una domanda che resta in
    // attesa per sempre farebbe sembrare la settimana non accettata da
    // qualcuno che non l'ha mai potuta guardare. Per chi è a chiamata questo
    // vale doppio: la chiamata gli è arrivata comunque, per telefono, e
    // l'app non deve fingere di avere una risposta che non avrà mai.
    .filter((p) => p.user_id)
    .flatMap((p) => {
      const minuti = minutiDi.get(p.id) ?? 0;
      const riga = { company_id: companyId, profile_id: p.id, monday: lunedi };

      if (p.on_call) {
        // Una settimana senza turni non è una chiamata: non c'è niente da
        // accettare, e chiedere «ci sei?» a chi non è stato messo da nessuna
        // parte è una domanda senza oggetto.
        if (!aChiamataRispondono || minuti === 0) return [];
        return [
          {
            ...riga,
            motivo: "chiamata",
            minuti_previsti: minuti,
            // Zero non è un dato mancante: chi è a chiamata un monte ore non
            // ce l'ha, ed è esattamente quello che il contratto dice.
            minuti_contratto: 0,
          },
        ];
      }

      if (!imp.conferma_settimana || p.contract_hours === null) return [];
      const contratto = Number(p.contract_hours) * 60;
      if (minuti <= contratto) return [];
      return [
        {
          ...riga,
          motivo: "straordinario",
          minuti_previsti: minuti,
          minuti_contratto: contratto,
        },
      ];
    });

  if (domande.length === 0) return;

  // `ignoreDuplicates`: ripubblicare la stessa settimana non rifà la domanda
  // a chi ha già risposto. Una risposta data è una posizione presa, e
  // riazzerarla perché il responsabile ha ritoccato il giovedì vorrebbe dire
  // chiedere due volte la stessa cosa alla stessa persona.
  await supabase
    .from("week_requests")
    .upsert(domande, { onConflict: "company_id,profile_id,monday", ignoreDuplicates: true });
}

/* -------------------------------------- il sì e il no del dipendente --- */

/** Il si' esplicito su un turno preapprovato.
 *
 *  Non serve a rendere valido il turno — lo e' gia' — ma a togliere il
 *  responsabile dal dubbio: senza, «non si e' ancora espresso» e «ha
 *  guardato ed e' d'accordo» si somigliano troppo. */
export async function accettaTurno(id: string): Promise<ActionResult> {
  await requireMember();

  const parsed = z.string().uuid("Turno non valido.").safeParse(id);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: preso, error } = await supabase.rpc("accetta_turno", {
    turno: parsed.data,
  });
  if (error) return { ok: false, error: messaggioErrore(error) };

  revalidatePath("/turni");
  if (!preso) {
    return {
      ok: false,
      error:
        "Su questo turno non c'è più niente da accettare: o hai già risposto, o il responsabile l'ha cambiato, o il giorno è passato.",
    };
  }

  revalidatePath("/supervisione");
  return { ok: true };
}

/* ------------------------------------------------- rifiuti e messaggi --- */

/** Il no del dipendente su un turno preapprovato.
 *
 *  Il turno vale gia': questo non e' un permesso mancato, e' una facolta'
 *  esercitata. Passa da una funzione SECURITY DEFINER perche' l'unica cosa
 *  che l'interessato puo' toccare del proprio turno e' questa — con un
 *  permesso di scrittura vero potrebbe riscriversi gli orari — ed e' la
 *  stessa funzione a lasciare il messaggio al responsabile. */
export async function rifiutaTurno(
  id: string,
  nota?: string,
): Promise<ActionResult> {
  await requireMember();

  const parsed = z
    .object({
      id: z.string().uuid("Turno non valido."),
      nota: z.string().trim().max(300, "Motivo troppo lungo.").optional(),
    })
    .safeParse({ id, nota });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: preso, error } = await supabase.rpc("rifiuta_turno", {
    turno: parsed.data.id,
    motivazione: parsed.data.nota ?? null,
  });
  if (error) return { ok: false, error: messaggioErrore(error) };

  // La funzione dice di no quando non c'e' piu' niente da rifiutare: il
  // responsabile ha gia' rimesso mano a quel turno, il no era gia' partito,
  // oppure il giorno e' passato. Dire lo stesso «fatto» sarebbe la bugia
  // peggiore: chi ha premuto conta su quel messaggio.
  if (!preso) {
    revalidatePath("/turni");
    return {
      ok: false,
      error:
        "Questo turno non si può più rifiutare: o l'hai già accettato, o il responsabile l'ha cambiato, o il giorno è passato.",
    };
  }

  revalidatePath("/turni");
  revalidatePath("/supervisione");
  return { ok: true };
}

/** Apre i messaggi mai visti e ne applica l'effetto.
 *
 *  E' qui che il rifiuto diventa una cosa vera, non quando il dipendente
 *  preme: il responsabile deve poter vedere cos'e' successo nello stesso
 *  momento in cui succede, altrimenti si troverebbe il tabellone cambiato
 *  senza sapere ne' quando ne' perche'.
 *
 *  Tre strade: il turno torna com'era, oppure — se era nato adesso — si
 *  toglie e resta da rifare; se pero' il responsabile lo aveva gia' cambiato
 *  di suo, non si tocca niente: l'ultima parola e' la sua, e un ripristino
 *  gli cancellerebbe il lavoro fatto dopo. */
export async function apriMessaggi(): Promise<ActionResult> {
  const user = await requireCapo();
  const supabase = await createClient();

  const { data: nuovi, error } = await supabase
    .from("shift_messages")
    .select("id, shift_id, turno_prima, turno_dopo")
    .eq("company_id", user.company_id)
    .is("visto_at", null)
    // Dal piu' recente. Sullo stesso turno possono essercene due — un
    // rifiuto, una modifica, un altro rifiuto — e comanda l'ultimo: i
    // precedenti raccontano una storia gia' scavalcata.
    .order("creato_at", { ascending: false });
  if (error) return { ok: false, error: messaggioErrore(error) };
  if (!nuovi || nuovi.length === 0) return { ok: true };

  const adesso = new Date().toISOString();
  /** I turni gia' sistemati in questo giro: il secondo messaggio sullo
   *  stesso turno non ci rimette le mani. */
  const trattati = new Set<string>();

  for (const m of nuovi) {
    // Il messaggio si prenota prima di toccarlo: due responsabili che aprono
    // la casella nello stesso momento se lo contenderebbero, e il secondo
    // troverebbe un turno gia' ripristinato scambiandolo per uno cambiato a
    // mano. Vince chi arriva primo, l'altro passa oltre.
    const { data: preso } = await supabase
      .from("shift_messages")
      .update({ visto_at: adesso })
      .eq("id", m.id)
      .is("visto_at", null)
      .select("id");
    if (!preso || preso.length === 0) continue;

    const prima = statoSchema.nullable().safeParse(m.turno_prima);
    const dopo = statoSchema.safeParse(m.turno_dopo);

    // Il rifiuto e' ancora quello di questo messaggio? Lo dice `rifiutato_at`
    // sul turno, e lo dice meglio di qualunque confronto campo per campo:
    // ogni salvataggio del responsabile lo azzera, quindi trovarlo ancora li'
    // significa che dopo il no nessuno ci ha piu' messo mano. Confrontando
    // invece orari e reparto, un turno riassegnato a un'altra persona — o a
    // cui e' cambiata solo una nota — sarebbe sembrato intatto, e aprendo i
    // messaggi il responsabile si sarebbe visto cancellare il rimedio che
    // aveva appena messo in piedi.
    let rifiutoVivo = false;
    if (m.shift_id && !trattati.has(m.shift_id)) {
      const { data: t } = await supabase
        .from("shifts")
        .select("rifiutato_at")
        .eq("id", m.shift_id)
        .maybeSingle();
      rifiutoVivo = Boolean(t?.rifiutato_at);
    }

    let esito: "ripristinato" | "da_rifare" | "superato" = "superato";

    // Uno snapshot illeggibile non e' un turno nato adesso: nel dubbio non si
    // cancella niente. Se un domani la forma di `stato_prima` cambiasse, i
    // ripristini diventerebbero cancellazioni in silenzio.
    if (rifiutoVivo && m.shift_id && prima.success) {
      trattati.add(m.shift_id);
      if (prima.data) {
        const { profile_id, ...campi } = prima.data;
        await supabase
          .from("shifts")
          .update({
            ...campi,
            // La persona torna quella di prima solo se lo snapshot la
            // conosce: quelli vecchi non la portano, e in quel caso il
            // turno resta di chi ce l'ha adesso.
            ...(profile_id !== undefined ? { profile_id } : {}),
            richiede_conferma: null,
            confermato_at: null,
            rifiutato_at: null,
            nota_rifiuto: null,
            stato_prima: null,
          })
          .eq("id", m.shift_id);
        esito = "ripristinato";
        // Se la modifica aveva spostato il turno di settimana, tornando
        // indietro puo' lasciare vuota quella dov'era finito.
        if (dopo.success && mondayOf(dopo.data.date) !== mondayOf(prima.data.date)) {
          await riportaInBozzaSeVuota(
            supabase,
            user.company_id,
            mondayOf(dopo.data.date),
          );
        }
      } else {
        await supabase.from("shifts").delete().eq("id", m.shift_id);
        esito = "da_rifare";
        // Se quel turno era l'ultimo della settimana, la settimana torna
        // bozza: vale qui come per ogni altra cancellazione.
        if (dopo.success) {
          await riportaInBozzaSeVuota(
            supabase,
            user.company_id,
            mondayOf(dopo.data.date),
          );
        }
      }
    }

    await supabase.from("shift_messages").update({ esito }).eq("id", m.id);
  }

  revalidatePath("/turni");
  revalidatePath("/supervisione");
  return { ok: true };
}

/** Il compito chiuso a mano: il responsabile ha rimediato in un altro modo —
 *  ha chiamato un altro, ha spostato il lavoro — e quel buco non c'e' piu'. */
export async function chiudiMessaggio(id: string): Promise<ActionResult> {
  const user = await requireCapo();

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "Messaggio non valido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("shift_messages")
    .update({ risolto_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("company_id", user.company_id);
  if (error) return { ok: false, error: messaggioErrore(error) };

  revalidatePath("/turni");
  return { ok: true };
}

/* ============================================== la settimana, e gli avvisi */

/** «Ho letto». Non decide niente e non cambia un turno: toglie di mezzo un
 *  riquadro che ha finito il suo lavoro.
 *
 *  Il bottone c'è — e l'avviso non sparisce da solo dopo qualche giorno —
 *  perché un avviso che scade è un avviso che qualcuno non ha visto, e
 *  nessuno saprebbe dire chi. */
export async function segnaAvvisoLetto(id: string): Promise<ActionResult> {
  await requireMember();

  const parsed = z.string().uuid("Avviso non valido.").safeParse(id);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: preso, error } = await supabase.rpc("segna_avviso_letto", {
    avviso: parsed.data,
  });
  if (error) return { ok: false, error: messaggioErrore(error) };

  revalidatePath("/turni");
  if (!preso) return { ok: false, error: "Questo avviso risulta già letto." };
  return { ok: true };
}

/** Il sì alla settimana intera, con eventualmente allegata la richiesta di
 *  un ritocco.
 *
 *  La nota **non** è una modifica: la applica il responsabile a mano, se è
 *  d'accordo. Un sì che cambiasse da solo il tabellone non sarebbe un sì,
 *  sarebbe un permesso di scrittura sui propri turni — ed è esattamente la
 *  cosa che tutto il resto dell'app evita. */
export async function accettaSettimana(
  monday: string,
  nota?: string,
): Promise<ActionResult> {
  await requireMember();

  const parsed = z
    .object({
      monday: day,
      nota: z.string().trim().max(500, "Nota troppo lunga.").optional(),
    })
    .safeParse({ monday, nota });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: preso, error } = await supabase.rpc("accetta_settimana", {
    lunedi: mondayOf(parsed.data.monday),
    nota_ritocco: parsed.data.nota ?? null,
  });
  if (error) return { ok: false, error: messaggioErrore(error) };

  revalidatePath("/turni");
  if (!preso) {
    return {
      ok: false,
      error:
        "Su questa settimana non c'è più niente da decidere: o hai già risposto, o la settimana è finita.",
    };
  }
  return { ok: true };
}

/** Il no alla settimana intera.
 *
 *  La motivazione è obbligatoria, e non per burocrazia: un no secco su sette
 *  giorni non lascia al responsabile niente di cui possa fare qualcosa, e la
 *  settimana va comunque rifatta. Il controllo sta anche nella funzione del
 *  database, che è l'unico posto in cui vale sempre. */
export async function rifiutaSettimana(
  monday: string,
  motivazione: string,
): Promise<ActionResult> {
  await requireMember();

  const parsed = z
    .object({
      monday: day,
      motivazione: z
        .string()
        .trim()
        .min(1, "Scrivi il motivo: è quello su cui il responsabile rifarà la settimana.")
        .max(500, "Motivo troppo lungo."),
    })
    .safeParse({ monday, motivazione });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: preso, error } = await supabase.rpc("rifiuta_settimana", {
    lunedi: mondayOf(parsed.data.monday),
    motivazione: parsed.data.motivazione,
  });
  if (error) return { ok: false, error: messaggioErrore(error) };

  revalidatePath("/turni");
  if (!preso) {
    return {
      ok: false,
      error:
        "Su questa settimana non c'è più niente da decidere: o hai già risposto, o la settimana è finita.",
    };
  }
  return { ok: true };
}

/** Il responsabile ha letto la risposta. Non applica niente: una settimana
 *  rifiutata la rifà lui, ed è la stessa ragione per cui il sì con nota non
 *  sposta un turno da solo. */
export async function chiudiRichiestaSettimana(id: string): Promise<ActionResult> {
  await requireCapo();

  const parsed = z.string().uuid("Richiesta non valida.").safeParse(id);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("week_requests")
    .update({ visto_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .is("visto_at", null);
  if (error) return { ok: false, error: messaggioErrore(error) };

  revalidatePath("/turni");
  return { ok: true };
}
