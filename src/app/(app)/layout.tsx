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
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_settings")
    .select(COLONNE_IMPOSTAZIONI)
    .eq("company_id", profile.company_id)
    .maybeSingle();
  const impostazioni = normalizzaImpostazioni(data as never);

  const capo = profile.role === "capo";
  const supervisioneVisibile =
    impostazioni.pagina_supervisione &&
    (capo || impostazioni.supervisione_dipendenti);

  // Il calendario di chi e' a chiamata. Sparisce in due casi, e sono due
  // ragioni diverse: sotto il regime `on_demand` non esiste per nessuno —
  // li' i turni si propongono e si accettano uno per uno — e al dipendente
  // che ha un contratto a ore non direbbe niente, anzi gli farebbe dubitare
  // del suo. Come per le pagine spegnibili il controllo sta in due posti,
  // qui e nella pagina: l'indirizzo se lo ricorda il browser.
  const disponibilitaVisibile =
    Boolean(versoDelRegime(impostazioni.regime_chiamata)) &&
    (capo || profile.on_call);

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
