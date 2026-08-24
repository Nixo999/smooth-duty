/**
 * Esegue un file .sql sul database del progetto.
 *
 * Serve perche' l'API REST di Supabase non sa creare tabelle: la chiave
 * service_role parla con PostgREST, e PostgREST non esegue DDL. Per le
 * migrazioni serve una connessione vera a Postgres.
 *
 *   SUPABASE_DB_PASSWORD=... node --env-file=.env.local scripts/esegui-sql.mjs supabase/04-reparti-e-copertura.sql
 *
 * L'host diretto (db.<ref>.supabase.co) qui non e' raggiungibile: il DNS del
 * provider risponde 127.0.0.1 per qualunque sottodominio. Si passa dal
 * pooler, in modalita' sessione (porta 5432) perche' quella a transazione
 * non regge bene le migrazioni.
 */
import { readFile } from "node:fs/promises";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("Uso: node scripts/esegui-sql.mjs <file.sql>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const password = process.env.SUPABASE_DB_PASSWORD;

if (!password) {
  console.error("Manca SUPABASE_DB_PASSWORD.");
  process.exit(1);
}

const ref = new URL(url).hostname.split(".")[0];
const sql = await readFile(file, "utf8");

// La regione non e' scritta da nessuna parte che si possa leggere senza
// autenticarsi: si provano quelle europee, poi le altre.
const REGIONI = [
  "eu-central-1", "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-2",
  "eu-north-1", "us-east-1", "us-west-1", "ap-southeast-1",
];
const PREFISSI = ["aws-1", "aws-0"];

async function provaConnessione(host) {
  const client = new pg.Client({
    host,
    port: 5432,
    user: `postgres.${ref}`,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    statement_timeout: 120000,
  });
  await client.connect();
  return client;
}

let client = null;
let hostUsato = null;
const errori = new Map();

for (const prefisso of PREFISSI) {
  for (const regione of REGIONI) {
    const host = `${prefisso}-${regione}.pooler.supabase.com`;
    try {
      client = await provaConnessione(host);
      hostUsato = host;
      break;
    } catch (e) {
      errori.set(host, e.message);
      // Password sbagliata significa che l'host e' quello giusto: inutile
      // continuare a provare le altre regioni.
      if (/password|authentication/i.test(e.message)) {
        console.error(`\nHost trovato (${host}) ma la password non va:`);
        console.error(`  ${e.message}`);
        process.exit(2);
      }
    }
  }
  if (client) break;
}

if (!client) {
  console.error("Nessun host raggiungibile. Ultimi errori:");
  for (const [h, m] of [...errori].slice(-4)) console.error(`  ${h}: ${m}`);
  process.exit(3);
}

console.log(`connesso a ${hostUsato}`);
console.log(`eseguo ${file} (${sql.split("\n").length} righe)`);

try {
  // Tutto o niente: una migrazione a meta' e' peggio di una non fatta.
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log("fatto, senza errori.");
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error("\nERRORE, niente e' stato applicato:");
  console.error(`  ${e.message}`);
  if (e.position) console.error(`  posizione ${e.position}`);
  process.exitCode = 4;
} finally {
  await client.end();
}
