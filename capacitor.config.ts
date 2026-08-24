import type { CapacitorConfig } from "@capacitor/cli";

/** Guscio Android per le prove.
 *
 *  L'app e' Next.js con codice che gira sul server, quindi non si puo'
 *  impacchettare come file statici: l'APK e' una finestra che apre l'app dove
 *  sta girando davvero.
 *
 *  L'indirizzo si passa da fuori perche' quello di rete locale cambia da solo:
 *  basta un riavvio del router e il vecchio APK punta al vuoto.
 *
 *    TURNI_URL=http://192.168.1.212:3000 npm run apk
 *
 *  Per una versione da distribuire va messo l'indirizzo pubblico https, e
 *  cleartext va tolto. */
const url = process.env.TURNI_URL ?? "http://192.168.1.212:3000";

const config: CapacitorConfig = {
  appId: "it.turni.app",
  appName: "Turni",
  // Usata solo se il server non risponde: mostra il perche' invece di una
  // pagina bianca.
  webDir: "capacitor-shell",
  server: {
    url,
    // Android blocca il traffico in chiaro dalla versione 9: in rete locale
    // non c'e' certificato, quindi va concesso esplicitamente.
    cleartext: url.startsWith("http://"),
  },
  android: {
    backgroundColor: "#08080AFF",
  },
};

export default config;
