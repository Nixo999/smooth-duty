/** Tiene sveglia la funzione che serve l'app.
 *
 *  Il sito ha poco traffico e Netlify spegne la funzione dopo qualche minuto
 *  di quiete: la visita successiva paga l'avvio a freddo, misurato il
 *  30 agosto 2026 in 200-400ms sopra il tempo normale — che si sommano ai
 *  ~100ms di andata verso la regione (Ohio, e a spostarla Netlify chiede il
 *  piano a pagamento). Questa funzione gira ogni cinque minuti e fa una
 *  richiesta vera a /login: la funzione resta calda e il primo click di una
 *  demo non paga il conto di tutti i minuti di silenzio precedenti.
 *
 *  /login e non /: la radice risponde con un redirect e basta, /login fa
 *  girare il render vero. Il costo sta dentro il piano gratuito: ~8.600
 *  invocazioni al mese su un tetto di 125.000.
 */
export default async () => {
  try {
    const risposta = await fetch("https://denkishift.it/login", {
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "tienila-sveglia (funzione programmata)" },
    });
    console.log(`sveglia: ${risposta.status}`);
  } catch (errore) {
    // Un giro fallito non e' un guasto: il prossimo passa fra cinque minuti.
    console.log(`sveglia mancata: ${errore.message}`);
  }
};

export const config = { schedule: "*/5 * * * *" };
