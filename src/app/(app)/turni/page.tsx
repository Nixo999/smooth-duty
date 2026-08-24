import { MyWeek } from "@/components/turni/my-week";
import { Roster } from "@/components/turni/roster";
import { requireMember } from "@/lib/auth";
import {
  COLONNE_ASSENZA,
  COLONNE_PROFILO_CON_REPARTI,
  COLONNE_REPARTO,
  COLONNE_TURNO,
  conReparti,
} from "@/lib/colonne";
import { createClient } from "@/lib/supabase/server";
import type { Absence, Department, Profile, Shift } from "@/lib/types";
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
  ]);

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
      />
    );
  }

  return (
    <MyWeek
      monday={monday}
      days={days}
      shifts={shifts}
      assenze={absences}
      profileId={user.id}
      reparti={departments}
      repartoPersona={user.department_id}
    />
  );
}
