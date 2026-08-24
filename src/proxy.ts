import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { scadenzaAccessToken } from "@/lib/supabase/scadenza-token";

/** In Next 16 questo file si chiama proxy.ts (era middleware.ts).
 *  Serve a una cosa sola ma essenziale: rinnovare il token Supabase e
 *  riscrivere i cookie. Un Server Component non puo' scrivere cookie, quindi
 *  senza questo passaggio la sessione scadrebbe dopo un'ora e l'utente si
 *  ritroverebbe buttato fuori senza motivo apparente. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Il token vive un'ora: rinnovarlo ha senso solo quando sta per scadere.
  // Prima questo controllo non c'era e ogni richiesta — ogni click, ogni
  // prefetch — pagava un giro fino a Supabase (~90 ms) per sentirsi dire
  // che non c'era niente da rinnovare. La scadenza si legge dal cookie,
  // senza rete; su "non lo so" (null) si rinnova come prima.
  const exp = scadenzaAccessToken(request.cookies.getAll());
  if (exp !== null && exp - Date.now() / 1000 > 120) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Non togliere: e' la chiamata che rinnova il token.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
