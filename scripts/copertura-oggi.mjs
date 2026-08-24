/** Stampa quello che la pagina Supervisione mostrera' per un giorno, usando
 *  i dati veri del database e le stesse funzioni che usa la pagina.
 *
 *  Serve a controllare il risultato senza dover entrare nell'app.
 *
 *    node --import ./scripts/alias.mjs --env-file=.env.local \
 *      scripts/copertura-oggi.mjs "Pizzeria Prova" 2026-08-22
 */
import {
  buchi as calcolaBuchi,
  copertura,
  fasceDelGiorno,
  intervalloVisibile,
  oraDa,
  segmentiDelGiorno,
} from "../src/lib/supervisione/copertura.ts";

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHIAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AZIENDA = process.argv[2] ?? "Pizzeria Prova";
const GIORNO = process.argv[3] ?? new Date().toISOString().slice(0, 10);

const h = { apikey: CHIAVE, Authorization: `Bearer ${CHIAVE}` };
const get = async (p) => (await fetch(`${URL_BASE}/rest/v1/${p}`, { headers: h })).json();

const ieri = (() => {
  const d = new Date(`${GIORNO}T12:00:00`);
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
  `shifts?select=id,profile_id,date,start_time,end_time,title,department_id&company_id=eq.${azienda.id}&date=in.(${ieri},${GIORNO})`,
);
const reparti = await get(
  `departments?select=id,name,hue,position&company_id=eq.${azienda.id}&order=position`,
);
const fasce = await get(
  `coverage_bands?select=id,department_id,name,start_time,end_time,required,weekdays&company_id=eq.${azienda.id}`,
);
const assenze = await get(
  `absences?select=id,profile_id,type,start_date,end_date&company_id=eq.${azienda.id}` +
    `&start_date=lte.${GIORNO}&or=(end_date.is.null,end_date.gte.${ieri})`,
);

const segmenti = segmentiDelGiorno(turni, persone, GIORNO, ieri, assenze);
const fasceOggi = fasceDelGiorno(fasce, GIORNO);
const vista = intervalloVisibile(segmenti, fasceOggi);

console.log(`${azienda.name} — ${GIORNO}`);
console.log(`asse ${oraDa(vista.da)}–${oraDa(vista.a)}, ${segmenti.length} barre\n`);

for (const r of reparti) {
  const suoi = segmenti.filter((s) => (s.departmentId ?? null) === r.id);
  const sue = fasceOggi.filter((f) => f.departmentId === r.id);
  const fette = copertura(suoi, sue, vista.da, vista.a);
  const buchi = calcolaBuchi(fette);

  console.log(`${r.name.toUpperCase()}  ${buchi.length === 0 ? (sue.length ? "coperto" : "nessuna regola") : `${buchi.length} buchi`}`);

  for (const s of [...suoi].sort((a, b) => a.da - b.da)) {
    const frecce = `${s.daPrima ? "<" : " "}${s.finoADopo ? ">" : " "}`;
    console.log(
      `   ${frecce} ${oraDa(s.da)}-${oraDa(s.a)}  ${s.nome}` +
        (s.profileId ? "" : "  (scoperto)") +
        (s.assenza ? `  (${s.assenza.etichetta}, non conta)` : ""),
    );
  }
  for (const f of sue) {
    console.log(`   regola: ${f.nome} ${oraDa(f.da)}-${oraDa(f.a)} servono ${f.richiesti}`);
  }
  for (const b of buchi) {
    console.log(`   ! ${oraDa(b.da)}-${oraDa(b.a)} servono ${b.richiesti}, presenti ${b.presenti}`);
  }
  console.log("");
}

// Ore assegnate nella settimana, contro quelle da contratto.
const lunedi = (() => {
  const d = new Date(`${GIORNO}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
})();
const domenica = (() => {
  const d = new Date(`${lunedi}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
})();

const settimana = await get(
  `shifts?select=profile_id,date,start_time,end_time&company_id=eq.${azienda.id}&date=gte.${lunedi}&date=lte.${domenica}`,
);
const minuti = new Map();
for (const t of settimana) {
  if (!t.profile_id) continue;
  // Le ore di chi e' assente non si sommano.
  if (assenze.some((a) => a.profile_id === t.profile_id &&
      a.start_date <= t.date && (a.end_date === null || t.date <= a.end_date))) continue;
  const [sh, sm] = t.start_time.split(":").map(Number);
  const [eh, em] = t.end_time.split(":").map(Number);
  let d = eh * 60 + em - (sh * 60 + sm);
  if (d <= 0) d += 1440;
  minuti.set(t.profile_id, (minuti.get(t.profile_id) ?? 0) + d);
}

console.log(`ORE ASSEGNATE vs CONTRATTO — settimana ${lunedi}`);
for (const p of persone.sort((a, b) => a.full_name.localeCompare(b.full_name))) {
  const ore = (minuti.get(p.id) ?? 0) / 60;
  const atteso = p.on_call ? "a chiamata" : p.contract_hours ? `di ${Number(p.contract_hours)}h` : "—";
  const segno = !p.on_call && p.contract_hours && ore > Number(p.contract_hours) ? "  OLTRE" : "";
  console.log(`   ${p.full_name.padEnd(16)} ${ore.toFixed(1).padStart(5)}h  ${atteso}${segno}`);
}
