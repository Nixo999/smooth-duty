"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ETICHETTA } from "@/lib/assenze";
import { requireCapo, requireMember } from "@/lib/auth";
import { durationMinutes } from "@/lib/date";
import {
  COLONNE_IMPOSTAZIONI,
  normalizzaImpostazioni,
} from "@/lib/impostazioni";
import { giorniCoinvolti, mondayOf, weekDaysISO } from "@/lib/week";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

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

export async function salvaTurno(input: ShiftInput): Promise<ActionResult> {
  const user = await requireCapo();

  const parsed = shiftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const v = parsed.data;

  const supabase = await createClient();

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
          .from("draft_weeks")
          .select("monday")
          .eq("company_id", user.company_id)
          .eq("monday", lunedi)
          .maybeSingle(),
      ]);

    const imp = normalizzaImpostazioni(impostazioniRes.data as never);
    const persona = personaRes.data;
    const inBozza = Boolean(bozzaRes.data);

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

    const modifica = Boolean(v.id) && !inBozza;

    const orarioDiverso =
      imp.orari_preimpostati &&
      Boolean(persona?.preset_start && persona?.preset_end) &&
      (v.start_time !== String(persona!.preset_start).slice(0, 5) ||
        v.end_time !== String(persona!.preset_end).slice(0, 5));

    if (modifica && straordinario && imp.conferma_modifiche_straordinari) {
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

  const { error } = v.id
    ? await supabase.from("shifts").update(row).eq("id", v.id)
    : await supabase.from("shifts").insert({ ...row, created_by: user.id });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/turni");
  // Anche la Supervisione: da li' il responsabile modifica i turni.
  revalidatePath("/supervisione");
  return { ok: true };
}

export async function eliminaTurno(id: string): Promise<ActionResult> {
  await requireCapo();

  const supabase = await createClient();
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/turni");
  // Anche la Supervisione: da li' il responsabile modifica i turni.
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

/* -------------------------------------------------------------- bozze --- */

/** Mette o toglie la bozza su una settimana. In bozza i dipendenti non la
 *  vedono: il responsabile la costruisce con calma e la pubblica intera. */
export async function impostaBozza(
  monday: string,
  bozza: boolean,
): Promise<ActionResult> {
  const user = await requireCapo();

  const parsed = day.safeParse(monday);
  if (!parsed.success) return { ok: false, error: "Data non valida." };
  const lunedi = mondayOf(parsed.data);

  const supabase = await createClient();
  const { error } = bozza
    ? await supabase
        .from("draft_weeks")
        .upsert({ company_id: user.company_id, monday: lunedi })
    : await supabase
        .from("draft_weeks")
        .delete()
        .eq("company_id", user.company_id)
        .eq("monday", lunedi);
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
