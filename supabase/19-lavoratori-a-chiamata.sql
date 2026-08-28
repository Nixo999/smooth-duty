-- =====================================================================
--  Turni — le regole di ingaggio di chi è a chiamata
--  Da eseguire dopo 18-tentativi-di-accesso.sql.
-- =====================================================================
--
--  Fino a qui chi è a chiamata era definito da ciò che **non** ha: nessun
--  monte ore, nessun orario preimpostato, nessuna settimana da accettare.
--  Il responsabile gli scriveva un turno come a chiunque altro, e l'accordo
--  vero — «giovedì posso», «il weekend no» — viveva in una telefonata di cui
--  l'app non sapeva niente.
--
--  Da qui l'accordo si scrive, e l'azienda sceglie in che forma. Tre modi, e
--  sono tre contratti diversi fra datore e lavoratore, non tre livelli di
--  severità della stessa cosa:
--
--    indisponibilita  il lavoratore segna i giorni in cui NON può. Negli
--                     altri il responsabile lo chiama liberamente, e sui
--                     giorni segnati l'app non lo lascia assegnare.
--    disponibilita    il lavoratore segna i giorni in cui PUÒ, e fuori da
--                     quelli il responsabile non lo può mettere in turno.
--                     Il vincolo qui è del datore, non del lavoratore.
--    on_demand        nessun calendario, né in un verso né nell'altro. Il
--                     responsabile propone e il lavoratore risponde a ogni
--                     chiamata: la singola, o l'intera settimana in un
--                     colpo solo quando la settimana viene pubblicata.
--
--  Vale **solo per chi è a chiamata**. Chi ha un monte ore ha già il suo
--  contratto, e le sue regole sono quelle di sempre: sarebbe una seconda
--  disciplina addosso alla stessa persona.

-- ------------------------------------------------------- l'impostazione

--  Una per azienda, come tutte le altre. Il default è `indisponibilita` e
--  non è una preferenza: è **l'unico dei tre che non cambia niente** a chi
--  aggiorna senza sapere che questa colonna è nata. Chi non segna niente
--  non blocca niente, e il responsabile continua ad assegnare come ieri.
--  Con `disponibilita` come default, la mattina dopo l'aggiornamento
--  nessuna azienda avrebbe più potuto mettere in turno un lavoratore a
--  chiamata: nessuno aveva ancora dichiarato niente.
alter table public.company_settings
  add column if not exists regime_chiamata text not null default 'indisponibilita';

alter table public.company_settings
  drop constraint if exists company_settings_regime_chiamata_valido;
alter table public.company_settings
  add constraint company_settings_regime_chiamata_valido
  check (regime_chiamata in ('indisponibilita', 'disponibilita', 'on_demand'));

-- ---------------------------------------------------- il calendario

--  Una riga = una dichiarazione: questa persona, questo giorno, e in quale
--  verso.
--
--  **Perché il verso sta sulla riga e non solo nell'impostazione.** Sarebbe
--  bastata una tabella di giorni, letta come «non posso» o come «posso»
--  secondo il regime in vigore. Ma il regime si cambia da una schermata, e
--  quel giorno tutte le dichiarazioni già date si rovescerebbero in
--  silenzio: «il 12 non posso» diventerebbe «il 12 posso», e il
--  responsabile lo scoprirebbe mandando qualcuno a lavorare in un giorno in
--  cui aveva detto di non esserci. Scritto sulla riga, il verso è quello
--  con cui la persona ha parlato; cambiando regime le dichiarazioni vecchie
--  restano scritte e smettono di contare, che è l'unica cosa onesta da
--  farne.
--
--  Una tabella sola e non due, al contrario di `shift_messages` /
--  `shift_notices`: là erano due cose che **muoiono in modo diverso**, qui
--  sono la stessa cosa detta in due versi, nascono e si cancellano uguali.
create table if not exists public.availability_days (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  giorno date not null,
  -- Il giorno intero, oppure una fascia dentro il giorno: chi non può la
  -- mattina spesso la sera può, e costringerlo a dire «tutto il giovedì»
  -- gli toglie una sera di lavoro. NULL tutt'e due = tutto il giorno.
  dalle time,
  alle time,
  -- Come per i turni, `alle <= dalle` vuol dire che scavalca la mezzanotte:
  -- è la convenzione di tutta l'app (`durationMinutes`, `porzioneDelGiorno`),
  -- e averne una seconda solo qui sarebbe il modo migliore per sbagliare i
  -- conti sui turni di notte.
  verso text not null check (verso in ('non_posso', 'posso')),
  -- Facoltativa, e serve al responsabile più che al lavoratore: «ho l'altro
  -- lavoro» si legge diversamente da «sono in ferie con la famiglia».
  nota text,
  -- Chi l'ha scritta. Quasi sempre l'interessato, ma non sempre: chi
  -- telefona al responsabile per dire che giovedì non c'è ha detto la
  -- stessa cosa, e obbligarlo ad aprire l'app per registrarla vorrebbe dire
  -- che quella dichiarazione non verrà scritta mai.
  creato_da uuid references public.profiles(id) on delete set null,
  creato_at timestamptz not null default now(),
  -- O tutt'e due gli orari o nessuno: mezza fascia non vuol dire niente, e
  -- letta dal codice diventerebbe «da mezzanotte» o «fino a mezzanotte»
  -- senza che nessuno l'abbia mai detto.
  constraint availability_days_orario_coerente
    check ((dalle is null) = (alle is null) and (dalle is null or dalle <> alle))
);

-- Niente doppioni. Due indici e non un vincolo solo perché in SQL due NULL
-- non sono uguali fra loro: senza il primo, «tutto il 12 non posso» si
-- potrebbe scrivere dieci volte e l'unico che se ne accorgerebbe è chi
-- legge l'elenco.
create unique index if not exists availability_days_giorno_intero
  on public.availability_days (profile_id, giorno, verso)
  where dalle is null;

create unique index if not exists availability_days_fascia
  on public.availability_days (profile_id, giorno, verso, dalle, alle)
  where dalle is not null;

-- Le due interrogazioni che fa l'app: il tabellone di una settimana (tutta
-- l'azienda, un intervallo di giorni) e il calendario di una persona.
create index if not exists availability_days_azienda_giorno
  on public.availability_days (company_id, giorno);

create index if not exists availability_days_persona_giorno
  on public.availability_days (profile_id, giorno);

-- La persona e la sua azienda devono coincidere. Come per i turni e le
-- assenze sta in un trigger e non nel codice: così vale per l'interfaccia,
-- per gli script e per qualunque strada venga dopo.
create or replace function public.availability_profile_matches_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
     where p.id = new.profile_id and p.company_id = new.company_id
  ) then
    raise exception 'La persona non appartiene a questa azienda';
  end if;
  return new;
end $$;

drop trigger if exists availability_company_check on public.availability_days;
create trigger availability_company_check
  before insert or update on public.availability_days
  for each row execute function public.availability_profile_matches_company();

alter table public.availability_days enable row level security;

-- Chi la legge: l'interessato e il responsabile, non i colleghi.
--
-- Le ferie di un collega tutta l'azienda le vede — sono un fatto d'agenda,
-- e servono a scegliersi le proprie. Questa no: dice quando una persona ha
-- l'altro lavoro, l'università, il figlio da prendere a scuola. È
-- un'informazione che riguarda il rapporto fra lei e chi la chiama, e
-- basta. Stessa forma della policy di `shift_notices`.
drop policy if exists availability_days_select on public.availability_days;
create policy availability_days_select on public.availability_days
  for select using (
    company_id = public.current_company_id()
    and (public.is_capo() or profile_id = public.current_profile_id())
  );

-- Chi la scrive: l'interessato sulla propria, il responsabile su quella di
-- chiunque in azienda — perché la telefonata al responsabile è il modo in
-- cui queste cose si dicono davvero.
--
-- **Non nel passato.** Una dichiarazione su un giorno già andato non cambia
-- niente e sposterebbe soltanto la storia: quel giorno o è stato lavorato o
-- non lo è stato. Il confine è la mezzanotte italiana, come in
-- `accetta_turno` e `rifiuta_turno`: le due parti devono rispondere la
-- stessa cosa alla domanda «che giorno è oggi», o il browser mostra un
-- bottone che il database rifiuta.
--
-- Quello che qui **non** si controlla è il regime dell'azienda: sotto
-- `on_demand` nessuno dovrebbe scrivere niente, ma per saperlo la policy
-- dovrebbe leggere `company_settings`, che è a sua volta protetta da RLS —
-- ricorsione infinita, errore 42P17. Lo controlla la Server Action, che è
-- l'unica strada che l'interfaccia offre.
drop policy if exists availability_days_insert on public.availability_days;
create policy availability_days_insert on public.availability_days
  for insert with check (
    company_id = public.current_company_id()
    and (public.is_capo() or profile_id = public.current_profile_id())
    and giorno >= (now() at time zone 'Europe/Rome')::date
  );

drop policy if exists availability_days_update on public.availability_days;
create policy availability_days_update on public.availability_days
  for update
  using (
    company_id = public.current_company_id()
    and (public.is_capo() or profile_id = public.current_profile_id())
    and giorno >= (now() at time zone 'Europe/Rome')::date
  )
  with check (
    company_id = public.current_company_id()
    and (public.is_capo() or profile_id = public.current_profile_id())
    and giorno >= (now() at time zone 'Europe/Rome')::date
  );

drop policy if exists availability_days_delete on public.availability_days;
create policy availability_days_delete on public.availability_days
  for delete using (
    company_id = public.current_company_id()
    and (public.is_capo() or profile_id = public.current_profile_id())
    and giorno >= (now() at time zone 'Europe/Rome')::date
  );

-- ------------------------------------------------- la chiamata da accettare

--  `on_demand` rovescia di nuovo il verso, ma **solo per chi è a chiamata**.
--
--  Dalla `14` il turno vale subito e chi tace ha accettato, ed è giusto per
--  chi ha un contratto: quel turno gli spetta comunque. Per chi è a
--  chiamata sotto `on_demand` non è così — il senso di quel regime è che
--  ogni singola chiamata va accettata — e «chi tace ha accettato»
--  vorrebbe dire dare per presente lunedì mattina qualcuno che l'app non
--  l'ha nemmeno aperta.
--
--  Il motivo nuovo si chiama `chiamata` e usa la macchina che c'è già:
--  `accetta_turno`, `rifiuta_turno`, `shift_messages`, `stato_prima`. Non
--  serve una seconda strada per fare la stessa cosa; quello che cambia è
--  come lo racconta l'interfaccia, che sulla chiamata non dice «il turno è
--  già valido» ma «vale se rispondi di sì».
alter table public.shifts
  drop constraint if exists shifts_richiede_conferma_valido;
alter table public.shifts
  add constraint shifts_richiede_conferma_valido
  check (richiede_conferma in
    ('straordinario', 'modifica', 'modifica_straordinario', 'orario_diverso',
     'cambio_reparto', 'turno_spostato', 'chiamata'));

--  E la settimana intera. La `16` aveva lasciato la porta aperta — «la
--  colonna c'è perché la seconda ragione arriverà» — ed è questa: pubblicare
--  una settimana a chi è a chiamata sotto `on_demand` è una proposta sola su
--  sette giorni, che si accetta o si rifiuta intera, con la nota per dire
--  cosa andrebbe cambiato.
--
--  Vale la stessa ragione dello straordinario: chi riceve sei domande su sei
--  turni non sta guardando la cosa che gli si sta chiedendo. E vale la stessa
--  unicità `(azienda, persona, lunedì)`, quindi ripubblicare non richiede
--  niente a chi ha già risposto.
alter table public.week_requests
  drop constraint if exists week_requests_motivo_check;
alter table public.week_requests
  drop constraint if exists week_requests_motivo_valido;
alter table public.week_requests
  add constraint week_requests_motivo_valido
  check (motivo in ('straordinario', 'chiamata'));

-- `minuti_contratto` resta not null e per una chiamata vale 0: chi è a
-- chiamata un monte ore non ce l'ha, e la domanda che gli si fa non è
-- «quanto sfori» ma «ci sei». Zero non è un dato mancante travestito da
-- numero — è esattamente quello che dice il contratto.

-- PostgREST tiene in memoria una copia dello schema, e la ricarica da solo
-- ma non sempre subito. Finche' non lo fa, l'app chiede una colonna che nel
-- database c'e' gia' e si sente rispondere «Could not find the column ... in
-- the schema cache» — un errore che sembra una migrazione non eseguita e non
-- lo e'. Questa riga glielo dice esplicitamente, e costa niente.
notify pgrst, 'reload schema';
