/** Ricerca per nome, uguale ovunque si cerchi una persona.
 *
 *  Sta in un file suo perche' la stessa domanda — «questo nome corrisponde a
 *  quello che sto scrivendo?» — la fanno la Squadra e i Turni: due risposte
 *  diverse vorrebbero dire che la stessa persona si trova da una parte e non
 *  dall'altra. */

/** Toglie accenti e maiuscole: chi cerca "nicolo" deve trovare "Nicolò".
 *  I segni si scompongono con NFD e poi si buttano via: e' l'unico modo che
 *  non ha bisogno di una tabella di lettere accentate da tenere aggiornata. */
function normalizza(testo: string): string {
  return testo
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Vero se ogni pezzo scritto compare nel testo, in qualunque ordine: cosi'
 *  "ros mar" trova "Mario Rossi" anche a nome e cognome invertiti, che e'
 *  come mezza squadra viene chiamata a voce. */
export function corrisponde(testo: string, cerca: string): boolean {
  const q = normalizza(cerca);
  if (!q) return true;
  const t = normalizza(testo);
  return q.split(" ").every((pezzo) => t.includes(pezzo));
}
