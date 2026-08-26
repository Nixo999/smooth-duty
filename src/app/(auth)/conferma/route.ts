import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Dove atterra chi apre il link ricevuto per posta.
 *
 *  E' un Route Handler e non una pagina per una ragione precisa: qui va
 *  **scritto** un cookie di sessione, e un Server Component i cookie non li
 *  puo' scrivere. E' anche l'unico punto dell'app in cui un codice arrivato
 *  via email diventa una sessione: tenerlo in un posto solo vuol dire avere
 *  un posto solo da guardare quando si ragiona su come si entra.
 *
 *  Due forme, perche' Supabase ne manda due a seconda di come e' scritto il
 *  modello della email:
 *  - `token_hash` + `type` — si verifica qui, e funziona **anche se la posta
 *    si apre su un altro dispositivo**. E' la forma da preferire, ed e'
 *    quella che si ottiene mettendo `{{ .TokenHash }}` nel modello;
 *  - `code` — lo scambio PKCE. Ha bisogno del pezzo di segreto che il
 *    browser si e' tenuto quando la richiesta e' partita, quindi vale solo
 *    sullo stesso dispositivo. E' la forma predefinita, ed e' il motivo per
 *    cui il modello va cambiato: chiedere il recupero dal computer e aprire
 *    la posta dal telefono e' il caso normale, non l'eccezione.
 *
 *  Chi arriva fin qui ha dimostrato di leggere la posta di quell'account, ma
 *  non ha ancora una password sua: si alza `must_change_password`, cosi' il
 *  resto dell'app lo tiene fermo sulla pagina che gliela fa scegliere. Non e'
 *  una scorciatoia inventata per l'occasione — e' lo stesso stato di chi ha
 *  appena ricevuto una password provvisoria, e passa dagli stessi controlli. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type");
  const code = url.searchParams.get("code");

  const vai = (dove: string) => NextResponse.redirect(new URL(dove, url.origin));

  const supabase = await createClient();

  let riuscito = false;
  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      // Il tipo lo dice il link. `recovery` e' il recupero password, ma la
      // stessa porta serve anche a un invito o alla conferma di un
      // indirizzo, se un domani si useranno.
      type: (tipo ?? "recovery") as "recovery" | "invite" | "email",
      token_hash: tokenHash,
    });
    riuscito = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    riuscito = !error;
  }

  // Un link scaduto o gia' usato non e' un errore da nascondere: e' la cosa
  // che capita piu' spesso, e chi ci casca deve sapere che basta chiederne
  // un altro. Non si dice quale delle due sia: sono la stessa cosa per chi
  // deve rimediare.
  if (!riuscito) return vai("/login?recupero=scaduto");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return vai("/login?recupero=scaduto");

  const admin = createAdminClient();
  const { data: profilo } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Chi amministra la piattaforma non ha un profilo aziendale, quindi non ha
  // nemmeno il campo su cui si appoggia questa strada. Meglio dirglielo che
  // lasciarlo dentro senza avergli fatto cambiare niente.
  if (!profilo) {
    await supabase.auth.signOut();
    return vai("/login?recupero=amministratore");
  }

  await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", profilo.id);

  return vai("/cambia-password?recupero=1");
}
