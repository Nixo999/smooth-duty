-- =====================================================================
--  Turni — spostare un turno non è una cosa da comunicare, è una da chiedere
--  Da eseguire dopo 16-avvisi-e-settimana.sql.
-- =====================================================================
--
--  La `16` aveva messo lo spostamento fra gli **avvisi**: stesse ore, altro
--  giorno o altro orario, quindi niente da concedere. Era un ragionamento da
--  contabile, non da persona: il mattino e il pomeriggio non sono la stessa
--  giornata. Chi porta i figli a scuola alle otto, chi ha un secondo lavoro,
--  chi ha preso un impegno — per tutti loro un turno che passa dalle 06–14
--  alle 14–22 cambia tutto, e le ore sono identiche.
--
--  Da qui `turno_spostato` è un motivo di **rifiuto** come gli altri: il
--  turno vale subito, come sempre, ma l'interessato può dire di no e allora
--  torna dov'era. La `stato_prima` c'è già e serve esattamente a questo.
--
--  Il valore resta anche fra i motivi di `shift_notices`: toglierlo di lì
--  costerebbe un vincolo riscritto per non dire niente di più, e un domani
--  potrebbe tornare utile a un'azienda che gli spostamenti li comunica e
--  basta.

alter table public.shifts
  drop constraint if exists shifts_richiede_conferma_valido;
alter table public.shifts
  add constraint shifts_richiede_conferma_valido
  check (richiede_conferma in
    ('straordinario', 'modifica', 'modifica_straordinario', 'orario_diverso',
     'cambio_reparto', 'turno_spostato'));
