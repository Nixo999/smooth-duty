# Il cervello di Turni

Questa cartella esiste per una ragione sola: **chi arriva qui — persona o
assistente — deve poter lavorare sull'app senza rianalizzarla da zero.**

Il codice dice *cosa* fa l'app. Questi documenti dicono *perché è fatta così*,
*dove sta ogni cosa* e *cosa è cambiato quando*. Sono la memoria del progetto,
non un manuale d'uso: il manuale è il [README](../README.md), rivolto a chi
l'app la installa.

## In che ordine leggere

| Se devi… | Leggi |
|---|---|
| capire cos'è l'app, in cinque minuti | [01-mappa.md](01-mappa.md) |
| toccare il database o una policy | [02-modello-dati.md](02-modello-dati.md) |
| lavorare su una schermata | [03-pagine.md](03-pagine.md) |
| capire una regola che non torna | [04-regole.md](04-regole.md) |
| scrivere codice nuovo | [05-convenzioni.md](05-convenzioni.md) |
| avviare, provare, pubblicare | [06-ambiente.md](06-ambiente.md) |
| sapere cos'è successo di recente | [07-diario.md](07-diario.md) |
| sapere cosa manca e cosa è in dubbio | [08-aperto.md](08-aperto.md) |

**Partenza a freddo, senza contesto:** 01 → 03 → 07. Tre file, e sai dove
mettere le mani.

## Come si tiene vivo

Un second brain che non si aggiorna è peggio di niente: fa prendere decisioni
su un'app che non esiste più.

1. **Dopo ogni pezzo finito, una riga nel [diario](07-diario.md).** Cosa è
   cambiato e *perché*, non l'elenco dei file. È lo stesso criterio dei
   messaggi di commit, ed è il documento che si legge per primo dopo un cambio
   di chat.
2. **Se cambia lo schema**, si aggiorna [02-modello-dati.md](02-modello-dati.md)
   nello stesso commit della migrazione. Una tabella nuova non documentata
   viene riscoperta a mano dal prossimo che passa.
3. **Se nasce una pagina**, va in [03-pagine.md](03-pagine.md) con le sue
   query e chi la può vedere.
4. **Se una decisione costa un errore**, va in [04-regole.md](04-regole.md) o
   in [05-convenzioni.md](05-convenzioni.md). Le regole qui dentro non sono
   preferenze di stile: ognuna è già costata qualcosa.
5. **Quando una voce di [08-aperto.md](08-aperto.md) viene fatta**, si toglie
   da lì e si scrive nel diario.

> Stato di questo cervello: allineato al 26 agosto 2026. Il database del
> progetto «swift control» è alla migrazione **15**, come il codice.
> Se il `git log` ha commit più recenti di quella data e il diario si ferma
> qui, il diario è indietro: fidati del codice e poi rimetti in pari il diario.
