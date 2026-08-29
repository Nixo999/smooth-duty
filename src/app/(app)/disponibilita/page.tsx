import { redirect } from "next/navigation";
import { Disponibilita } from "@/components/disponibilita/disponibilita";
import { ErroreDati } from "@/components/ui/errore-dati";
import { requireMember } from "@/lib/auth";
import { COLONNE_DISPONIBILITA } from "@/lib/colonne";
import { toISODate } from "@/lib/date";
import { versoDelRegime } from "@/lib/disponibilita";
import {
  COLONNE_IMPOSTAZIONI,
  normalizzaImpostazioni,
} from "@/lib/impostazioni";
import { createClient } from "@/lib/supabase/server";
import type { Disponibilita as Riga } from "@/lib/types";
import { addDays, mondayOf } from "@/lib/week";

/** Il calendario di chi è a chiamata — **la sua**, e di nessun altro.
 *
 *  Questa pagina è del dipendente. Il responsabile le disponibilità le vede e
 *  le scrive dal tabellone, insieme ai turni: sono la stessa domanda guardata
 *  da due parti — «chi posso mettere sabato» — e tenerle in due schermate
 *  diverse lo obbligherebbe a ricordarsi l'una mentre guarda l'altra. Chi
 *  arriva qui da responsabile viene rimandato ai Turni.
 *
 *  Non esiste nemmeno per il dipendente, in due casi: sotto il regime
 *  `on_demand` non c'è niente da segnare, e a chi ha un contratto a ore
 *  questo calendario non direbbe niente — anzi, gli farebbe dubitare di
 *  averlo. Come per le pagine spegnibili il controllo sta in due posti,
 *  qui e nel menu: l'indirizzo se lo ricorda il browser. */
export default async function DisponibilitaPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const user = await requireMember();
  const { m } = await searchParams;

  // Il responsabile ha la stessa cosa nel tabellone, e migliore: lì la vede
  // accanto ai turni su cui deve decidere.
  if (user.role === "capo") redirect("/turni");
  if (!user.on_call) redirect("/turni");

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

  const { data: impRiga, error: erroreImp } = await supabase
    .from("company_settings")
    .select(COLONNE_IMPOSTAZIONI)
    .eq("company_id", user.company_id)
    .maybeSingle();

  // Il controllo viene prima del redirect di proposito: se la lettura non
  // riesce, `normalizzaImpostazioni` darebbe i default e la pagina
  // deciderebbe di esistere o no su un dato inventato. Rimandare ai Turni
  // qualcuno che ha diritto a questa pagina e' peggio di dirgli che c'e' un
  // guasto, perche' sembra una scelta dell'azienda.
  if (erroreImp) {
    return <ErroreDati cosa="le impostazioni dell'azienda" dettaglio={erroreImp.message} />;
  }

  const imp = normalizzaImpostazioni(impRiga as never);
  if (!versoDelRegime(imp.regime_chiamata)) redirect("/turni");

  const [righeRes, turniRes] = await Promise.all([
    supabase
      .from("availability_days")
      .select(COLONNE_DISPONIBILITA)
      .eq("company_id", user.company_id)
      .eq("profile_id", user.id)
      .gte("giorno", da)
      .lte("giorno", a)
      .order("giorno"),
    // I turni già scritti nel mese: si dichiara la disponibilità guardando
    // dove si è già impegnati, non a memoria.
    supabase
      .from("shifts")
      .select("date")
      .eq("company_id", user.company_id)
      .eq("profile_id", user.id)
      .gte("date", da)
      .lte("date", a),
  ]);

  // Un errore di lettura non deve travestirsi da calendario vuoto: qui il
  // vuoto vuol dire «non ho segnato niente», che sotto la lista bianca è la
  // differenza fra lavorare e non lavorare.
  if (righeRes.error) {
    return (
      <ErroreDati cosa="le tue disponibilità" dettaglio={righeRes.error.message} />
    );
  }
  // Anche i turni: la griglia li mostra per dire «qui sei gia' impegnato», e
  // un elenco vuoto per errore fa dichiarare disponibile un giorno che e'
  // gia' occupato.
  if (turniRes.error) {
    return <ErroreDati cosa="i tuoi turni" dettaglio={turniRes.error.message} />;
  }

  return (
    <Disponibilita
      mese={mese}
      primo={primo}
      ultimo={ultimo}
      da={da}
      a={a}
      regime={imp.regime_chiamata}
      righe={(righeRes.data ?? []) as Riga[]}
      giorniConTurno={(turniRes.data ?? []).map((t: { date: string }) => t.date)}
      mioId={user.id}
    />
  );
}
