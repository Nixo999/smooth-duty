import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { COLONNE_PROFILO_CON_REPARTI } from "@/lib/colonne";
import { createClient } from "@/lib/supabase/server";
import type { SessionUser, Viewer } from "@/lib/types";

/** Chi ha fatto accesso. null se non e' entrato.
 *
 *  `cache()` la fa girare **una volta sola per richiesta**, non una volta per
 *  chiamata. Senza, ogni pagina la eseguiva tre volte — il guscio la chiede
 *  due volte, la pagina una terza — e ogni giro e' un `auth.getUser()` che
 *  va a farsi validare il token da Supabase piu' due letture sul database:
 *  mezzo secondo buttato prima ancora di leggere i turni. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();

  // getUser() e non getSession(): getSession legge il cookie e si fida,
  // getUser fa validare il token da Supabase. Sul server serve il secondo.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileResult, adminResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(`${COLONNE_PROFILO_CON_REPARTI}, company:companies(id, name)`)
      // Per user_id, non per id: da quando una persona può esistere senza
      // account, i due numeri sono cose diverse.
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const row = profileResult.data;
  const company = row?.company
    ? Array.isArray(row.company)
      ? row.company[0]
      : row.company
    : null;

  return {
    userId: user.id,
    email: user.email ?? row?.email ?? "",
    isPlatformAdmin: Boolean(adminResult.data),
    profile:
      row && company
        ? {
            id: row.id,
            company_id: row.company_id,
            user_id: row.user_id,
            full_name: row.full_name,
            email: row.email,
            role: row.role,
            active: row.active,
            must_change_password: row.must_change_password,
            department_id: row.department_id,
            reparti: (row.profile_departments ?? []).map(
              (r: { department_id: string }) => r.department_id,
            ),
            contract_hours: row.contract_hours,
            on_call: row.on_call,
            company,
          }
        : null,
  };
});

/** Pagine dell'azienda: turni e squadra. */
export async function requireMember(): Promise<SessionUser> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.profile) {
    // Amministratore senza azienda: la sua casa e' un'altra.
    redirect(viewer.isPlatformAdmin ? "/admin" : "/login");
  }
  if (!viewer.profile.active) redirect("/login?sospeso=1");

  // Finche' la password provvisoria non e' stata cambiata, l'unica pagina
  // raggiungibile e' quella che la cambia.
  if (viewer.profile.must_change_password) redirect("/cambia-password");

  return viewer.profile;
}

export async function requireCapo(): Promise<SessionUser> {
  const profile = await requireMember();
  if (profile.role !== "capo") redirect("/turni");
  return profile;
}

/** Pagine di amministrazione della piattaforma. */
export async function requirePlatformAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isPlatformAdmin) redirect(viewer.profile ? "/turni" : "/login");
  return viewer;
}
