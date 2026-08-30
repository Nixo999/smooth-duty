import { esci } from "@/app/(auth)/actions";
import { AppShell, type Section } from "@/components/app-shell";
import { getViewer, requireMember } from "@/lib/auth";
import { versoDelRegime } from "@/lib/disponibilita";
import {
  COLONNE_IMPOSTAZIONI,
  normalizzaImpostazioni,
} from "@/lib/impostazioni";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Due chiamate, una sola andata a Supabase: `getViewer` e' memorizzata per
  // richiesta, e `requireMember` non fa altro che chiederle la stessa cosa.
  const profile = await requireMember();
  const viewer = await getViewer();

  // Il menu dipende dalle impostazioni: un'azienda puo' aver spento pagine
  // che non le servono, e la Supervisione puo' essere riservata al
  // responsabile. Le pagine spente qui spariscono dal menu, e si rifiutano
  // di aprirsi anche dal loro indirizzo: quel controllo sta in ciascuna.
  const capo = profile.role === "capo";

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("company_settings")
    .select(COLONNE_IMPOSTAZIONI)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  // Se la lettura non riesce, `normalizzaImpostazioni` restituisce i default
  // e il menu li mostra come se fossero le scelte dell'azienda: fino a qui
  // era una bugia silenziosa, non se ne accorgeva nessuno.
  //
  // **Il menu resta com'e' anche in questo caso**, ed e' una scelta: qui si
  // costruisce il guscio di tutta l'app, e rifiutarsi di disegnarlo
  // chiuderebbe fuori dall'app intera invece che da una pagina. Cosa debba
  // fare il menu quando le impostazioni non si leggono e' una decisione di
  // prodotto, ed e' sospesa
  // (05-Decisioni/2026-08-29-architettura-interfaccia-denkishift).
  //
  // La bugia pero' non arriva piu' in fondo: **ogni pagina che dipende dalle
  // impostazioni ora controlla la sua lettura** e lo dice invece di mostrare
  // i default. Chi apre una voce di menu di troppo trova la verita' li'. Qui
  // resta il guasto scritto nel registro del server, che e' l'unico posto in
  // cui serve davvero.
  if (error) {
    console.error("[impostazioni] lettura fallita, il menu usa i default:", error.message);
  }

  const impostazioni = normalizzaImpostazioni(data as never);

  const supervisioneVisibile =
    impostazioni.pagina_supervisione &&
    (capo || impostazioni.supervisione_dipendenti);

  // Il calendario di chi e' a chiamata, ed e' **solo del dipendente**: il
  // responsabile le stesse dichiarazioni le vede e le scrive dentro il
  // tabellone, accanto ai turni su cui deve decidere. Una voce di menu in
  // piu' lo manderebbe a guardare altrove una cosa che ha gia' sotto gli
  // occhi.
  //
  // Sparisce anche al dipendente in due casi: sotto il regime `on_demand`
  // non c'e' niente da segnare, e chi ha un contratto a ore non ha un
  // calendario da riempire — anzi, trovarlo nel menu gli farebbe dubitare
  // del suo contratto. Come per le pagine spegnibili il controllo sta in due
  // posti, qui e nella pagina: l'indirizzo se lo ricorda il browser.
  const disponibilitaVisibile =
    !capo &&
    profile.on_call &&
    impostazioni.pagina_disponibilita &&
    Boolean(versoDelRegime(impostazioni.regime_chiamata));

  // La pagina «Oggi» c'e' stata per un giorno — 30 agosto 2026 — ed e' stata
  // tolta da Nicola: per adesso non serve, e il tabellone resta la casa.
  // Sta nella storia di git, non in un ramo morto qui dentro.
  const sections: Section[] = [
    { href: "/turni", label: capo ? "Turni" : "I miei turni", icon: "calendar" },
    // Anche il dipendente, se l'azienda vuole: gli serve per sapere se la
    // giornata e' coperta e chi c'e' con lui.
    ...(supervisioneVisibile
      ? ([{ href: "/supervisione", label: "Supervisione", icon: "eye" }] as Section[])
      : []),
    // Per tutti: il dipendente chiede, il responsabile conferma.
    ...(impostazioni.pagina_permessi
      ? ([{ href: "/permessi", label: "Permessi", icon: "sun" }] as Section[])
      : []),
    ...(disponibilitaVisibile
      ? ([
          {
            href: "/disponibilita",
            label: "Disponibilità",
            icon: "disponibilita",
          },
        ] as Section[])
      : []),
    ...(capo && impostazioni.pagina_prospetto
      ? ([{ href: "/prospetto", label: "Prospetto", icon: "prospetto" }] as Section[])
      : []),
  ];

  // Fuori dalla barra, dentro la tendina dell'iniziale: si aprono una volta a
  // settimana o una volta al mese, e occupavano tre dei sette posti che
  // mandavano la barra in sofferenza. «Aziende» in particolare cambia guscio,
  // titolo e menu senza preavviso a chi la tocca per sbaglio — e sta
  // nell'unico account con cui si fa vedere l'app.
  const voci: Section[] = [
    ...(capo
      ? ([
          { href: "/squadra", label: "Squadra", icon: "users" },
          { href: "/impostazioni", label: "Impostazioni", icon: "settings" },
        ] as Section[])
      : []),
    // Chi amministra la piattaforma ed e' anche dentro un'azienda deve poter
    // tornare all'elenco senza cambiare account.
    ...(viewer?.isPlatformAdmin
      ? ([{ href: "/admin", label: "Aziende", icon: "building" }] as Section[])
      : []),
  ];

  return (
    <AppShell
      title={profile.company.name}
      sections={sections}
      voci={voci}
      identity={{
        name: profile.full_name,
        email: profile.email ?? "",
        roleLabel: capo ? "Responsabile" : "Dipendente",
      }}
      esci={esci}
    >
      {children}
    </AppShell>
  );
}
