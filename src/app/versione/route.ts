/** La versione pubblicata, per chi ha l'app aperta da prima.
 *
 *  `NEXT_PUBLIC_VERSIONE` nasce in next.config.ts al momento della build:
 *  ogni deploy ne ha una sua, identica nel server e nei bundle del browser.
 *  Un'app rimasta aperta confronta la propria con questa (vedi
 *  components/controllo-versione.tsx): se non coincidono, là fuori c'è una
 *  versione più nuova e ci si ricarica.
 *
 *  `no-store` fino in fondo: una risposta messa in cache direbbe per sempre
 *  la versione del giorno in cui è stata salvata, cioè esattamente il
 *  contrario del suo mestiere. */
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(process.env.NEXT_PUBLIC_VERSIONE ?? "0", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
