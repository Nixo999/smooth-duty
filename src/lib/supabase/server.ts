import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Client Supabase lato server (Server Component, Server Action, Route Handler).
 *  In un Server Component i cookie sono in sola lettura: la setAll fallisce e
 *  viene ignorata di proposito, perche' il refresh del token lo fa il proxy. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component: sola lettura. Ci pensa il proxy.
          }
        },
      },
    },
  );
}
