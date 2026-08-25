-- =====================================================================
--  Turni — le pagine che l'azienda usa, e il cambio di solo reparto
--  Da eseguire dopo 12-pubblicazione-e-contratti.sql.
-- =====================================================================

-- ------------------------------------------------ le pagine in uso
-- Non tutte le aziende usano tutto: chi non ha regole di copertura non sa
-- cosa farsene della Supervisione, chi le assenze le segna sul quaderno
-- non vuole i Permessi in mezzo ai piedi. Spente, spariscono dal menu e
-- il loro indirizzo riporta ai Turni.
--
-- Non si possono spegnere Turni, Squadra e Impostazioni: senza il
-- tabellone l'app non ha piu' un motivo, senza Squadra non si aggiunge
-- nessuno, e senza Impostazioni non si potrebbe piu' riaccendere niente.
alter table public.company_settings
  add column if not exists pagina_supervisione boolean not null default true;
alter table public.company_settings
  add column if not exists pagina_permessi boolean not null default true;
alter table public.company_settings
  add column if not exists pagina_prospetto boolean not null default true;

-- ------------------------------------------- cambio di solo reparto
-- Spostare qualcuno dalla cassa alla sala, senza toccargli un minuto di
-- orario, non e' la modifica per cui si chiede un si': la persona lavora
-- le stesse ore negli stessi giorni. Di suo quindi non chiede niente;
-- chi vuole che lo chieda accende questo.
alter table public.company_settings
  add column if not exists conferma_cambio_reparto boolean not null default false;

-- Il motivo nuovo va aggiunto ai valori ammessi. Il vincolo era nato senza
-- nome nostro insieme alla colonna (11-impostazioni.sql): si toglie quello
-- generato da Postgres e se ne mette uno che ha un nome, cosi' la prossima
-- volta lo si ritrova.
alter table public.shifts
  drop constraint if exists shifts_richiede_conferma_check;
alter table public.shifts
  drop constraint if exists shifts_richiede_conferma_valido;
alter table public.shifts
  add constraint shifts_richiede_conferma_valido
  check (richiede_conferma in
    ('straordinario', 'modifica', 'modifica_straordinario', 'orario_diverso',
     'cambio_reparto'));
