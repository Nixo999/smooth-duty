import { redirect } from "next/navigation";
import { Disponibilita } from "@/components/disponibilita/disponibilita";
import { ErroreDati } from "@/components/ui/errore-dati";
import { requireMember } from "@/lib/auth";
import { COLONNE_DISPONIBILITA, COLONNE_PROFILO } from "@/lib/colonne";
import { toISODate } from "@/lib/date";
import { versoDelRegime } from "@/lib/disponibilita";
import {
  COLONNE_IMPOSTAZIONI,
  normalizzaImpostazioni,
} from "@/lib/impostazioni";
import { createClient } from "@/lib/supabase/server";
import type { Disponibilita as Riga, Profile } from "@/lib/types";
import { addDays, mondayOf } from "@/lib/week";

/** Il calendario di chi è a chiamata: quando può, o quando non può.
 *
 *  La pagina esiste solo se l'azienda usa un calendario — sotto il regime
 *  `on_demand` non c'è niente da segnare — e solo per chi c'entra: al
 *  dipendente a ore non direbbe niente, e trovarsela nel menu lo farebbe
 *  dubitare del suo contratto. Come per le altre pagine spegnibili, il
 *  controllo sta in due posti: il menu che nasconde la voce e questa
 *  guardia, perché l'indirizzo se lo ricorda il browser. */
export default async function DisponibilitaPage({
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

  const { data: impRiga } = await supabase
    .from("company_settings")
    .select(COLONNE_IMPOSTAZIONI)
    .eq("company_id", user.company_id)
    .maybeSingle();
  const imp = normalizzaImpostazioni(impRiga as never);
  const verso = versoDelRegime(imp.regime_chiamata);
  if (!verso) redirect("/turni");

  // Chi ha un contratto a ore non ha niente da dichiarare qui.
  if (user.role !== "capo" && !user.on_call) redirect("/turni");

  const [personeRes, righeRes, turniRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(COLONNE_PROFILO)
      .eq("company_id", user.company_id)
      .eq("active", true)
      .eq("on_call", true)
      .order("full_name"),
    // Il filtro sulla persona è esplicito e non decorativo: RLS lascia
    // leggere al responsabile anche quelle degli altri, ed è giusto che sia
    // così — ma la rete non è il filtro della schermata.
    (user.role === "capo"
      ? supabase
          .from("availability_days")
          .select(COLONNE_DISPONIBILITA)
          .eq("company_id", user.company_id)
      : supabase
          .from("availability_days")
          .select(COLONNE_DISPONIBILITA)
          .eq("company_id", user.company_id)
          .eq("profile_id", user.id)
    )
      .gte("giorno", da)
      .lte("giorno", a)
      .order("giorno"),
    // I turni già scritti nel mese: si dichiara la disponibilità guardando
    // dove si è già impegnati, non a memoria.
    (user.role === "capo"
      ? supabase.from("shifts").select("profile_id, date")
      : supabase.from("shifts").select("profile_id, date").eq("profile_id", user.id)
    )
      .eq("company_id", user.company_id)
      .gte("date", da)
      .lte("date", a),
  ]);

  // Un errore di lettura non deve travestirsi da calendario vuoto: qui il
  // vuoto vuol dire «non ho segnato niente», che sotto la lista bianca è la
  // differenza fra lavorare e non lavorare.
  if (righeRes.error) {
    return (
      <ErroreDati cosa="le disponibilità" dettaglio={righeRes.error.message} />
    );
  }

  const persone = (personeRes.data ?? []) as Profile[];

  return (
    <Disponibilita
      mese={mese}
      primo={primo}
      ultimo={ultimo}
      da={da}
      a={a}
      regime={imp.regime_chiamata}
      persone={persone}
      righe={(righeRes.data ?? []) as Riga[]}
      giorniConTurno={(turniRes.data ?? []).map(
        (t: { profile_id: string | null; date: string }) =>
          `${t.profile_id ?? ""}|${t.date}`,
      )}
      mioId={user.id}
      capo={user.role === "capo"}
    />
  );
}
