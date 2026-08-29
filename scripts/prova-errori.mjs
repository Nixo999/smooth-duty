/** Controlli sui messaggi d'errore che vede chi usa l'app.
 *    node --import ./scripts/alias.mjs scripts/prova-errori.mjs
 *
 *  Due cose si provano, e sono le due che si perdono per prime quando fra sei
 *  mesi qualcuno aggiunge un caso:
 *
 *  1. **nessun messaggio nomina il ferro.** Basta un ramo scritto di fretta
 *     che rimandi indietro `error.message` e il negoziante rilegge «violates
 *     row-level security policy». E' il guasto che questo file esiste per
 *     impedire, e a occhio non si vede: i rami sono venti;
 *  2. **ogni messaggio e' fatto di due frasi.** La prima dice cosa e'
 *     successo ai dati, la seconda cosa si fa adesso. Un messaggio con una
 *     frase sola e' quasi sempre uno che si e' fermato sul guasto;
 *  3. **nessuna frase usa le parole che l'app non usa.** Il 30 agosto 2026 ne
 *     sono passate due — «monte ore» e «causale» — in un file appena scritto,
 *     e questo controllo c'era gia': guardava solo il ferro. I due elenchi
 *     sono diversi e vanno cercati tutti e due.
 *
 *  Il terzo controllo non passa dai casi qui sotto ma **dal sorgente**: un
 *  ramo che nessun caso di prova tocca ha la stessa parola sbagliata, e resta
 *  invisibile finche' non la legge un negoziante. Si leggono le stringhe di
 *  **tutto `src/`** — non del solo errori.ts, che e' il buco da cui la
 *  parola e' rientrata due volte — tolti i commenti, dove nominare Postgres
 *  e' invece giusto. */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ErroreLeggibile, messaggioErrore, serveAggiornamento } from "../src/lib/errori.ts";

let errori = 0;
const ok = (titolo, condizione, extra = "") => {
  if (!condizione) errori++;
  console.log(`${condizione ? "ok  " : "NO  "}${titolo}`);
  if (!condizione && extra) console.log(`      ${extra}`);
};

/** Le parole che chi usa l'app non puo' vedere: non sa cosa siano e non ha
 *  modo di agire su nessuna. */
const VIETATE =
  /supabase|postgres|postgrest|row-level|row level|policy|schema cache|migrazion|constraint|violates|column|relation|null value|JWT|token|RLS|\bSQL\b/i;

/** Le parole che l'app non usa da nessuna parte: sono nostre, non di chi
 *  lavora in negozio. Le sillabe attaccate a un identificatore non contano —
 *  `causale_valida` e' il nome di un vincolo, non una frase — e per questo si
 *  cercano fra confini di parola. */
const VOCABOLARIO = /\bbozz[ae]\b|\bmonte ore\b|\bcausal[ei]\b|\bpreapprovat\w*|\bcon riserva\b/i;

/** I casi veri, presi dai codici che questa app produce davvero. */
const CASI = [
  ["scrittura vietata", { code: "42501", message: 'new row violates row-level security policy for table "shifts"' }],
  ["colonna che non c'e'", { code: "42703", message: "column company_settings.regime_chiamata does not exist" }],
  ["tabella non in cache", { code: "PGRST205", message: "Could not find the table 'public.availability_days' in the schema cache" }],
  ["colonna non in cache", { code: "PGRST204", message: "Could not find the 'regime_chiamata' column of 'company_settings' in the schema cache" }],
  ["doppione generico", { code: "23505", message: 'duplicate key value violates unique constraint "qualcosa_key"' }],
  ["doppione disponibilita", { code: "23505", message: 'duplicate key value violates unique constraint "availability_days_giorno_intero"' }],
  ["doppione settimana", { code: "23505", message: 'duplicate key value violates unique constraint "week_requests_company_id_profile_id_monday_key"' }],
  ["ore e chiamata insieme", { code: "23514", message: 'new row for relation "profiles" violates check constraint "profiles_ore_o_chiamata"' }],
  ["causale non ammessa", { code: "23514", message: 'violates check constraint "absences_causale_valida"' }],
  ["trigger fra aziende", { code: "P0001", message: "Il reparto non appartiene a questa azienda" }],
  ["sessione scaduta", { code: "PGRST301", message: "JWT expired" }],
  ["rete assente", new TypeError("fetch failed")],
  ["password uguale", { message: "New password should be different from the old password." }],
  ["email gia' presa", { message: "A user with this email address has already been registered" }],
  ["guasto sconosciuto", { code: "XX000", message: "internal error: something went very wrong" }],
  ["niente del tutto", undefined],
];

for (const [nome, errore] of CASI) {
  const testo = messaggioErrore(errore);
  ok(`${nome}: non nomina il ferro`, !VIETATE.test(testo), testo);
  ok(`${nome}: parla come l'app`, !VOCABOLARIO.test(testo), testo);
  // Due frasi: due punti fermi, e la seconda non e' vuota.
  const frasi = testo.split(/(?<=\.)\s+/).filter((f) => f.trim().length > 0);
  ok(`${nome}: due frasi`, frasi.length >= 2, testo);
}

// Il messaggio del trigger e' gia' scritto per chi legge: si tiene, perche'
// sa *quale* dato non torna. Una mappa per codice lo appiattirebbe su un
// generico, che e' un peggioramento misurabile.
ok(
  "il trigger conserva la sua frase",
  messaggioErrore({ code: "P0001", message: "Il reparto non appartiene a questa azienda" })
    .startsWith("Il reparto non appartiene a questa azienda."),
);

// Le eccezioni scritte da noi passano intere: sono gia' la frase giusta.
ok(
  "l'errore leggibile passa intero",
  messaggioErrore(new ErroreLeggibile("Il formato .xls e' quello vecchio di Excel.")) ===
    "Il formato .xls e' quello vecchio di Excel.",
);

// La diagnosi che rivela un'installazione incompleta e' l'unica che questa
// app sa fare da sola: se smette di riconoscere questi tre, il sintomo torna
// a essere una pagina di valori di default spacciati per veri.
ok("riconosce la colonna mancante", serveAggiornamento({ code: "42703" }));
ok("riconosce la tabella mancante", serveAggiornamento("Could not find the table 'public.x' in the schema cache"));
ok("non grida al lupo", !serveAggiornamento({ code: "23505", message: "duplicate key" }));

/* --------------------------------------- e adesso tutto il sorgente ---- */

// I casi qui sopra coprono i rami che qualcuno si e' ricordato di elencare.
// Le parole sbagliate finiscono negli altri, e non solo in errori.ts: due
// volte di fila sono rientrate da file che questo controllo non guardava —
// il 30 agosto 2026 da tre server action, con «causale» dentro un messaggio
// di zod. Guardare un file solo era il difetto vero, quindi si legge tutto
// `src/`: ogni stringa scritta nel sorgente puo' finire a schermo.

/** Le stringhe scritte in un file, saltando i commenti — li' Postgres e le
 *  policy si nominano apposta. Si legge carattere per carattere invece che a
 *  righe perche' in `src/` i commenti stanno anche in fondo a una riga di
 *  codice, e un filtro per riga li lascerebbe passare tutti. Di un template
 *  si tiene solo il testo: dentro `${...}` c'e' codice, non una frase. */
function stringheDi(sorgente) {
  const trovate = [];
  let i = 0;
  let riga = 1;
  while (i < sorgente.length) {
    const c = sorgente[i];
    if (c === "\n") { riga++; i++; }
    else if (c === "/" && sorgente[i + 1] === "/") {
      while (i < sorgente.length && sorgente[i] !== "\n") i++;
    } else if (c === "/" && sorgente[i + 1] === "*") {
      i += 2;
      while (i < sorgente.length && !(sorgente[i] === "*" && sorgente[i + 1] === "/")) {
        if (sorgente[i] === "\n") riga++;
        i++;
      }
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const apertura = riga;
      let j = i + 1;
      let testo = "";
      while (j < sorgente.length) {
        if (sorgente[j] === "\\") { testo += sorgente[j + 1]; j += 2; continue; }
        if (sorgente[j] === c) break;
        // Virgolette semplici: una riga sola. Se non si chiude non e' una
        // stringa (di solito e' l'apostrofo di una parola in un commento
        // gia' saltato) e fermarsi qui evita di inghiottire mezzo file.
        if (sorgente[j] === "\n") { if (c !== "`") break; riga++; }
        testo += sorgente[j];
        j++;
      }
      trovate.push({ testo: testo.replace(/\$\{[^}]*\}/g, " "), riga: apertura });
      i = j + 1;
    } else i++;
  }
  return trovate;
}

/** Quello che sembra una frase ma non lo e'. Tre casi, e nessuno arriva mai
 *  sotto gli occhi di chi lavora in negozio:
 *  - il percorso di un import (`@/lib/supabase/server`);
 *  - un identificatore minuscolo: il nome di un campo, un id dell'HTML,
 *    un valore salvato (`token_hash`, `permesso-causale`). Una parola che
 *    l'utente legge davvero in questa app comincia per maiuscola;
 *  - i nomi delle variabili d'ambiente, che si scrivono URLATE. */
const nonEUnaFrase = (t) => (t.includes("/") && !/\s/.test(t)) || /^[a-z][a-z0-9_-]*$/.test(t);
const senzaUrlate = (t) => t.replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, " ");

function file(cartella) {
  const dentro = [];
  for (const nome of readdirSync(cartella, { withFileTypes: true })) {
    const percorso = join(cartella, nome.name);
    if (nome.isDirectory()) dentro.push(...file(percorso));
    else if (/\.tsx?$/.test(nome.name)) dentro.push(percorso);
  }
  return dentro;
}

const SRC = fileURLToPath(new URL("../src", import.meta.url));
let lette = 0;
for (const percorso of file(SRC)) {
  const corto = relative(SRC, percorso).replaceAll("\\", "/");
  for (const { testo, riga } of stringheDi(readFileSync(percorso, "utf8"))) {
    if (nonEUnaFrase(testo)) continue;
    lette++;
    const frase = senzaUrlate(testo);
    if (VOCABOLARIO.test(frase)) {
      errori++;
      console.log(`NO  parola che l'app non usa, in src/${corto}:${riga}`);
      console.log(`      ${testo}`);
    }
    if (VIETATE.test(frase)) {
      errori++;
      console.log(`NO  nome del ferro, in src/${corto}:${riga}`);
      console.log(`      ${testo}`);
    }
  }
}
// Se un giorno la lettura si rompe in silenzio, il controllo passerebbe
// sempre: questo numero e' l'unica prova che ha guardato qualcosa.
ok("le stringhe del sorgente si leggono davvero", lette > 500, `${lette} lette`);
ok("nessuna parola vietata in tutto src/", errori === 0);

console.log("");
console.log(errori === 0 ? "tutto a posto" : `${errori} controlli falliti`);
process.exit(errori === 0 ? 0 : 1);
