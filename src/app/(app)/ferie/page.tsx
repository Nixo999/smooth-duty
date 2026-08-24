import { Ferie } from "@/components/ferie/ferie";
import { requireMember } from "@/lib/auth";
import { COLONNE_FERIE, COLONNE_PROFILO, COLONNE_REPARTO } from "@/lib/colonne";
import { toISODate } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { Department, Profile, VacationRequest } from "@/lib/types";
import { addDays, mondayOf } from "@/lib/week";

export default async function FeriePage({
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
  // domenica di quella dell'ultimo: si leggono le richieste che toccano
  // quel rettangolo, così anche le code dei mesi accanto si vedono.
  const da = mondayOf(primo);
  const a = addDays(mondayOf(ultimo), 6);

  const supabase = await createClient();
  const [persone, reparti, richieste] = await Promise.all([
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
      .select(COLONNE_FERIE)
      .eq("company_id", user.company_id)
      .lte("start_date", a)
      .gte("end_date", da)
      .order("start_date"),
  ]);

  return (
    <Ferie
      mese={mese}
      primo={primo}
      ultimo={ultimo}
      da={da}
      a={a}
      persone={(persone.data ?? []) as Profile[]}
      reparti={(reparti.data ?? []) as Department[]}
      richieste={(richieste.data ?? []) as VacationRequest[]}
      mioId={user.id}
      capo={user.role === "capo"}
    />
  );
}
