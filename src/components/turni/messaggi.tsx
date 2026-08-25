"use client";

import { AlertTriangle, Check, Inbox, Mail, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { apriMessaggi, chiudiMessaggio } from "@/app/(app)/turni/actions";
import { Button } from "@/components/ui/button";
import { dayLong, fromISODate } from "@/lib/date";
import type { MessaggioTurno, MotivoRifiuto } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Come si chiama, in una riga, la cosa che e' stata rifiutata. */
const COSA: Record<MotivoRifiuto, string> = {
  straordinario: "lo straordinario",
  modifica: "il cambio di turno",
  modifica_straordinario: "il cambio di turno con straordinario",
  orario_diverso: "il turno con orario diverso dal contratto",
  cambio_reparto: "il cambio di reparto",
};

/** I no dei dipendenti, e cosa ne e' seguito.
 *
 *  Un turno preapprovato vale finche' l'interessato non lo rifiuta. Quando
 *  succede il responsabile lo scopre qui, ed e' aprendo questi messaggi che
 *  il rifiuto produce il suo effetto: il turno torna com'era, oppure — se
 *  era nato adesso — se ne va e resta da rifare. Il turno cambia mentre il
 *  responsabile guarda, non alle sue spalle. */
export function Messaggi({
  messaggi,
  nomeDi,
  onCreaTurno,
}: {
  /** Solo quelli aperti: un messaggio risolto ha finito il suo lavoro. */
  messaggi: MessaggioTurno[];
  nomeDi: (profileId: string) => string;
  /** Il pannello del turno nuovo, gia' puntato su persona e giorno da
   *  coprire. Il giorno puo' stare in un'altra settimana: il pannello ha il
   *  suo campo data, quindi non c'e' niente da navigare. */
  onCreaTurno: (profileId: string, giorno: string) => void;
}) {
  const router = useRouter();
  const [inCorso, start] = React.useTransition();

  const daVedere = messaggi.filter((m) => !m.visto_at);
  const visti = messaggi.filter((m) => m.visto_at);

  const apri = () =>
    start(async () => {
      const esito = await apriMessaggi();
      if (!esito.ok) {
        toast.error(esito.error);
        return;
      }
      router.refresh();
    });

  const chiudi = (id: string) =>
    start(async () => {
      const esito = await chiudiMessaggio(id);
      if (!esito.ok) {
        toast.error(esito.error);
        return;
      }
      router.refresh();
    });

  if (messaggi.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
        <p className="flex items-center gap-2 text-[13px] font-medium">
          <Mail className="size-3.5 text-muted" />
          Messaggi dai dipendenti
        </p>
        {daVedere.length > 0 ? (
          <Button size="sm" onClick={apri} loading={inCorso}>
            <Inbox className="size-3.5" />
            Apri {daVedere.length}{" "}
            {daVedere.length === 1 ? "messaggio" : "messaggi"}
          </Button>
        ) : null}
      </header>

      {daVedere.length > 0 ? (
        <p className="border-b border-border bg-accent-soft px-4 py-2.5 text-[13px] font-medium text-accent">
          {daVedere.length === 1
            ? "Un turno è stato rifiutato."
            : `${daVedere.length} turni sono stati rifiutati.`}{" "}
          Aprendo i messaggi vedi cos&apos;è successo, e i turni si sistemano
          di conseguenza.
        </p>
      ) : null}

      <ul className="divide-y divide-border">
        {visti.map((m) => (
          <Riga
            key={m.id}
            m={m}
            nome={nomeDi(m.profile_id)}
            inCorso={inCorso}
            onCrea={() => onCreaTurno(m.profile_id, m.giorno)}
            onChiudi={() => chiudi(m.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function Riga({
  m,
  nome,
  inCorso,
  onCrea,
  onChiudi,
}: {
  m: MessaggioTurno;
  nome: string;
  inCorso: boolean;
  onCrea: () => void;
  onChiudi: () => void;
}) {
  const giorno = dayLong(fromISODate(m.giorno));
  const daRifare = m.esito === "da_rifare";

  return (
    <li className={cn("px-4 py-3.5", daRifare && "bg-warning-soft/40")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px]">
            <span className="font-medium">{nome}</span> ha rifiutato{" "}
            {COSA[m.motivo]} di <span className="capitalize">{giorno}</span>.
          </p>

          {/* Cos'e' successo al turno: e' la parte che il responsabile deve
              leggere, perche' il tabellone e' gia' cambiato. */}
          {m.esito === "ripristinato" && m.turno_prima ? (
            <p className="mt-1 flex items-start gap-1.5 text-[13px] text-muted">
              <RotateCcw className="mt-0.5 size-3.5 shrink-0 text-success" />
              <span>
                Il turno è tornato com&apos;era:{" "}
                <strong className="tabular-nums text-text">
                  {m.turno_prima.start_time}–{m.turno_prima.end_time}
                </strong>
                {/* Il giorno solo se il ripristino lo riporta indietro:
                    una modifica puo' aver spostato il turno di data, e
                    andarlo a cercare nel giorno sbagliato e' peggio che
                    leggere una riga in piu'. */}
                {m.turno_prima.date !== m.giorno ? (
                  <>
                    {" "}
                    di{" "}
                    <strong className="capitalize text-text">
                      {dayLong(fromISODate(m.turno_prima.date))}
                    </strong>
                  </>
                ) : null}{" "}
                <span className="text-faint">
                  (avevi messo {m.turno_dopo.start_time}–{m.turno_dopo.end_time})
                </span>
              </span>
            </p>
          ) : daRifare ? (
            <p className="mt-1 flex items-start gap-1.5 text-[13px] font-medium text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Il turno {m.turno_dopo.start_time}–{m.turno_dopo.end_time} è
                stato tolto: non c&apos;era un turno di prima a cui tornare.
                Vanno rifatte le ore di {nome} per quel giorno.
              </span>
            </p>
          ) : (
            <p className="mt-1 text-[13px] text-muted">
              Nel frattempo quel turno l&apos;avevi già cambiato o tolto tu:
              vale l&apos;ultima parola tua, il rifiuto non ha toccato niente.
            </p>
          )}

          {m.nota ? (
            <p className="mt-1.5 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">
              «{m.nota}»
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {daRifare ? (
            <Button size="sm" onClick={onCrea} disabled={inCorso}>
              Crea il turno
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={onChiudi}
            loading={inCorso}
            title={
              daRifare
                ? "Ho rimediato in un altro modo"
                : "Ho letto, togli il messaggio"
            }
          >
            <Check className="size-3.5" />
            {daRifare ? "Ho rimediato" : "Ho letto"}
          </Button>
        </div>
      </div>
    </li>
  );
}
