@AGENTS.md

# Turni — leggere prima di toccare

Pianificazione turni per aziende con squadre a orario variabile. Next 16
(App Router) · React 19 · Tailwind 4 · Supabase (Postgres + Auth + RLS).

**La memoria del progetto sta in [`docs/`](docs/README.md).** È fatta perché
chi arriva non debba rianalizzare l'app da zero: cosa fa, com'è fatta, perché
è fatta così, e cosa è cambiato quando.

Partenza a freddo, tre file: [docs/01-mappa.md](docs/01-mappa.md) →
[docs/03-pagine.md](docs/03-pagine.md) → [docs/07-diario.md](docs/07-diario.md).

| Serve… | Leggi |
|---|---|
| l'app in cinque minuti | [docs/01-mappa.md](docs/01-mappa.md) |
| database, policy, migrazioni | [docs/02-modello-dati.md](docs/02-modello-dati.md) |
| una schermata | [docs/03-pagine.md](docs/03-pagine.md) |
| una regola che non torna | [docs/04-regole.md](docs/04-regole.md) |
| scrivere codice nuovo | [docs/05-convenzioni.md](docs/05-convenzioni.md) |
| avviare, provare, pubblicare | [docs/06-ambiente.md](docs/06-ambiente.md) |
| cosa è successo di recente | [docs/07-diario.md](docs/07-diario.md) |
| cosa manca | [docs/08-aperto.md](docs/08-aperto.md) |

## Come si lavora qui

1. **Prima di cercare nel codice, cercare in `docs/`.** La mappa di cosa esiste
   già sta lì, ed evita quasi sempre la ricerca.
2. **Verificare nel browser.** «Compila» non è una verifica. `npm run prove`
   copre solo i motori puri (copertura, prospetto, copia, lettore Excel).
3. **Mai avviare il server da Bash**: si usa il pannello browser, che ha già la
   configurazione in `.claude/launch.json`.
4. **Password mai.** Non si digitano credenziali in nessun campo: si chiede
   all'utente di entrare lui. Vale anche per gli account di prova.
5. **Dire cosa non si è verificato.** Meglio un buco dichiarato di una
   sicurezza inventata.
6. **Dopo ogni pezzo finito: voce nel [diario](docs/07-diario.md), commit,
   push.** Il messaggio dice cosa non tornava e perché la soluzione è quella,
   non l'elenco dei file toccati.
7. **Se cambia lo schema**, la migrazione e
   [docs/02-modello-dati.md](docs/02-modello-dati.md) stanno nello stesso
   commit.
8. **Italiano**: interfaccia, commenti e nomi di funzione. Restano in inglese i
   nomi di tabelle e colonne.
