/** Compila l'APK di debug.
 *
 *  Esiste per una ragione sola: il wrapper di Gradle ha due nomi. Su Windows
 *  e' `gradlew.bat`, altrove e' `./gradlew`. Con `gradlew.bat` scritto nel
 *  package.json il comando non parte sul Mac, e il progetto si lavora da
 *  tutte e due le macchine.
 *
 *  L'indirizzo a cui punta l'APK si passa da fuori, come sempre:
 *
 *    TURNI_URL=http://192.168.1.x:3000 npm run apk
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const android = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "android",
);

const suWindows = process.platform === "win32";
const wrapper = suWindows ? "gradlew.bat" : "./gradlew";

const esito = spawnSync(wrapper, ["assembleDebug"], {
  cwd: android,
  stdio: "inherit",
  // Su Windows il .bat non e' un eseguibile: lo lancia la shell.
  shell: suWindows,
});

if (esito.error) {
  console.error(`\nNon sono riuscito a lanciare ${wrapper}: ${esito.error.message}`);
  process.exit(1);
}

process.exit(esito.status ?? 1);
