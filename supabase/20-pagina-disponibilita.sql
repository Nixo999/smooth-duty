-- =====================================================================
--  Turni — la pagina Disponibilità si può spegnere
--  Da eseguire dopo 19-lavoratori-a-chiamata.sql.
-- =====================================================================
--
--  Come Permessi, Supervisione e Prospetto: una levetta in Impostazioni.
--  Spenta, la pagina sparisce dal menu del dipendente a chiamata e si
--  rifiuta di aprirsi dal suo indirizzo. Le dichiarazioni già scritte
--  restano dove sono, e il responsabile continua a vederle e scriverle dal
--  tabellone: si spegne la porta del dipendente, non il calendario.
--
--  Il default è acceso, e non è una preferenza: è l'unico valore che a chi
--  aggiorna senza sapere di questa colonna non cambia niente.
alter table public.company_settings
  add column if not exists pagina_disponibilita boolean not null default true;

-- PostgREST tiene in memoria una copia dello schema e non sempre la
-- ricarica subito: senza questa riga l'app chiede una colonna che c'e' gia'
-- e si sente rispondere che non esiste.
notify pgrst, 'reload schema';
