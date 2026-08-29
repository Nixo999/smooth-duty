import { redirect } from "next/navigation";
import { Permessi } from "@/components/permessi/permessi";
import { ErroreDati } from "@/components/ui/errore-dati";
import { requireMember } from "@/lib/auth";
import {
  COLONNE_ASSENZA,
  COLONNE_PERMESSI,
  COLONNE_PROFILO,
  COLONNE_REPARTO,
} from "@/lib/colonne";
import { toISODate } from "@/lib/date";
import {
  COLONNE_IMPOSTAZIONI,
  normalizzaImpostazioni,
} from "@/lib/impostazioni";
import { createClient } from "@/lib/supabase/server";
import type { Absence, Department, Profile, VacationRequest } from "@/lib/types";
import { addDays, mondayOf } from "@/lib/week";

export default async function PermessiPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const user = await requireMember();
  const { m } = await searchParams;

  const mese =
    m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : toISODate(new Date()).slice(0, 7);
  const [anno, numeroMese] = mese.split("-").map(Number);

  const primo = `${mese}-01`;
  // Giorno zero del mese dopo: l'ultimo di questo.
  const ultimo = toISODate(new Date(Date.UTC(anno, numeroMese, 0)));

  // La griglia parte dal lunedì della settimana del primo e finisce alla
  // domenica di quella dell'ultimo: si legge quello che tocca quel
  // rettangolo, così anche le code dei mesi accanto si vedono.
  const da = mondayOf(primo);
  const a = addDays(mondayOf(ultimo), 6);

  const supabase = await createClient();

  // Chi vede cosa lo decide il database, non questa pagina: al dipendente
  // arrivano le sue righe e le ferie degli altri, al responsabile tutto.
  // Qui non c'è un filtro da dimenticare.
  const [persone, reparti, richieste, assenze, impostazioni] = await Promise.all([
    supabase
      .from("profiles")
      .select(COLONNE_PROFILO)
      .eq("company_id", user.company_id)
      .eq("active", true)
      .order("full_name"),
    supabase
      .from("departments")
      .select(COLONNE_REPARTO)
      .eq("company_id", user.company_id)
      .order("position"),
    supabase
      .from("vacation_requests")
      .select(COLONNE_PERMESSI)
      .eq("company_id", user.company_id)
      .lte("start_date", a)
      .gte("end_date", da)
      .order("start_date"),
    // Le assenze vere, comprese quelle registrate a mano dal responsabile.
    // Le aperte (end_date null) toccano qualunque mese dopo il loro inizio.
    supabase
      .from("absences")
      .select(COLONNE_ASSENZA)
      .eq("company_id", user.company_id)
      .lte("start_date", a)
      .or(`end_date.is.null,end_date.gte.${da}`)
      .order("start_date"),
    supabase
      .from("company_settings")
      .select(COLONNE_IMPOSTAZIONI)
      .eq("company_id", user.company_id)
      .maybeSingle(),
  ]);

  // Prima di qualunque cosa: se una lettura non e' riuscita si dice, invece
  // di disegnare un calendario che sembra vero. Un elenco di richieste vuoto
  // per errore si legge «nessuno ha chiesto niente» — e chi aspetta una
  // risposta continua ad aspettarla.
  if (richieste.error) {
    return <ErroreDati cosa="le richieste" dettaglio={richieste.error.message} />;
  }
  if (persone.error) {
    return <ErroreDati cosa="le persone" dettaglio={persone.error.message} />;
  }
  if (reparti.error) {
    return <ErroreDati cosa="i reparti" dettaglio={reparti.error.message} />;
  }
  if (assenze.error) {
    return <ErroreDati cosa="le assenze" dettaglio={assenze.error.message} />;
  }
  if (impostazioni.error) {
    return <ErroreDati cosa="le impostazioni" dettaglio={impostazioni.error.message} />;
  }

  // L'azienda puo' non usare i Permessi: dal menu spariscono, e dal loro
  // indirizzo si torna ai Turni. Il controllo qui sopra e' quello che rende
  // vero questo redirect: senza, con la lettura fallita si tornava ai Turni
  // per un default, non per una scelta dell'azienda.
  const imp = normalizzaImpostazioni(impostazioni.data as never);
  if (!imp.pagina_permessi) redirect("/turni");

  return (
    <Permessi
      mese={mese}
      primo={primo}
      ultimo={ultimo}
      da={da}
      a={a}
      persone={(persone.data ?? []) as Profile[]}
      reparti={(reparti.data ?? []) as Department[]}
      richieste={(richieste.data ?? []) as VacationRequest[]}
      assenze={(assenze.data ?? []) as Absence[]}
      causaliAmmesse={imp.causali_richiedibili}
      mioId={user.id}
      capo={user.role === "capo"}
    />
  );
}
