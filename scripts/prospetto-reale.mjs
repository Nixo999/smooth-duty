/** Stampa quello che il Prospetto mostrerà, usando i dati veri e le stesse
 *  funzioni della pagina.
 *
 *    node --import ./scripts/alias.mjs --env-file=.env.local \
 *      scripts/prospetto-reale.mjs "Pizzeria Prova" mese 2026-08-26
 */
import { formatDuration } from "../src/lib/date.ts";
import { calcolaProspetto } from "../src/lib/prospetto.ts";
import { oraDa } from "../src/lib/supervisione/copertura.ts";

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHIAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AZIENDA = process.argv[2] ?? "Pizzeria Prova";
const LIVELLO = process.argv[3] ?? "settimana";
const DENTRO = process.argv[4] ?? new Date().toISOString().slice(0, 10);

const h = { apikey: CHIAVE, Authorization: `Bearer ${CHIAVE}` };
const get = async (p) => (await fetch(`${URL_BASE}/rest/v1/${p}`, { headers: h })).json();

const [y, m] = DENTRO.split("-").map(Number);
const estremi = (() => {
  if (LIVELLO === "settimana") {
    const d = new Date(`${DENTRO}T12:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const lunedi = d.toISOString().slice(0, 10);
    const fine = new Date(d);
    fine.setDate(fine.getDate() + 6);
    return { da: lunedi, a: fine.toISOString().slice(0, 10) };
  }
  if (LIVELLO === "mese") {
    return {
      da: `${y}-${String(m).padStart(2, "0")}-01`,
      a: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
    };
  }
  return { da: `${y}-01-01`, a: `${y}-12-31` };
})();

const primo = (() => {
  const d = new Date(`${estremi.da}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
})();

const [azienda] = await get(
  `companies?select=id,name&name=eq.${encodeURIComponent(AZIENDA)}`,
);
if (!azienda) throw new Error(`Azienda "${AZIENDA}" non trovata.`);

const dati = calcolaProspetto({
  livello: LIVELLO,
  ...estremi,
  persone: await get(
    `profiles?select=id,full_name,department_id,contract_hours,on_call&company_id=eq.${azienda.id}&active=eq.true`,
  ),
  reparti: await get(
    `departments?select=id,name,hue&company_id=eq.${azienda.id}&order=position`,
  ),
  turni: await get(
    `shifts?select=id,profile_id,date,start_time,end_time,title,department_id&company_id=eq.${azienda.id}&date=gte.${primo}&date=lte.${estremi.a}`,
  ),
  fasce: await get(
    `coverage_bands?select=id,department_id,name,start_time,end_time,required,weekdays&company_id=eq.${azienda.id}`,
  ),
  assenze: await get(
    `absences?select=id,profile_id,type,start_date,end_date&company_id=eq.${azienda.id}` +
      `&start_date=lte.${estremi.a}&or=(end_date.is.null,end_date.gte.${primo})`,
  ),
});

console.log(`${azienda.name} — ${LIVELLO} — ${estremi.da} → ${estremi.a}`);
console.log(
  `${dati.giorni} giorni, di cui ${dati.giorni - dati.giorniSenzaTurni} con turni\n`,
);

console.log("MANCANZE");
console.log(`  scoperte      ${formatDuration(dati.minutiScoperti)} in ${dati.giorniConMancanze} giorni`);
console.log(`  da assegnare  ${formatDuration(dati.minutiDaAssegnare)} (${dati.turniDaAssegnare} turni)`);
console.log(`  perse         ${formatDuration(dati.minutiPersi)}`);
for (const m of dati.mancanze.slice(0, 4)) {
  console.log(`    ${m.giorno} ${oraDa(m.da)}-${oraDa(m.a)} ${m.reparto}: servono ${m.richiesti}, presenti ${m.presenti}`);
}
if (dati.mancanze.length > 4) console.log(`    ...e altre ${dati.mancanze.length - 4}`);

console.log("");
console.log("SCHEDE PERSONA");
for (const r of dati.righe) {
  const attesi = r.attesi === null ? "a chiamata" : `di ${formatDuration(Math.round(r.attesi))}`;
  const assenze = r.assenze.map((c) => `${c.causale} ${c.giorni}g`).join(", ");
  const colonnePiene = r.valori.filter((v) => v > 0).length;
  console.log(
    `  ${r.nome.padEnd(16)} ${String(r.reparto ?? "-").padEnd(8)} ` +
      `${formatDuration(r.minuti).padStart(8)} ${attesi.padEnd(14)} ` +
      `${colonnePiene}/${dati.colonne.length} colonne` +
      (r.turniSaltati ? `  ${r.turniSaltati} saltati (${formatDuration(r.minutiPersi)})` : "") +
      (assenze ? `  [${assenze}]` : ""),
  );
}
console.log("");
console.log(`TOTALE  ${formatDuration(dati.totali.minuti)}` +
  (dati.totali.attesi !== null ? ` di ${formatDuration(Math.round(dati.totali.attesi))}` : ""));
