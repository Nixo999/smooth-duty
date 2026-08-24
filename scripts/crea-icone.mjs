/** Icone della PWA. Android in fase di installazione vuole PNG a 192 e 512.
 *    node scripts/crea-icone.mjs */
import { writeFile, mkdir } from "node:fs/promises";
import { disegnaIcona } from "./lib-icona.mjs";

const dir = new URL("../public/icone/", import.meta.url);
await mkdir(dir, { recursive: true });

for (const size of [192, 512, 180]) {
  const png = disegnaIcona(size);
  await writeFile(new URL(`icona-${size}.png`, dir), png);
  console.log(`icona-${size}.png  ${(png.length / 1024).toFixed(1)} kB`);
}
