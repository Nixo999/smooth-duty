/** Stampa la tabella del Prospetto usando i dati veri e le stesse funzioni
 *  della pagina. Serve a controllare i numeri senza entrare nell'app.
 *
 *    node --import ./scripts/alias.mjs --env-file=.env.local \
 *      scripts/prospetto-reale.mjs "Pizzeria Prova" mese 2026-08-26
 */
import { ETICHETTA } from "../src/lib/assenze.ts";
import { formatDuration } from "../src/lib/date.ts";
import { calcolaProspetto } from "../src/lib/prospetto.ts";

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
    const fine = new Date(d);
    fine.setDate(fine.getDate() + 6);
    return { da: d.toISOString().slice(0, 10), a: fine.toISOString().slice(0, 10) };
  }
  if (LIVELLO === "mese") {
    return {
      da: `${y}-${String(m).padStart(2, "0")}-01`,
      a: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
    };
  }
  return { da: `${y}-01-01`, a: `${y}-12-31` };
})();

const [azienda] = await get(
  `companies?select=id,name&name=eq.${encodeURIComponent(AZIENDA)}`,
);
if (!azienda) throw new Error(`Azienda "${AZIENDA}" non trovata.`);

const dati = calcolaProspetto({
  ...estremi,
  persone: await get(
    `profiles?select=id,full_name,department_id,contract_hours,on_call&company_id=eq.${azienda.id}&active=eq.true`,
  ),
  reparti: await get(
    `departments?select=id,name,hue&company_id=eq.${azienda.id}&order=position`,
  ),
  turni: await get(
    `shifts?select=profile_id,date,start_time,end_time&company_id=eq.${azienda.id}&date=gte.${estremi.da}&date=lte.${estremi.a}`,
  ),
  assenze: await get(
    `absences?select=id,profile_id,type,start_date,end_date&company_id=eq.${azienda.id}` +
      `&start_date=lte.${estremi.a}&or=(end_date.is.null,end_date.gte.${estremi.da})`,
  ),
});

const ore = (m) => (m > 0 ? formatDuration(m) : "—");

console.log(`${azienda.name} — ${LIVELLO} — ${estremi.da} → ${estremi.a} (${dati.giorni} giorni)\n`);
console.log(
  `RIEPILOGO  effettive ${formatDuration(dati.totale.effettivi)} · ` +
    `attese ${dati.totale.attesi === null ? "—" : formatDuration(Math.round(dati.totale.attesi))} · ` +
    `perse ${formatDuration(dati.totale.persi)} · scoperti ${formatDuration(dati.scopertiMinuti)}\n`,
);

const intestazioni = ["Nome", "Assenze", ...dati.causali.map((c) => ETICHETTA(c))];
const larghezze = [20, 9, ...dati.causali.map(() => 12)];
const riga = (celle) =>
  celle.map((c, i) => String(c).padEnd(larghezze[i])).join(" ");

console.log(riga(intestazioni));
console.log(larghezze.map((n) => "-".repeat(n)).join(" "));

for (const r of dati.righe) {
  const totale = Object.values(r.perCausale).reduce((n, x) => n + x, 0);
  console.log(
    riga([
      r.nome,
      ore(totale),
      ...dati.causali.map((c) => {
        const minuti = r.perCausale[c] ?? 0;
        const giorni = r.giorniPerCausale[c] ?? 0;
        if (minuti > 0) return formatDuration(minuti);
        return giorni > 0 ? `— (${giorni}g)` : "—";
      }),
    ]),
  );
}

console.log(larghezze.map((n) => "-".repeat(n)).join(" "));
console.log(
  riga([
    "Totale",
    ore(dati.totaleAssenze),
    ...dati.causali.map((c) => ore(dati.totalePerCausale[c] ?? 0)),
  ]),
);
