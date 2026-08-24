/** Stampa quello che la Supervisione mostrerà, usando i dati veri e le stesse
 *  funzioni della pagina. Serve a controllare il risultato senza entrare.
 *
 *    node --import ./scripts/alias.mjs --env-file=.env.local \
 *      scripts/vista-reale.mjs "Pizzeria Prova" giorno 2026-08-26
 */
import { formatDuration } from "../src/lib/date.ts";
import { oraDa } from "../src/lib/supervisione/copertura.ts";
import { vistaGiorno, vistaPeriodo } from "../src/lib/supervisione/vista.ts";

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHIAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AZIENDA = process.argv[2] ?? "Pizzeria Prova";
const LIVELLO = process.argv[3] ?? "giorno";
const DENTRO = process.argv[4] ?? new Date().toISOString().slice(0, 10);

const h = { apikey: CHIAVE, Authorization: `Bearer ${CHIAVE}` };
const get = async (p) => (await fetch(`${URL_BASE}/rest/v1/${p}`, { headers: h })).json();

const [y, m] = DENTRO.split("-").map(Number);
const estremi =
  LIVELLO === "giorno"
    ? { da: DENTRO, a: DENTRO }
    : LIVELLO === "mese"
      ? {
          da: `${y}-${String(m).padStart(2, "0")}-01`,
          a: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
        }
      : { da: `${y}-01-01`, a: `${y}-12-31` };

const primo = (() => {
  const d = new Date(`${estremi.da}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
})();

const [azienda] = await get(
  `companies?select=id,name&name=eq.${encodeURIComponent(AZIENDA)}`,
);
if (!azienda) throw new Error(`Azienda "${AZIENDA}" non trovata.`);

const persone = await get(
  `profiles?select=id,full_name,department_id,contract_hours,on_call&company_id=eq.${azienda.id}&active=eq.true`,
);
const turni = await get(
  `shifts?select=id,profile_id,date,start_time,end_time,title,department_id&company_id=eq.${azienda.id}&date=gte.${primo}&date=lte.${estremi.a}`,
);
const reparti = await get(
  `departments?select=id,name,hue&company_id=eq.${azienda.id}&order=position`,
);
const fasce = await get(
  `coverage_bands?select=id,department_id,name,start_time,end_time,required,weekdays&company_id=eq.${azienda.id}`,
);
const assenze = await get(
  `absences?select=id,profile_id,type,start_date,end_date&company_id=eq.${azienda.id}` +
    `&start_date=lte.${estremi.a}&or=(end_date.is.null,end_date.gte.${primo})`,
);

console.log(`${azienda.name} — ${LIVELLO} — ${estremi.da} → ${estremi.a}`);
console.log(`(${turni.length} turni letti)\n`);

if (LIVELLO === "giorno") {
  const v = vistaGiorno({
    giorno: estremi.da,
    turni, persone, reparti, fasce, assenze,
  });

  console.log(`MANCANZE: ${formatDuration(v.minutiScoperti)} scoperte, ${v.buchi.length} righe`);
  for (const b of v.buchi) {
    console.log(`  ${oraDa(b.da)}-${oraDa(b.a)}  ${b.reparto}: servono ${b.richiesti}, presenti ${b.presenti}`);
  }
  for (const s of v.daAssegnare) {
    console.log(`  ${oraDa(s.da)}-${oraDa(s.a)}  da assegnare${s.title ? ` (${s.title})` : ""}`);
  }
  console.log("");
  console.log("SCHEDE PERSONA:");
  for (const p of v.persone) {
    const barre = p.segmenti.map((s) => `${oraDa(s.da)}-${oraDa(s.a)}`).join(", ");
    console.log(
      `  ${p.nome.padEnd(16)} ${String(p.reparto ?? "-").padEnd(8)} ` +
        `${formatDuration(p.minuti).padStart(6)}  ${barre || "riposo"}` +
        (p.assenza ? `  [${p.assenza}, non conta]` : ""),
    );
  }
} else {
  const v = vistaPeriodo({ tipo: LIVELLO, ...estremi, turni, persone, reparti, fasce, assenze });

  console.log(
    `MANCANZE: ${formatDuration(v.minutiScoperti)} scoperte in ${v.giorniConBuchi} giorni su ${v.giorni}`,
  );
  console.log(`colonne: ${v.colonne.length}\n`);
  console.log("SCHEDE PERSONA:");
  for (const p of v.persone) {
    const attesi = p.attesi === null ? "a chiamata" : `di ${formatDuration(Math.round(p.attesi))}`;
    const assenze = p.assenze.map((c) => `${c.causale} ${c.giorni}g`).join(", ");
    console.log(
      `  ${p.nome.padEnd(16)} ${formatDuration(p.minuti).padStart(8)} ${attesi.padEnd(14)}` +
        (p.turniSaltati ? `  ${p.turniSaltati} turni saltati (${formatDuration(p.minutiPersi)})` : "") +
        (assenze ? `  [${assenze}]` : ""),
    );
  }
}
