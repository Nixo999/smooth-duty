import { esci } from "@/app/(auth)/actions";
import { AppShell, type Section } from "@/components/app-shell";
import { getViewer, requireMember } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Due chiamate, una sola andata a Supabase: `getViewer` e' memorizzata per
  // richiesta, e `requireMember` non fa altro che chiederle la stessa cosa.
  const profile = await requireMember();
  const viewer = await getViewer();

  const sections: Section[] = [
    { href: "/turni", label: profile.role === "capo" ? "Turni" : "I miei turni", icon: "calendar" },
    // Anche il dipendente: serve a lui per sapere se la giornata è coperta.
    { href: "/supervisione", label: "Supervisione", icon: "eye" },
    ...(profile.role === "capo"
      ? ([
          { href: "/prospetto", label: "Prospetto", icon: "prospetto" },
          { href: "/squadra", label: "Squadra", icon: "users" },
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
        roleLabel: profile.role === "capo" ? "Responsabile" : "Dipendente",
      }}
      esci={esci}
    >
      {children}
    </AppShell>
  );
}
