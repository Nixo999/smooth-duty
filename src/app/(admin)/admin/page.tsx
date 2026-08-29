import { Aziende } from "@/components/admin/aziende";
import { ErroreDati } from "@/components/ui/errore-dati";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CompanyRow } from "@/lib/types";

type Row = {
  id: string;
  name: string;
  created_at: string;
  profiles: {
    id: string;
    user_id: string | null;
    full_name: string;
    email: string | null;
    role: "capo" | "dipendente";
    must_change_password: boolean;
  }[];
};

export default async function AdminPage() {
  await requirePlatformAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, created_at, profiles(id, user_id, full_name, email, role, must_change_password)",
    )
    .order("created_at", { ascending: false });

  // Senza questo controllo un errore di lettura si presenta come «non c'e'
  // nessuna azienda», che e' la stessa schermata di un database appena
  // installato: la differenza fra «non c'e' niente» e «non si riesce a
  // chiedere» qui vale tutto.
  if (error) {
    return <ErroreDati cosa="le aziende" dettaglio={error.message} />;
  }

  const companies: CompanyRow[] = ((data ?? []) as Row[]).map((c) => ({
    id: c.id,
    name: c.name,
    created_at: c.created_at,
    people: c.profiles.length,
    responsabili: c.profiles
      .filter((p) => p.role === "capo")
      .map((p) => ({ full_name: p.full_name, email: p.email ?? "—" })),
    persone: [...c.profiles].sort(
      (x, y) => x.role.localeCompare(y.role) || x.full_name.localeCompare(y.full_name),
    ),
  }));

  return <Aziende companies={companies} />;
}
