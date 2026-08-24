/** Connessione a Postgres per gli script di migrazione e verifica.
 *
 *  L'host diretto (db.<ref>.supabase.co) non e' utilizzabile da qui: il DNS
 *  del provider risponde 127.0.0.1 per qualunque sottodominio. Si passa dal
 *  pooler in modalita' sessione (porta 5432), perche' quella a transazione
 *  non regge le migrazioni. */
import pg from "pg";

const REGIONI = [
  "eu-west-1", "eu-central-1", "eu-west-2", "eu-west-3", "eu-central-2",
  "eu-north-1", "us-east-1", "us-west-1", "ap-southeast-1",
];
const PREFISSI = ["aws-1", "aws-0"];

export async function connetti() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!url) throw new Error("Manca NEXT_PUBLIC_SUPABASE_URL.");
  if (!password) throw new Error("Manca SUPABASE_DB_PASSWORD (sta in .env.db).");

  const ref = new URL(url).hostname.split(".")[0];
  const errori = new Map();

  for (const prefisso of PREFISSI) {
    for (const regione of REGIONI) {
      const host = `${prefisso}-${regione}.pooler.supabase.com`;
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
      try {
        await client.connect();
        return { client, host };
      } catch (e) {
        errori.set(host, e.message);
        // Password rifiutata significa che l'host e' quello giusto: continuare
        // a provare le altre regioni servirebbe solo a perdere tempo.
        if (/password|authentication/i.test(e.message)) {
          throw new Error(`Host ${host} raggiunto, ma la password non va: ${e.message}`);
        }
      }
    }
  }

  const ultimi = [...errori].slice(-3).map(([h, m]) => `  ${h}: ${m}`);
  throw new Error(`Nessun host raggiungibile.\n${ultimi.join("\n")}`);
}
