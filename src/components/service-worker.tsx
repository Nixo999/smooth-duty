"use client";

import { useEffect } from "react";

/** Registra il service worker, che e' cio' che rende l'app installabile.
 *
 *  Il browser lo accetta solo su HTTPS o su localhost: aprendo l'app
 *  dall'indirizzo di rete locale (http://192.168.x.x) la registrazione viene
 *  semplicemente saltata, e l'app resta una normale pagina web. Non e' un
 *  errore, e' una regola di sicurezza dei browser. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const registra = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Contesto non sicuro o registrazione rifiutata: l'app funziona
        // lo stesso, semplicemente non si installa.
      });
    };

    // Dopo il caricamento: registrarlo prima ruberebbe banda alla prima
    // schermata, che e' quella che l'utente sta aspettando.
    if (document.readyState === "complete") registra();
    else {
      window.addEventListener("load", registra);
      return () => window.removeEventListener("load", registra);
    }
  }, []);

  return null;
}
