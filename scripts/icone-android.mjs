/** Icone dell'app Android.
 *
 *  Dalla versione 8 Android usa icone "adattive": uno sfondo e un primo piano
 *  separati, che il sistema ritaglia nella forma scelta dall'utente — cerchio,
 *  goccia, quadrato. Il primo piano va disegnato piccolo e centrato, perche'
 *  il ritaglio puo' mangiarsi fino a un terzo del bordo.
 *
 *    node scripts/icone-android.mjs */
import { writeFile } from "node:fs/promises";
import { disegnaIcona } from "./lib-icona.mjs";

const RES = new URL("../android/app/src/main/res/", import.meta.url);

// lato dell'icona classica, lato della tela adattiva (108dp)
const DENSITA = {
  "mdpi": [48, 108],
  "hdpi": [72, 162],
  "xhdpi": [96, 216],
  "xxhdpi": [144, 324],
  "xxxhdpi": [192, 432],
};

for (const [densita, [classica, adattiva]] of Object.entries(DENSITA)) {
  const dir = new URL(`mipmap-${densita}/`, RES);

  const piena = disegnaIcona(classica);
  await writeFile(new URL("ic_launcher.png", dir), piena);
  await writeFile(new URL("ic_launcher_round.png", dir), piena);

  // 0.62 tiene il disegno dentro la zona sicura con un margine di rispetto.
  const primoPiano = disegnaIcona(adattiva, { sfondo: false, scala: 0.62 });
  await writeFile(new URL("ic_launcher_foreground.png", dir), primoPiano);

  console.log(`mipmap-${densita}: ${classica}px classica, ${adattiva}px adattiva`);
}

await writeFile(
  new URL("values/ic_launcher_background.xml", RES),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0A84FF</color>
</resources>
`,
);
console.log("sfondo icona adattiva: #0A84FF");
