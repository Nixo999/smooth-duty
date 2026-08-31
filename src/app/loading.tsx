import { CaricamentoMarchio } from "@/components/ui/caricamento-marchio";

/** L'attesa dell'**apertura**, che e' l'unica che i due loading.tsx dentro
 *  (app) e (admin) non possono coprire.
 *
 *  Il motivo e' come funziona un confine di Suspense: `loading.tsx` avvolge i
 *  *figli* del suo segmento, cioe' vive dentro il layout. All'apertura pero'
 *  e' il layout stesso ad aspettare — `(app)/layout.tsx` e' `async` e prima di
 *  restituire una riga di JSX legge l'utente da Supabase, le impostazioni
 *  dell'azienda e i tre contatori del pallino su «Oggi». Finche' quel `await`
 *  non torna, il confine dentro (app) **non esiste ancora**, quindi non puo'
 *  mostrare niente.
 *
 *  Questo file sta un livello sopra il layout, quindi lo copre: dal primo byte
 *  fino a quando il guscio e' pronto si vede il marchio invece del fondo
 *  vuoto. Fra una pagina e l'altra continua a vincere il confine piu' vicino —
 *  quello dentro (app), col marchio a mezza altezza sotto l'intestazione gia'
 *  disegnata — quindi **le navigazioni restano identiche**.
 *
 *  Usa `CaricamentoMarchio`, che copre tutto schermo: qui e' esatto, perche'
 *  di sotto non c'e' ancora nessuna intestazione da lasciar vedere.
 *
 *  ⚠️ Quello che **non** copre: nell'APK il bianco vero e' prima del primo
 *  byte, quando la webview non ha nemmeno l'HTML. Li' non arriva nessun
 *  loading.tsx — quel pezzo e' lo splash nativo di Android
 *  (`android/app/src/main/res/values/styles.xml`), oggi un'icona ferma. */
export default function Loading() {
  return <CaricamentoMarchio />;
}
