import { esci } from "@/app/(auth)/actions";
import { AppShell, type Section } from "@/components/app-shell";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await requirePlatformAdmin();

  const sections: Section[] = [
    { href: "/admin", label: "Aziende", icon: "building" },
    // Se amministra la piattaforma ed e' anche dentro un'azienda, deve poter
    // passare dall'una all'altra senza cambiare account.
    ...(viewer.profile
      ? ([{ href: "/turni", label: viewer.profile.company.name, icon: "calendar" }] as Section[])
      : []),
  ];

  return (
    <AppShell
      title="Amministrazione"
      sections={sections}
      identity={{
        name: viewer.profile?.full_name ?? viewer.email,
        email: viewer.email,
        roleLabel: "Amministratore",
      }}
      esci={esci}
    >
      {children}
    </AppShell>
  );
}
