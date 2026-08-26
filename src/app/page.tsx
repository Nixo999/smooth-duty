import { redirect } from "next/navigation";
import { destinazioneDi, getViewer } from "@/lib/auth";

/** Smistamento: dove finisce chi apre l'app dipende da cosa e'.
 *
 *  E c'e' un caso che non e' «aprire l'app»: arrivare qui da un link
 *  ricevuto per posta. Succede quando il modello della email e' quello
 *  predefinito di Supabase, che manda all'indirizzo del progetto e basta,
 *  oppure quando l'indirizzo di ritorno che chiediamo non e' fra quelli
 *  ammessi e Supabase ripiega sul Site URL. In tutti e due i casi il codice
 *  arriva **qui**, sulla radice, dove non serve a niente: chi ci atterra
 *  viene mandato al login come un estraneo qualunque, con la sua password
 *  ancora da rifare.
 *
 *  Riconoscerlo e passarlo a /conferma costa tre righe e toglie di mezzo il
 *  modo piu' facile di rompere il recupero password. Non sostituisce le
 *  impostazioni giuste — con il modello predefinito il link vale comunque
 *  solo sul dispositivo da cui e' partita la richiesta, vedi
 *  docs/08-aperto.md — ma smette di buttare via un codice valido. */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const uno = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const code = uno(params.code);
  const tokenHash = uno(params.token_hash);

  if (code || tokenHash) {
    const q = new URLSearchParams();
    if (code) q.set("code", code);
    if (tokenHash) q.set("token_hash", tokenHash);
    const tipo = uno(params.type);
    if (tipo) q.set("type", tipo);
    redirect(`/conferma?${q}`);
  }

  redirect(destinazioneDi(await getViewer()));
}
