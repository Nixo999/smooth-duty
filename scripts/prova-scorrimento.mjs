/** Controlla le soglie del gesto che cambia pagina col dito.
 *    node scripts/prova-scorrimento.mjs
 *
 *  Un gesto si sbaglia di poco: la soglia troppo bassa fa cambiare pagina a
 *  chi scorre un elenco, quella troppo alta fa sembrare l'app rotta. Qui si
 *  guarda senza telefono in mano. */
import {
  asseDelGesto,
  daCompletare,
  destinazione,
  indiceAttivo,
  nellaZonaDiSistema,
  scostamento,
} from "../src/lib/scorrimento.ts";

let errori = 0;
const uguale = (titolo, atteso, ottenuto) => {
  const ok = JSON.stringify(atteso) === JSON.stringify(ottenuto);
  if (!ok) errori++;
  console.log(`${ok ? "ok  " : "NO  "}${titolo}`);
  if (!ok) console.log(`      atteso   ${JSON.stringify(atteso)}\n      ottenuto ${JSON.stringify(ottenuto)}`);
};

// --- da che parte va il dito -------------------------------------------
uguale("nei primi pixel non si sa", "indeciso", asseDelGesto(6, 4));
uguale("di lato e basta", "orizzontale", asseDelGesto(40, 3));
uguale("in su e basta", "verticale", asseDelGesto(2, 40));
// Il caso che conta: si scorre un elenco lungo e la mano deriva di lato. A
// 45 gradi vince lo scorrimento, o l'app cambia pagina da sola.
uguale("in diagonale a 45 gradi vince lo scorrimento", "verticale", asseDelGesto(30, 30));
uguale("chiaramente di lato la vince il gesto", "orizzontale", asseDelGesto(30, 20));

// --- quale pagina e' aperta --------------------------------------------
const barra = ["/turni", "/supervisione", "/permessi", "/prospetto"];
uguale("la prima voce", 0, indiceAttivo(barra, "/turni"));
uguale("l'ultima voce", 3, indiceAttivo(barra, "/prospetto"));
// L'anteprima di un foglio Excel appena caricato non si butta via col dito.
uguale("una pagina figlia non e' della barra", -1, indiceAttivo(barra, "/turni/importa"));
uguale("una pagina fuori dalla barra", -1, indiceAttivo(barra, "/impostazioni"));

// --- dove si finisce ----------------------------------------------------
uguale("trascinando a sinistra si va avanti", { percorso: "/permessi", verso: "avanti" },
  destinazione(barra, "/supervisione", -80));
uguale("trascinando a destra si torna indietro", { percorso: "/turni", verso: "indietro" },
  destinazione(barra, "/supervisione", 80));
uguale("dalla prima non si va piu' indietro", null, destinazione(barra, "/turni", 80));
uguale("dall'ultima non si va piu' avanti", null, destinazione(barra, "/prospetto", -80));
uguale("da fuori barra non si va da nessuna parte", null, destinazione(barra, "/turni/importa", -80));

// --- quanto si muove il foglio -----------------------------------------
uguale("in mezzo all'elenco segue il dito", -120, scostamento(-120, 1, 4));
// Agli estremi il foglio si muove poco: quel poco e' il modo di dire "di
// qua non c'e' altro" senza scrivere niente.
uguale("all'inizio, tirando indietro, resiste", 28, Math.round(scostamento(100, 0, 4)));
uguale("alla fine, tirando avanti, resiste", -28, Math.round(scostamento(-100, 3, 4)));
uguale("all'inizio, tirando avanti, segue il dito", -100, scostamento(-100, 0, 4));

// --- si completa o si torna indietro ------------------------------------
const lento = { velocita: 0.05, durata: 900 };
uguale("mezza schermata, anche piano", true,
  daCompletare({ dx: -200, larghezza: 390, ...lento }));
uguale("due dita di strada, piano: si torna indietro", false,
  daCompletare({ dx: -60, larghezza: 390, ...lento }));
// Il colpo secco: e' quello che rende il gesto rapido. Senza, per cambiare
// pagina bisognerebbe attraversare mezzo schermo ogni volta.
uguale("colpo secco e corto: si passa", true,
  daCompletare({ dx: -60, larghezza: 390, velocita: 1.2, durata: 120 }));
uguale("veloce solo alla fine di una corsa lunga: non e' un colpo", false,
  daCompletare({ dx: -60, larghezza: 390, velocita: 1.2, durata: 900 }));
uguale("un tocco che ha tremato non e' un colpo", false,
  daCompletare({ dx: -12, larghezza: 390, velocita: 1.2, durata: 60 }));

// --- i bordi sono del sistema -------------------------------------------
uguale("partito dal bordo sinistro: e' del browser", true, nellaZonaDiSistema(8, 390));
uguale("partito dal bordo destro: e' del browser", true, nellaZonaDiSistema(384, 390));
uguale("partito in mezzo: e' nostro", false, nellaZonaDiSistema(120, 390));

console.log("");
console.log(errori === 0 ? "tutto a posto" : `${errori} controlli falliti`);
process.exit(errori === 0 ? 0 : 1);
