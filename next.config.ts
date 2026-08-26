import type { NextConfig } from "next";

/** Intestazioni di sicurezza, valide su ogni risposta.
 *
 *  Non sono decorazione: l'app sta su internet e protegge le causali di
 *  malattia e legge 104. Ognuna chiude una porta diversa.
 *
 *  Quello che NON c'e', dichiarato invece che sottinteso: una
 *  Content-Security-Policy completa. Farla con Next vuol dire firmare ogni
 *  script con un nonce a ogni richiesta, e una CSP incollata alla leggera o
 *  rompe l'app o si riduce a `unsafe-inline`, che e' teatro. `frame-ancestors`
 *  invece si puo' dare subito e da sola vale la parte piu' concreta.
 *
 *  HSTS e X-Content-Type-Options li mette gia' Netlify: ripeterli qui non
 *  farebbe danno, ma due posti che dicono la stessa cosa prima o poi si
 *  contraddicono. */
const INTESTAZIONI = [
  // Nessuno puo' mettere l'app dentro una cornice sul proprio sito e
  // raccogliere i click di chi crede di stare premendo altro.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Uscendo verso un altro sito non si porta dietro l'indirizzo completo:
  // dentro c'e' la settimana che si stava guardando, e volendo di chi.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // L'app non usa niente di tutto questo: dichiararlo impedisce che una
  // dipendenza possa chiederlo di nascosto.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // La versione del framework non e' un'informazione che serve a chi guarda:
  // e' un modo di sapere in fretta quali falle provare.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: INTESTAZIONI }];
  },

  experimental: {
    serverActions: {
      // Il foglio dei turni viaggia dentro una Server Action, e il limite
      // predefinito e' 1 MB: un file poco piu' grande verrebbe rifiutato
      // senza spiegare perche'.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
