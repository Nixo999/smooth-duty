/** Legge la scadenza dell'access token Supabase dai cookie, senza rete.
 *
 *  Serve al proxy per decidere se il rinnovo del token va fatto davvero:
 *  farlo a ogni richiesta costa un giro fino a Supabase (~90 ms) che quasi
 *  sempre non rinnova niente, perche' il token vive un'ora.
 *
 *  Non verifica la firma, e va bene cosi': qui si decide solo *quando*
 *  rinnovare. Chi scrivesse nei cookie una scadenza falsa otterrebbe
 *  soltanto di saltare il rinnovo — e ogni pagina valida comunque il token
 *  con `getUser()`, firma compresa, prima di dare qualunque dato. */

type Cookie = { name: string; value: string };

function base64UrlDecode(s: string): string {
  const conPiu = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = conPiu.length % 4;
  return atob(pad ? conPiu + "=".repeat(4 - pad) : conPiu);
}

/** I claim dell'access token, letti dai cookie e basta. Null = "non so". */
function claimsDalCookie(cookies: Cookie[]): { exp?: number; sub?: string } | null {
  try {
    // La sessione sta in `sb-<progetto>-auth-token`, spezzata in `.0`, `.1`…
    // quando non entra in un cookie solo. Si ricompone in ordine.
    const pezzi = cookies
      .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
      .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
    if (pezzi.length === 0) return null;

    const grezzo = pezzi.map((c) => c.value).join("");
    const json = grezzo.startsWith("base64-")
      ? base64UrlDecode(grezzo.slice("base64-".length))
      : decodeURIComponent(grezzo);

    const sessione = JSON.parse(json) as { access_token?: string };
    const jwt = sessione.access_token;
    if (!jwt) return null;

    return JSON.parse(base64UrlDecode(jwt.split(".")[1])) as {
      exp?: number;
      sub?: string;
    };
  } catch {
    // Formato inatteso: chi chiama si comporta come se non ci fosse niente.
    return null;
  }
}

/** Unix seconds della scadenza, oppure null se non si riesce a leggerla.
 *  Null significa "non lo so": chi chiama deve comportarsi come se il token
 *  fosse da rinnovare. */
export function scadenzaAccessToken(cookies: Cookie[]): number | null {
  const exp = claimsDalCookie(cookies)?.exp;
  return typeof exp === "number" ? exp : null;
}

/** L'id utente scritto nel token (claim `sub`), **senza validarlo**: serve a
 *  far partire le letture sul database in parallelo alla validazione vera,
 *  non al posto suo. Chi lo usa deve buttare i risultati se la validazione
 *  non conferma lo stesso id. */
export function utenteDalCookie(cookies: Cookie[]): string | null {
  const sub = claimsDalCookie(cookies)?.sub;
  return typeof sub === "string" && sub ? sub : null;
}
