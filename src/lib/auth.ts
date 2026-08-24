import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { COLONNE_PROFILO_CON_REPARTI } from "@/lib/colonne";
import {
  scadenzaAccessToken,
  utenteDalCookie,
} from "@/lib/supabase/scadenza-token";
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

  const leggi = (uid: string) =>
    Promise.all([
      supabase
        .from("profiles")
        .select(`${COLONNE_PROFILO_CON_REPARTI}, company:companies(id, name)`)
        // Per user_id, non per id: da quando una persona può esistere senza
        // account, i due numeri sono cose diverse.
        .eq("user_id", uid)
        .maybeSingle(),
      supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", uid)
        .maybeSingle(),
    ]);

  // L'id utente sta già scritto nel token: le letture sul database possono
  // partire subito, in parallelo alla validazione — che resta obbligatoria,
  // non è una scorciatoia. Se non conferma lo stesso id, quello che si è
  // letto si butta e si rilegge con l'id vero. Prima erano due giri in fila,
  // e dal server di produzione ogni giro è un'andata fino a Supabase.
  // Solo con un token ancora fresco: uno scaduto farebbe partire query
  // destinate a fallire, per poi rifarle comunque.
  const cookieStore = await cookies();
  const tutti = cookieStore.getAll();
  const exp = scadenzaAccessToken(tutti);
  const fresco = exp !== null && exp - Date.now() / 1000 > 120;
  const subOttimista = fresco ? utenteDalCookie(tutti) : null;
  const promessaDati = subOttimista
    ? leggi(subOttimista).catch(() => null)
    : null;

  // getUser() e non getSession(): getSession legge il cookie e si fida,
  // getUser fa validare il token da Supabase. Sul server serve il secondo.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const anticipati =
    subOttimista === user.id && promessaDati ? await promessaDati : null;
  const [profileResult, adminResult] = anticipati ?? (await leggi(user.id));

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
            preset_start: row.preset_start,
            preset_end: row.preset_end,
            company,
          }
        : null,
  };
});

/** Dove finisce chi apre l'app, dato chi e'. Lo usano lo smistamento di
 *  pagina e il login: il login manda direttamente qui, senza passare da "/"
 *  — su rete lenta quel passaggio era un intero giro in piu'. */
export function destinazioneDi(viewer: Viewer | null): string {
  if (!viewer) return "/login";
  if (viewer.profile?.must_change_password) return "/cambia-password";
  if (viewer.profile) return "/turni";
  if (viewer.isPlatformAdmin) return "/admin";
  // Autenticato ma senza profilo ne' amministrazione: account orfano.
  return "/login?orfano=1";
}

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
