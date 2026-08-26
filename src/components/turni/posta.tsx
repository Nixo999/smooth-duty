"use client";

import {
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  Clock,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  accettaSettimana,
  accettaTurno,
  rifiutaSettimana,
  rifiutaTurno,
  segnaAvvisoLetto,
} from "@/app/(app)/turni/actions";
import { Button } from "@/components/ui/button";
import { motivoDelTurno } from "@/lib/conferme";
import { Field, Textarea } from "@/components/ui/field";
import { dayLong, formatDuration, fromISODate, timeRange, weekLabel } from "@/lib/date";
import type {
  Avviso,
  MotivoAvviso,
  RichiestaSettimana,
  Shift,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** La posta del dipendente: quello che l'app ha da dirgli, in cima alla
 *  schermata e non dentro il giorno.
 *
 *  Prima ogni cosa da decidere stava attaccata al suo turno, dentro
 *  l'elenco della settimana. Sembrava logico e non lo era: **una cosa da
 *  decidere che sta dentro un giorno si vede solo se si guarda quel
 *  giorno**, e chi apre l'app il lunedì non scorre fino a sabato. Un turno
 *  cambiato di sabato restava lì ad aspettare che qualcuno ci passasse
 *  sopra.
 *
 *  Adesso è un riquadro a comparsa, in cima, sopra la settimana:
 *
 *  - si può **chiudere**, e allora si accartoccia in una pastiglia che dice
 *    quante cose restano — così non è una porta sbarrata;
 *  - non **sparisce** chiudendolo. Sparisce quando si è deciso qualcosa: un
 *    sì, un no, o un «ho letto». Un riquadro che sparisse da solo sarebbe
 *    un avviso che qualcuno non ha visto, e nessuno saprebbe dire chi.
 *
 *  Tre cose ci finiscono dentro, ed è una gerarchia voluta:
 *  1. la **settimana** in straordinario, che si accetta o si rifiuta intera;
 *  2. i **turni** su cui si può dire la propria;
 *  3. gli **avvisi**, che non chiedono niente e si chiudono leggendoli. */
export function Posta({
  turni,
  avvisi,
  settimana,
  monday,
}: {
  /** I turni su cui l'interessato non si è ancora espresso, e che non sono
   *  ancora passati: su un turno lavorato non c'è più niente da dire. */
  turni: Shift[];
  /** Solo quelli non ancora letti. */
  avvisi: Avviso[];
  /** La domanda sulla settimana, se c'è e se è ancora in attesa. */
  settimana: RichiestaSettimana | null;
  monday: string;
}) {
  const [chiusa, setChiusa] = React.useState(false);

  const quante = turni.length + avvisi.length + (settimana ? 1 : 0);
  if (quante === 0) return null;

  if (chiusa) {
    return (
      <button
        type="button"
        onClick={() => setChiusa(false)}
        className="tap mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-medium shadow-soft"
      >
        <Bell className="size-4 text-accent" />
        {quante === 1 ? "1 cosa da vedere" : `${quante} cose da vedere`}
      </button>
    );
  }

  return (
    <section
      aria-label="Da vedere"
      className="mb-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-float"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Bell className="size-4 shrink-0 text-accent" />
        <h2 className="min-w-0 flex-1 text-[14.5px] font-semibold tracking-tight">
          {quante === 1 ? "C'è una cosa da vedere" : `Ci sono ${quante} cose da vedere`}
        </h2>
        <button
          type="button"
          aria-label="Chiudi"
          title="Si richiude, non sparisce: resta finché non rispondi"
          onClick={() => setChiusa(true)}
          className="tap -mr-1 grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-muted hover:text-text"
        >
          <ChevronDown className="size-4" />
        </button>
      </header>

      <div className="divide-y divide-border">
        {settimana ? <VoceSettimana richiesta={settimana} monday={monday} /> : null}
        {turni.map((t) => (
          <VoceTurno key={t.id} turno={t} motivo={motivoDelTurno(t)} />
        ))}
        {avvisi.map((a) => (
          <VoceAvviso key={a.id} avviso={a} />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- settimana */

/** La settimana intera, da accettare o rifiutare in un colpo solo.
 *
 *  I due bottoni aprono lo stesso spazio per scrivere, ma non chiedono la
 *  stessa cosa: sul no la motivazione è **obbligatoria** — un no secco su
 *  sette giorni non lascia al responsabile niente di cui possa fare
 *  qualcosa — sul sì è facoltativa, ed è il ritocco che si chiede volendo
 *  («va bene, ma il giovedì se possibile smetto prima»). Quel ritocco lo fa
 *  il responsabile a mano: un sì che spostasse un turno da solo non sarebbe
 *  un sì, sarebbe un permesso di scrittura sui propri turni. */
function VoceSettimana({
  richiesta,
  monday,
}: {
  richiesta: RichiestaSettimana;
  monday: string;
}) {
  const router = useRouter();
  const [scelta, setScelta] = React.useState<"si" | "no" | null>(null);
  const [nota, setNota] = React.useState("");
  const [pending, start] = React.useTransition();

  const oltre = richiesta.minuti_previsti - richiesta.minuti_contratto;

  const manda = () =>
    start(async () => {
      const esito =
        scelta === "si"
          ? await accettaSettimana(monday, nota)
          : await rifiutaSettimana(monday, nota);
      if (!esito.ok) {
        toast.error(esito.error);
        return;
      }
      toast.success(
        scelta === "si"
          ? nota.trim()
            ? "Settimana accettata, con la tua richiesta allegata."
            : "Settimana accettata."
          : "Rifiuto inviato: il responsabile rifarà la settimana.",
      );
      setScelta(null);
      setNota("");
      router.refresh();
    });

  return (
    <article className="px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
          <Clock className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold tracking-tight">
            La settimana del {weekLabel(fromISODate(monday))} è in straordinario
          </p>
          <p className="mt-1 text-[13px] text-muted">
            Sono previste <strong className="text-text">{formatDuration(richiesta.minuti_previsti)}</strong>{" "}
            contro le {formatDuration(richiesta.minuti_contratto)} del tuo contratto:{" "}
            <strong className="text-warning">{formatDuration(oltre)} in più</strong>. La
            settimana si accetta o si rifiuta intera — è l&apos;insieme che fa la
            differenza, non il singolo giorno.
          </p>

          {scelta === null ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setScelta("si")}>
                <Check className="size-3.5" />
                Accetto la settimana
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setScelta("no")}>
                <X className="size-3.5" />
                Non posso
              </Button>
            </div>
          ) : (
            <div className="mt-3">
              <Field
                label={scelta === "si" ? "Vuoi chiedere un ritocco?" : "Perché non puoi"}
                htmlFor="nota-settimana"
                hint={
                  scelta === "si"
                    ? "Facoltativo. Non sposta niente da solo: lo legge il responsabile e decide lui."
                    : "Obbligatorio: è quello su cui il responsabile rifarà la settimana."
                }
              >
                <Textarea
                  id="nota-settimana"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder={
                    scelta === "si"
                      ? "Va bene, ma il giovedì se possibile smetto alle 18"
                      : "Quella settimana ho un impegno preso da tempo"
                  }
                  maxLength={500}
                />
              </Field>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={scelta === "si" ? "primary" : "danger"}
                  onClick={manda}
                  loading={pending}
                  disabled={pending || (scelta === "no" && !nota.trim())}
                >
                  {scelta === "si" ? "Accetta la settimana" : "Rifiuta la settimana"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setScelta(null);
                    setNota("");
                  }}
                  disabled={pending}
                >
                  Lascia stare
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* ----------------------------------------------------------------- turno */

function VoceTurno({ turno, motivo }: { turno: Shift; motivo: string }) {
  const router = useRouter();
  const [scriveNo, setScriveNo] = React.useState(false);
  const [nota, setNota] = React.useState("");
  const [pending, start] = React.useTransition();
  const [inCorso, setInCorso] = React.useState<"si" | "no" | null>(null);

  const accetta = () =>
    start(async () => {
      setInCorso("si");
      const esito = await accettaTurno(turno.id);
      if (!esito.ok) toast.error(esito.error);
      else toast.success("Turno accettato.");
      router.refresh();
    });

  const rifiuta = () =>
    start(async () => {
      setInCorso("no");
      const esito = await rifiutaTurno(turno.id, nota);
      if (!esito.ok) {
        toast.error(esito.error);
        router.refresh();
        return;
      }
      setScriveNo(false);
      setNota("");
      toast.success("Rifiuto inviato: il responsabile è stato avvisato.");
      router.refresh();
    });

  return (
    <article className="px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
          <AlertTriangle className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold tracking-tight">
            {dayLong(fromISODate(turno.date))} · {timeRange(turno.start_time, turno.end_time)}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {motivo}{" "}
            <span className="text-muted">
              Il turno è già valido: rispondi solo se vuoi — o se non puoi.
            </span>
          </p>

          {scriveNo ? (
            <div className="mt-3">
              <Field
                label="Perché non puoi"
                htmlFor={`nota-${turno.id}`}
                hint="Facoltativo, ma aiuta il responsabile a rimediare."
              >
                <Textarea
                  id={`nota-${turno.id}`}
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Ho un impegno preso, quel giorno non riesco"
                  maxLength={300}
                />
              </Field>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  onClick={rifiuta}
                  loading={pending && inCorso === "no"}
                  disabled={pending}
                >
                  Rifiuta il turno
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setScriveNo(false);
                    setNota("");
                  }}
                  disabled={pending}
                >
                  Lascia stare
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={accetta}
                loading={pending && inCorso === "si"}
                disabled={pending}
              >
                <Check className="size-3.5" />
                Va bene
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setScriveNo(true)}
                disabled={pending}
              >
                <X className="size-3.5" />
                Non posso
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------- avviso */

/** Come si racconta un avviso: che cosa è successo, in una riga. */
const COSA_E_SUCCESSO: Record<MotivoAvviso, string> = {
  ore_tolte: "Il tuo turno è stato accorciato",
  turno_rimosso: "Un tuo turno è stato tolto",
};

function VoceAvviso({ avviso }: { avviso: Avviso }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const leggi = () =>
    start(async () => {
      const esito = await segnaAvvisoLetto(avviso.id);
      if (!esito.ok) toast.error(esito.error);
      router.refresh();
    });

  const prima = avviso.turno_prima;
  const dopo = avviso.turno_dopo;

  return (
    <article className="px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-muted">
          <Bell className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold tracking-tight">
            {COSA_E_SUCCESSO[avviso.motivo]}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            <span className={cn(dopo && "line-through")}>
              {dayLong(fromISODate(prima.date))} · {timeRange(prima.start_time, prima.end_time)}
            </span>
            {dopo ? (
              <>
                {" → "}
                <strong className="text-text">
                  {dayLong(fromISODate(dopo.date))} · {timeRange(dopo.start_time, dopo.end_time)}
                </strong>
              </>
            ) : null}
          </p>
          <p className="mt-1 text-[12.5px] text-muted">
            Non c&apos;è niente da decidere: è solo perché tu lo sappia.
          </p>
          <div className="mt-3">
            <Button size="sm" variant="secondary" onClick={leggi} loading={pending} disabled={pending}>
              <Check className="size-3.5" />
              Ho letto
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
