import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/** Quante volte si puo' sbagliare prima che la porta si chiuda per un po'.
 *
 *  Due limiti insieme, perche' rispondono a due attacchi diversi:
 *  - **per indirizzo**: qualcuno prende di mira una persona e prova password
 *    su password. Il tetto e' basso, perche' chi conosce la propria password
 *    non sbaglia dieci volte;
 *  - **per provenienza**: qualcuno prova una password comune su tutti gli
 *    indirizzi dell'azienda, che al primo limite sfuggirebbe — un tentativo
 *    per indirizzo non fa scattare niente. Il tetto e' piu' alto perche'
 *    dietro allo stesso indirizzo di rete ci sta tutto un magazzino.
 *
 *  I numeri sono volutamente generosi: un limite che infastidisce le persone
 *  vere viene disattivato al primo reclamo, e allora non protegge piu'
 *  niente. */
export const LIMITI = {
  accesso: { tetto: 10, finestra: 15 },
  accessoPerRete: { tetto: 50, finestra: 15 },
  /** Il recupero password manda una email a qualcuno: il tetto e' piu'
   *  basso perche' qui l'abuso non e' indovinare, e' riempire di messaggi
   *  la casella di una persona che non ha chiesto niente. */
  recupero: { tetto: 5, finestra: 60 },
} as const;

/** Da dove arriva la richiesta, se si riesce a saperlo.
 *
 *  Netlify mette l'indirizzo vero in un'intestazione sua; `x-forwarded-for`
 *  e' la strada comune e puo' contenere una catena, dove il primo e' il
 *  cliente.
 *
 *  ⚠️ Quando non si sa si risponde **null**, e il limite per rete salta.
 *  La tentazione era di metterci una parola qualsiasi e contare lo stesso:
 *  vorrebbe dire un contatore solo per tutto il mondo, e cinquanta errori di
 *  sconosciuti chiuderebbero fuori un'azienda intera che non ha sbagliato
 *  niente. Il limite per indirizzo resta comunque, ed e' quello che ferma
 *  chi prova a indovinare. */
export async function provenienza(): Promise<string | null> {
  const h = await headers();
  const diretto = h.get("x-nf-client-connection-ip");
  if (diretto?.trim()) return diretto.trim();
  const catena = h.get("x-forwarded-for");
  const primo = catena?.split(",")[0]?.trim();
  return primo || null;
}

type Limite = { tetto: number; finestra: number };

/** Si puo' ancora provare? Non segna niente: separare la domanda dal
 *  tentativo permette di contare **solo** quelli andati male. */
export async function consentito(chiave: string, limite: Limite): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("tentativi_recenti", {
    chiave,
    finestra_minuti: limite.finestra,
  });
  // Se il conto non si puo' fare non si chiude fuori nessuno: un limite
  // rotto che blocca l'app intera sarebbe un danno peggiore di quello che
  // previene. Resta comunque il limite di Supabase sotto.
  if (error) return true;
  return (data ?? 0) < limite.tetto;
}

/** Segna che e' successo qualcosa su questa chiave.
 *
 *  Chi chiama decide cosa vale la pena contare, e i due chiamanti hanno
 *  criteri diversi di proposito: l'accesso conta **solo i tentativi
 *  andati male** — sbagliare non deve costare niente a chi poi entra — il
 *  recupero password conta **ogni richiesta**, perche' li' l'abuso e'
 *  proprio chiederne tante. */
export async function segna(chiave: string): Promise<void> {
  await createAdminClient().rpc("segna_tentativo", { chiave });
}

export async function azzera(chiave: string): Promise<void> {
  await createAdminClient().rpc("azzera_tentativi", { chiave });
}

/** Il messaggio di quando la porta e' chiusa. Non dice quanti tentativi
 *  restano ne' quali erano giusti: sarebbe un aiuto a chi sta provando. */
export const TROPPI_TENTATIVI =
  "Troppi tentativi. Aspetta un quarto d'ora e riprova, oppure chiedi al responsabile una password nuova.";
