import { MyWeek } from "@/components/turni/my-week";
import { Roster } from "@/components/turni/roster";
import { ErroreDati } from "@/components/ui/errore-dati";
import { requireMember } from "@/lib/auth";
import {
  COLONNE_ASSENZA,
  COLONNE_AVVISO,
  COLONNE_MESSAGGIO,
  COLONNE_PROFILO_CON_REPARTI,
  COLONNE_REPARTO,
  COLONNE_RICHIESTA_SETTIMANA,
  COLONNE_TURNO,
  conReparti,
} from "@/lib/colonne";
import { createClient } from "@/lib/supabase/server";
import type {
  Absence,
  Avviso,
  Department,
  MessaggioTurno,
  Profile,
  RichiestaSettimana,
  Shift,
} from "@/lib/types";
import { resolveMonday, weekDaysISO } from "@/lib/week";

export default async function TurniPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const user = await requireMember();
  const { s } = await searchParams;

  const monday = resolveMonday(s);
  const days = weekDaysISO(monday);

  const supabase = await createClient();

  // Il filtro sull'azienda è esplicito e non decorativo: chi amministra la
  // piattaforma ha il permesso di leggere i profili di tutte le aziende, e
  // senza questa riga si ritroverebbe in squadra le persone altrui. RLS resta
  // la rete di sicurezza, non il filtro di questa schermata.
  let turni = supabase
    .from("shifts")
    .select(COLONNE_TURNO)
    .eq("company_id", user.company_id)
    .gte("date", days[0])
    .lte("date", days[6])
    .order("start_time");

  // Il dipendente vede solo i propri. Lo decide questa pagina, non una regola
  // del database: la Supervisione, sugli stessi dati, li mostra tutti perché
  // serve a far vedere anche a lui se la giornata è coperta.
  if (user.role !== "capo") turni = turni.eq("profile_id", user.id);

  const [
    profilesResult,
    shiftsResult,
    departmentsResult,
    absencesResult,
    frequenteResult,
    bozzaResult,
    messaggiResult,
    avvisiResult,
    settimaneResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(COLONNE_PROFILO_CON_REPARTI)
      .eq("company_id", user.company_id)
      .eq("active", true)
      .order("full_name"),
    turni,
    supabase
      .from("departments")
      .select(COLONNE_REPARTO)
      .eq("company_id", user.company_id)
      .order("position"),
    // Le assenze che toccano questa settimana: cominciate entro domenica e
    // non ancora finite lunedì. Quelle aperte valgono sempre.
    supabase
      .from("absences")
      .select(COLONNE_ASSENZA)
      .eq("company_id", user.company_id)
      .lte("start_date", days[6])
      .or(`end_date.is.null,end_date.gte.${days[0]}`),
    // Il reparto in cui ciascuno lavora piu' spesso: e' la scelta di partenza
    // quando si aggiunge un turno a chi puo' fare piu' cose. Lo calcola una
    // vista, sui turni gia' fatti.
    supabase.from("reparto_piu_frequente").select("profile_id, department_id"),
    // La settimana e' pubblicata? Ogni settimana nasce bozza e i
    // dipendenti non la vedono finche' il responsabile non la pubblica.
    supabase
      .from("published_weeks")
      .select("monday")
      .eq("company_id", user.company_id)
      .eq("monday", monday)
      .maybeSingle(),
    // I rifiuti ancora aperti. Non si filtrano per settimana: un turno
    // rifiutato di sabato non deve sparire perche' il responsabile sta
    // guardando lunedi'. Solo al responsabile: al dipendente il proprio no
    // lo dice gia' il suo turno.
    user.role === "capo"
      ? supabase
          .from("shift_messages")
          .select(COLONNE_MESSAGGIO)
          .eq("company_id", user.company_id)
          .is("risolto_at", null)
          .order("creato_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    // Gli avvisi non ancora letti, solo per chi li deve leggere. Non
    // filtrati per settimana, per la stessa ragione dei messaggi: un turno
    // tolto di sabato non deve sparire perche' si sta guardando lunedi'.
    // Il filtro sulla persona e' esplicito perche' RLS lascia leggere al
    // responsabile anche quelli degli altri: la rete non e' il filtro.
    user.role === "capo"
      ? Promise.resolve({ data: [] })
      : supabase
          .from("shift_notices")
          .select(COLONNE_AVVISO)
          .eq("company_id", user.company_id)
          .eq("profile_id", user.id)
          .is("letto_at", null)
          .order("creato_at", { ascending: false }),
    // Le settimane: al dipendente quella che sta guardando, se ha ancora
    // una domanda aperta; al responsabile le risposte che non ha ancora
    // letto, di qualunque settimana.
    user.role === "capo"
      ? supabase
          .from("week_requests")
          .select(COLONNE_RICHIESTA_SETTIMANA)
          .eq("company_id", user.company_id)
          .neq("stato", "in_attesa")
          .is("visto_at", null)
          .order("deciso_at", { ascending: false })
      : supabase
          .from("week_requests")
          .select(COLONNE_RICHIESTA_SETTIMANA)
          .eq("company_id", user.company_id)
          .eq("profile_id", user.id)
          .eq("monday", monday)
          .eq("stato", "in_attesa"),
  ]);

  // Un errore di lettura non deve mai travestirsi da settimana vuota: sono
  // due cose diversissime, e chi apre il tabellone non ha modo di
  // distinguerle. Meglio una pagina che dice «non riesco a leggere» di una
  // che mostra zero turni e lascia credere che siano stati cancellati.
  if (shiftsResult.error) {
    return <ErroreDati cosa="i turni" dettaglio={shiftsResult.error.message} />;
  }
  if (profilesResult.error) {
    return <ErroreDati cosa="le persone" dettaglio={profilesResult.error.message} />;
  }

  const inBozza = !bozzaResult.data;

  const profiles = conReparti(profilesResult.data ?? []) as unknown as Profile[];
  const shifts = (shiftsResult.data ?? []) as Shift[];
  const departments = (departmentsResult.data ?? []) as Department[];
  const absences = (absencesResult.data ?? []) as Absence[];

  const frequente = Object.fromEntries(
    ((frequenteResult.data ?? []) as {
      profile_id: string;
      department_id: string;
    }[]).map((r) => [r.profile_id, r.department_id]),
  );

  if (user.role === "capo") {
    return (
      <Roster
        monday={monday}
        days={days}
        profiles={profiles}
        shifts={shifts}
        departments={departments}
        assenze={absences}
        repartoFrequente={frequente}
        inBozza={inBozza}
        messaggi={(messaggiResult.data ?? []) as MessaggioTurno[]}
        risposteSettimana={(settimaneResult.data ?? []) as RichiestaSettimana[]}
      />
    );
  }

  return (
    <MyWeek
      monday={monday}
      days={days}
      // In bozza i turni non arrivano proprio: una settimana a meta' fa
      // piu' danni di una dichiaratamente non pronta.
      shifts={inBozza ? [] : shifts}
      assenze={absences}
      profileId={user.id}
      reparti={departments}
      repartoPersona={user.department_id}
      inBozza={inBozza}
      avvisi={(avvisiResult.data ?? []) as Avviso[]}
      richiestaSettimana={
        ((settimaneResult.data ?? []) as RichiestaSettimana[])[0] ?? null
      }
    />
  );
}
