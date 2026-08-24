/** Disegno dell'icona e codifica PNG, senza dipendenze esterne.
 *  Usato sia per le icone della PWA sia per quelle dell'app Android. */
import { deflateSync } from "node:zlib";

export const ACCENT = [10, 132, 255, 255];
export const WHITE = [255, 255, 255, 255];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profondita' per canale
  ihdr[9] = 6; // RGBA
  // Ogni riga va preceduta dal byte di filtro: 0 = nessun filtro.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Il calendario, disegnato in un sistema di coordinate da 0 a 100 e poi
 * riportato sulla dimensione vera. Cosi' lo stesso disegno serve sia per
 * l'icona intera sia per il solo primo piano dell'icona adattiva di Android,
 * che va rimpicciolito per stare dentro la zona che il sistema non ritaglia.
 *
 * @param size    lato in pixel
 * @param sfondo  true = quadrato blu sotto; false = trasparente
 * @param scala   1 = disegno pieno; <1 = rimpicciolito e centrato
 */
export function disegnaIcona(size, { sfondo = true, scala = 1 } = {}) {
  const px = Buffer.alloc(size * size * 4);

  const set = (x, y, [r, g, b, a]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const k = a / 255;
    if (k >= 1) {
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
      return;
    }
    // Fusione su quello che c'e' sotto: serve per i bordi ammorbiditi.
    px[i] = Math.round(px[i] * (1 - k) + r * k);
    px[i + 1] = Math.round(px[i + 1] * (1 - k) + g * k);
    px[i + 2] = Math.round(px[i + 2] * (1 - k) + b * k);
    px[i + 3] = Math.max(px[i + 3], Math.round(a));
  };

  // Da coordinate 0-100 a pixel, applicando la scala attorno al centro.
  const u = size / 100;
  const T = (v) => (50 + (v - 50) * scala) * u;
  const L = (v) => v * scala * u;

  const roundRect = (x, y, w, h, radius, color, assoluto = false) => {
    const x0 = assoluto ? x : T(x);
    const y0 = assoluto ? y : T(y);
    const ww = assoluto ? w : L(w);
    const hh = assoluto ? h : L(h);
    const rr = assoluto ? radius : L(radius);
    const x1 = x0 + ww, y1 = y0 + hh;

    for (let py = Math.floor(y0) - 1; py <= Math.ceil(y1) + 1; py++) {
      for (let pxi = Math.floor(x0) - 1; pxi <= Math.ceil(x1) + 1; pxi++) {
        const cx = Math.min(Math.max(pxi + 0.5, x0 + rr), x1 - rr);
        const cy = Math.min(Math.max(py + 0.5, y0 + rr), y1 - rr);
        const d = Math.hypot(pxi + 0.5 - cx, py + 0.5 - cy);
        const alpha = Math.max(0, Math.min(1, rr + 0.5 - d));
        if (alpha > 0) set(pxi, py, [color[0], color[1], color[2], color[3] * alpha]);
      }
    }
  };

  if (sfondo) roundRect(0, 0, size, size, size * 0.22, ACCENT, true);

  // Corpo del calendario, fascia superiore, anelli, caselle dei giorni.
  roundRect(22, 26, 56, 50, 6, WHITE);
  roundRect(22, 26, 56, 13, 6, ACCENT);
  roundRect(22, 34, 56, 5, 0.01, ACCENT);
  roundRect(35, 18, 5, 14, 2.5, WHITE);
  roundRect(60, 18, 5, 14, 2.5, WHITE);
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      roundRect(29 + c * 14, 45 + r * 13, 9, 8, 2, ACCENT);
    }
  }

  return encodePng(size, px);
}
