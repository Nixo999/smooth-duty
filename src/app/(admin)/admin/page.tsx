import { Aziende } from "@/components/admin/aziende";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CompanyRow } from "@/lib/types";

type Row = {
  id: string;
  name: string;
  created_at: string;
  profiles: { id: string; full_name: string; email: string; role: string }[];
};

export default async function AdminPage() {
  await requirePlatformAdmin();

  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("id, name, created_at, profiles(id, full_name, email, role)")
    .order("created_at", { ascending: false });

  const companies: CompanyRow[] = ((data ?? []) as Row[]).map((c) => ({
    id: c.id,
    name: c.name,
    created_at: c.created_at,
    people: c.profiles.length,
    responsabili: c.profiles
      .filter((p) => p.role === "capo")
      .map((p) => ({ full_name: p.full_name, email: p.email })),
  }));

  return <Aziende companies={companies} />;
}
