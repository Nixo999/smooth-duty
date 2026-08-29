import {
  ArrowRight,
  CalendarCheck2,
  CircleAlert,
  UserRoundX,
} from "lucide-react";
import Link from "next/link";
import { ErroreDati } from "@/components/ui/errore-dati";
import { assenzaDelGiorno, ETICHETTA } from "@/lib/assenze";
import { requireCapo } from "@/lib/auth";
import {
  COLONNE_ASSENZA,
  COLONNE_FASCIA,
  COLONNE_PROFILO,
  COLONNE_TURNO,
} from "@/lib/colonne";
import {
  formatDuration,
  fromISODate,
  nelFuso,
  oggiCivile,
  weekLabel,
} from "@/lib/date";
import {
  COLONNE_IMPOSTAZIONI,
  normalizzaImpostazioni,
} from "@/lib/impostazioni";
import { bilancioSettimana } from "@/lib/oggi";
import { siLavoreraDavvero } from "@/lib/ore-effettive";
import {
  buchi,
  copertura,
  fasceDelGiorno,
  MINUTI_GIORNO,
  oraDa,
  segmentiDelGiorno,
} from "@/lib/supervisione/copertura";
import { createClient } from "@/lib/supabase/server";
import type { Absence, CoverageBand, Profile, Shift } from "@/lib/types";
import { addDays, mondayOf, weekDaysISO } from "@/lib/week";

/** Quando una settimana è stata pubblicata, detto come lo direbbe una
 *  persona. Entro la settimana si dice il giorno — «pubblicata martedì» è
 *  quello che il responsabile ricorda — più indietro serve la data, perché
 *  «martedì» a quel punto sono due martedì diversi. */
function quandoPubblicata(iso: string, oggi: string): string {
  const quando = new Date(iso);
  const civile = nelFuso(quando, "sv-SE");

  if (civile === oggi) return "oggi";
  if (civile === addDays(oggi, -1)) return "ieri";

  const ultimiGiorni = Array.from({ length: 7 }, (_, i) => addDays(oggi, -i));
  if (ultimiGiorni.includes(civile)) {
    return nelFuso(quando, "it-IT", { weekday: "long" });
  }
  return `il ${nelFuso(quando, "it-IT", { day: "numeric", month: "long" })}`;
}

/** Il pallino della riga di stato. Il colore non viaggia mai da solo: la
 *  frase accanto dice la stessa cosa in lettere, perché a un uomo su dodici
 *  verde e rosso affiancati sono lo stesso grigio. */
function Punto({ tono }: { tono: "success" | "warning" | "danger" }) {
  const colore = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  }[tono];
  return <span aria-hidden className={`size-2 shrink-0 rounded-full ${colore}`} />;
}

/** Una cosa che aspetta una decisione: la frase, e la freccia verso il posto
 *  dove si rimedia. */
function Riga({
  href,
  children,
  tono = "muted",
}: {
  href: string;
  children: React.ReactNode;
  tono?: "muted" | "danger" | "warning";
}) {
  const colore = {
    muted: "text-text",
    danger: "text-danger",
    warning: "text-warning",
  }[tono];
  return (
    <Link
      href={href}
      className="tap -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-2"
    >
      <span className={`min-w-0 flex-1 text-[14.5px] ${colore}`}>{children}</span>
      <ArrowRight className="size-4 shrink-0 text-faint" />
    </Link>
  );
}

export default async function OggiPage() {
  const user = await requireCapo();

  const oggi = oggiCivile();
  const ieri = addDays(oggi, -1);
  const lunedi = mondayOf(oggi);
  const giorni = weekDaysISO(lunedi);
  const prossimoLunedi = addDays(lunedi, 7);

  // Un turno 18:00–02:00 di ieri copre le prime ore di oggi: senza guardare
  // indietro la notte sembrerebbe scoperta. Se oggi è lunedì, ieri sta nella
  // settimana prima, quindi la lettura parte dal più indietro dei due.
  const daLeggere = ieri < giorni[0] ? ieri : giorni[0];

  const supabase = await createClient();

  // Il filtro sull'azienda è esplicito e non decorativo: chi amministra la
  // piattaforma ha il permesso di leggere i profili di tutte le aziende.
  // RLS resta la rete di sicurezza, non il filtro di questa schermata.
  const [
    personeRes,
    turniRes,
    assenzeRes,
    fasceRes,
    settimaneRes,
    impostazioniRes,
    rifiutiRes,
    risposteRes,
    permessiRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(COLONNE_PROFILO)
      .eq("company_id", user.company_id)
      .eq("active", true)
      .order("full_name"),
    supabase
      .from("shifts")
      .select(COLONNE_TURNO)
      .eq("company_id", user.company_id)
      .gte("date", daLeggere)
      .lte("date", giorni[6])
      .order("start_time"),
    // Dalla tabella e non dalla vista: qui il motivo serve, e chi guarda
    // questa schermata è il responsabile, l'unico che ha diritto di vederlo.
    supabase
      .from("absences")
      .select(COLONNE_ASSENZA)
      .eq("company_id", user.company_id)
      .lte("start_date", giorni[6])
      .or(`end_date.is.null,end_date.gte.${daLeggere}`),
    supabase
      .from("coverage_bands")
      .select(COLONNE_FASCIA)
      .eq("company_id", user.company_id)
      .order("position"),
    // Due settimane, non una: è il buco che questa schermata chiude. Nessuna
    // altra pagina dice se la **prossima** è pubblicata, e finché non lo dice
    // nessuno se ne accorge — se non i dipendenti, il lunedì mattina.
    supabase
      .from("published_weeks")
      .select("monday, published_at")
      .eq("company_id", user.company_id)
      .in("monday", [lunedi, prossimoLunedi]),
    supabase
      .from("company_settings")
      .select(COLONNE_IMPOSTAZIONI)
      .eq("company_id", user.company_id)
      .maybeSingle(),
    // I tre conti di «da decidere». Si contano e basta: qui non servono le
    // righe, serve sapere quante sono e dove si va a rimediare.
    // `risolto_at` da sola non basta: la scrive solo chi rifà il turno o chi
    // chiude il messaggio a mano, quindi un rifiuto già rientrato — turno
    // tornato com'era, o rifiuto arrivato dopo che il responsabile aveva
    // già cambiato quel turno — resterebbe nel conto per sempre. Da
    // sistemare c'è quello che nessuno ha ancora aperto e quello a cui
    // manca il turno da rifare.
    supabase
      .from("shift_messages")
      .select("id", { count: "exact", head: true })
      .eq("company_id", user.company_id)
      .is("risolto_at", null)
      .or("esito.is.null,esito.eq.da_rifare"),
    supabase
      .from("week_requests")
      .select("id", { count: "exact", head: true })
      .eq("company_id", user.company_id)
      .neq("stato", "in_attesa")
      .is("visto_at", null),
    supabase
      .from("vacation_requests")
      .select("id", { count: "exact", head: true })
      .eq("company_id", user.company_id)
      .eq("status", "richiesta"),
  ]);

  // Un errore di lettura non deve travestirsi da settimana vuota: una
  // schermata che dice «non manca niente» perché la domanda non è arrivata a
  // destinazione è peggio di nessuna schermata.
  if (turniRes.error) {
    return <ErroreDati cosa="i turni" dettaglio={turniRes.error.message} />;
  }
  if (personeRes.error) {
    return <ErroreDati cosa="le persone" dettaglio={personeRes.error.message} />;
  }

  const persone = (personeRes.data ?? []) as Profile[];
  const turni = (turniRes.data ?? []) as Shift[];
  const assenze = (assenzeRes.data ?? []) as Absence[];
  const fasce = (fasceRes.data ?? []) as CoverageBand[];
  const imp = normalizzaImpostazioni(impostazioniRes.data as never);

  const pubblicate = new Map(
    ((settimaneRes.data ?? []) as { monday: string; published_at: string }[]).map(
      (r) => [r.monday, r.published_at],
    ),
  );
  const questaPubblicata = pubblicate.get(lunedi);
  const prossimaPubblicata = pubblicate.get(prossimoLunedi);

  const bilancio = bilancioSettimana({ persone, turni, assenze, giorni });
  const conContratto = bilancio.righe.length > 0;
  const scarto = bilancio.effettivi - bilancio.dovuti;

  const rifiuti = rifiutiRes.count ?? 0;
  const risposte = risposteRes.count ?? 0;
  // Se l'azienda non usa i Permessi non c'è nessun posto dove mandare chi
  // preme: una freccia verso una pagina spenta è peggio di una riga in meno.
  const permessi = imp.pagina_permessi ? (permessiRes.count ?? 0) : 0;
  const daDecidere = rifiuti + risposte + permessi;

  const manca =
    bilancio.scoperti > 0 || bilancio.sotto.length > 0 || bilancio.sopra.length > 0;

  /* ------------------------------------------------------------- oggi -- */

  // Gli stessi turni che stanno nel numero grande e in «cosa manca»: chi ha
  // detto di no non è in turno, e non deve comparire come se lo fosse.
  // La domanda si fa in un posto solo (`lib/ore-effettive.ts`), o dentro la
  // stessa schermata lo stesso turno conta e non conta.
  const turniVeri = turni.filter((t) => siLavoreraDavvero(t, assenze));
  const segmenti = segmentiDelGiorno(turniVeri, persone, oggi, ieri, assenze);
  const inTurno = segmenti.filter((s) => s.profileId && !s.assenza);
  const scopertiOggi = segmenti.filter((s) => !s.profileId);
  const assentiOggi = persone
    .map((p) => ({ persona: p, assenza: assenzaDelGiorno(assenze, p.id, oggi) }))
    .filter((r) => r.assenza !== null);

  const fasceOggi = fasceDelGiorno(fasce, oggi);
  // Senza fasce di copertura scritte non c'è niente contro cui misurare la
  // giornata: dire «coperta» sarebbe una promessa fatta con zero regole in
  // mano, ed è esattamente lo stato di un'azienda appena creata.
  const misurabile = imp.pagina_supervisione && fasceOggi.length > 0;
  const buchiOggi = misurabile
    ? buchi(copertura(segmenti, fasceOggi, 0, MINUTI_GIORNO))
    : [];

  const sezione = "border-t border-border px-5 py-5 sm:px-6";

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
        {/* 1 — la riga di stato ------------------------------------------ */}
        <div className="space-y-1.5 px-5 py-4 sm:px-6">
          <p className="flex items-center gap-2 text-[13.5px] text-muted">
            <Punto tono={questaPubblicata ? "success" : "danger"} />
            <span>
              Settimana {weekLabel(fromISODate(lunedi))} ·{" "}
              {questaPubblicata
                ? `pubblicata ${quandoPubblicata(questaPubblicata, oggi)}`
                : "la vedi solo tu"}
            </span>
          </p>
          <Link
            href={`/turni?s=${prossimoLunedi}`}
            className="flex items-center gap-2 text-[13.5px] text-muted hover:text-text"
          >
            <Punto tono={prossimaPubblicata ? "success" : "warning"} />
            <span>
              {prossimaPubblicata
                ? `La prossima è pubblicata ${quandoPubblicata(prossimaPubblicata, oggi)}`
                : "La prossima la vedi solo tu"}
            </span>
          </Link>
        </div>

        {/* 2 — il numero grande ------------------------------------------ */}
        <div className={sezione}>
          {conContratto ? (
            <>
              <p className="cifre text-[44px] font-semibold leading-none tracking-tight">
                {formatDuration(bilancio.effettivi)}
              </p>
              <p className="mt-2 text-[15px] text-muted">
                su <span className="cifre">{formatDuration(bilancio.dovuti)}</span> da
                contratto, questa settimana
              </p>
              <p
                className={`mt-1 text-[14px] ${
                  scarto < 0 ? "text-danger" : scarto > 0 ? "text-warning" : "text-muted"
                }`}
              >
                {scarto < 0
                  ? `Mancano ${formatDuration(-scarto)}.`
                  : scarto > 0
                    ? `${formatDuration(scarto)} oltre il contratto.`
                    : "In pari con i contratti."}
              </p>
            </>
          ) : (
            <>
              <p className="cifre text-[44px] font-semibold leading-none tracking-tight">
                {formatDuration(bilancio.effettivi + bilancio.fuoriContratto)}
              </p>
              <p className="mt-2 text-[15px] text-muted">
                a tabellone questa settimana
              </p>
              {/* Lo stato di ogni azienda appena creata. Senza ore da
                  contratto non c'è niente da confrontare: si dice cosa manca
                  e dove si scrive, invece di mostrare uno zero o un rapporto
                  che non ha denominatore. */}
              <div className="mt-4 flex items-start gap-3 rounded-xl bg-surface-2 px-4 py-3">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted" />
                <div className="min-w-0 text-[13.5px]">
                  <p className="font-medium">Nessuno ha ore a settimana in scheda.</p>
                  <p className="mt-1 text-muted">
                    Sono le ore che il contratto prevede. Appena le scrivi, qui
                    compare quante ne verranno lavorate davvero e quante ne
                    mancano, persona per persona.
                  </p>
                  <Link
                    href="/squadra"
                    className="mt-2 inline-flex items-center gap-1.5 font-medium text-accent hover:underline"
                  >
                    Scrivile in Squadra
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            </>
          )}

          {bilancio.fuoriContratto > 0 && conContratto ? (
            <p className="mt-1 text-[13.5px] text-faint">
              Più <span className="cifre">{formatDuration(bilancio.fuoriContratto)}</span>{" "}
              di chi lavora a chiamata o non ha ore in scheda.
            </p>
          ) : null}
        </div>

        {/* 3 — cosa manca ------------------------------------------------ */}
        {manca ? (
          <div className={sezione}>
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-faint">
              Cosa manca
            </h2>
            <div className="mt-1">
              {bilancio.scoperti > 0 ? (
                <Riga href="/turni" tono="danger">
                  <span className="cifre">{formatDuration(bilancio.scoperti)}</span>{" "}
                  scoperte: turni senza nessuno sopra.
                </Riga>
              ) : null}

              {bilancio.sotto.map((r) => (
                <Riga key={r.id} href="/turni" tono="danger">
                  {r.nome} sta sotto le sue ore:{" "}
                  <span className="cifre">{formatDuration(-r.scarto)}</span> in meno.
                </Riga>
              ))}

              {/* Sopra le sue ore, e non è un dettaglio: al telefono si
                  promette che il sistema dice chi è libero e chi è già oltre.
                  Senza questa metà la promessa non era mantenuta. */}
              {bilancio.sopra.map((r) => (
                <Riga key={r.id} href="/turni" tono="warning">
                  {r.nome} è oltre le sue ore:{" "}
                  <span className="cifre">{formatDuration(r.scarto)}</span> in più.
                </Riga>
              ))}
            </div>
          </div>
        ) : null}

        {/* 4 — da decidere. A zero il blocco non c'è proprio. ------------- */}
        {daDecidere > 0 ? (
          <div className={sezione}>
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-faint">
              Da decidere
            </h2>
            <div className="mt-1">
              {rifiuti > 0 ? (
                <Riga href="/turni">
                  {rifiuti === 1
                    ? "Un turno rifiutato, ancora da sistemare."
                    : `${rifiuti} turni rifiutati, ancora da sistemare.`}
                </Riga>
              ) : null}
              {risposte > 0 ? (
                <Riga href="/turni">
                  {risposte === 1
                    ? "Una risposta sulla settimana che non hai ancora letto."
                    : `${risposte} risposte sulla settimana che non hai ancora letto.`}
                </Riga>
              ) : null}
              {permessi > 0 ? (
                <Riga href="/permessi">
                  {permessi === 1
                    ? "Una richiesta di permesso aspetta la tua risposta."
                    : `${permessi} richieste di permesso aspettano la tua risposta.`}
                </Riga>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* 5 — oggi ------------------------------------------------------ */}
        <div className={sezione}>
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-faint">
            Oggi
          </h2>

          <div className="mt-2 space-y-2">
            {inTurno.length > 0 ? (
              <ul className="space-y-1.5">
                {inTurno.map((s) => (
                  <li
                    key={s.turnoId}
                    className="flex items-baseline justify-between gap-3 text-[14.5px]"
                  >
                    <span className="min-w-0 truncate">{s.nome}</span>
                    <span className="orario shrink-0 text-muted">
                      {s.daPrima ? "da ieri " : ""}
                      {oraDa(s.da)} – {oraDa(s.a)}
                      {s.finoADopo ? " (domani)" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14.5px] text-muted">Oggi non è in turno nessuno.</p>
            )}

            {assentiOggi.length > 0 ? (
              <ul className="space-y-1.5 pt-1">
                {assentiOggi.map(({ persona, assenza }) => (
                  <li
                    key={persona.id}
                    className="flex items-baseline justify-between gap-3 text-[14.5px] text-muted"
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <UserRoundX aria-hidden className="size-3.5 shrink-0 self-center" />
                      <span className="truncate">{persona.full_name}</span>
                    </span>
                    <span className="shrink-0">{ETICHETTA(assenza?.type)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="mt-3 space-y-0.5">
            {scopertiOggi.map((s) => (
              <Riga key={s.turnoId} href="/turni" tono="danger">
                Turno scoperto,{" "}
                <span className="orario">
                  {oraDa(s.da)} – {oraDa(s.a)}
                </span>
                .
              </Riga>
            ))}

            {buchiOggi.map((b) => (
              <Riga key={`${b.da}-${b.a}`} href={`/supervisione?g=${oggi}`} tono="danger">
                <span className="orario">
                  {oraDa(b.da)} – {oraDa(b.a)}
                </span>
                : {b.presenti} in servizio su {b.richiesti} che ne servono.
              </Riga>
            ))}

            {/* L'unico punto in cui questa schermata dice una cosa positiva.
                Vale solo quando c'è qualcosa contro cui misurarla. */}
            {misurabile && buchiOggi.length === 0 && scopertiOggi.length === 0 ? (
              <p className="flex items-center gap-2 py-1 text-[14.5px] text-success">
                <CalendarCheck2 aria-hidden className="size-4 shrink-0" />
                Giornata coperta.
              </p>
            ) : null}
          </div>
        </div>

        {/* Un bottone pieno solo. Tutto il resto qui sopra è già un link
            verso il posto dove si rimedia. */}
        <div className="border-t border-border px-5 py-5 sm:px-6">
          <Link
            href="/turni"
            className="tap inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 text-[15px] font-medium text-accent-fg shadow-soft hover:bg-accent-hover"
          >
            Apri il tabellone
          </Link>
        </div>
      </div>
    </div>
  );
}
