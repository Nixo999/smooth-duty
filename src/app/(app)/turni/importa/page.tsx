import { Importa } from "@/components/turni/importa";
import { requireCapo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ImportaPage() {
  const capo = await requireCapo();

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("company_id", capo.company_id)
    .eq("active", true)
    .order("full_name");

  return <Importa people={data ?? []} />;
}
