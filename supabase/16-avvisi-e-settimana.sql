-- =====================================================================
--  Turni — chi perde ore lo sa, chi ne guadagna decide
--  Da eseguire dopo 15-accettazione-esplicita.sql.
-- =====================================================================
--
--  Tre cose, e sono la stessa cosa guardata da tre distanze.
--
--  1. **Non tutte le modifiche chiedono un permesso.** Finora una modifica a
--     una settimana pubblicata era rifiutabile e basta, in qualunque verso
--     andasse. Ma togliere ore a qualcuno e aggiungergliene non sono la
--     stessa domanda: chi si vede accorciare il turno non ha niente da
--     concedere, ha solo diritto di saperlo. Da qui: se le ore aumentano si
--     puo' rifiutare, se calano arriva un **avviso**, che non chiede niente
--     e si chiude con «ho letto».
--
--  2. **La settimana si accetta intera.** Alla pubblicazione, chi va in
--     straordinario non riceve otto domande su otto turni: ne riceve una
--     sola sulla settimana. Un turno per volta e' il modo giusto di
--     chiedere una modifica in corsa, ed e' il modo sbagliato di chiedere
--     «questa settimana ti va bene?»: la risposta dipende dall'insieme, non
--     dal singolo martedi.
--
--  3. **Chi accetta puo' comunque chiedere un ritocco.** Il si' con una
--     nota — «va bene, ma il giovedi' se possibile smetto prima» — e' la
--     conversazione che c'e' comunque, e che finora avveniva fuori
--     dall'app. Il responsabile la legge e decide lui: non e' una modifica
--     automatica, e non deve esserlo.

-- ------------------------------------------------------- l'interruttore

-- La conferma della settimana intera si accende per azienda, come tutte le
-- altre. Spenta di suo: e' un giro in piu' fra il responsabile e la squadra,
-- e un'azienda dove nessuno fa straordinari non deve accorgersene.
alter table public.company_settings
  add column if not exists conferma_settimana boolean not null default false;

-- ------------------------------------------------------------- gli avvisi

--  Il verso opposto di `shift_messages`: li' il dipendente parla al
--  responsabile, qui il responsabile avvisa il dipendente. Due tabelle e non
--  una perche' le due cose muoiono in modo diverso — un rifiuto si chiude
--  quando il responsabile ha rimediato, un avviso quando l'interessato dice
--  di averlo letto — e mescolarle vorrebbe dire una colonna «direzione» e
--  due meta' di ogni query.
create table if not exists public.shift_notices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Chi lo deve leggere.
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Il turno di cui si parla, finche' esiste: se lo si cancella l'avviso
  -- resta, ed e' proprio il caso in cui serve di piu'.
  shift_id uuid references public.shifts(id) on delete set null,
  -- Che cosa e' successo:
  --   ore_tolte      il turno si e' accorciato
  --   turno_rimosso  il turno non c'e' piu'
  --   turno_spostato stesse ore, altro giorno o altro orario
  motivo text not null check (motivo in ('ore_tolte', 'turno_rimosso', 'turno_spostato')),
  -- Il giorno di cui si parla: dopo una cancellazione e' l'unica cosa
  -- rimasta per dire di quale turno si trattava.
  giorno date not null,
  turno_prima jsonb not null,
  -- NULL quando il turno e' stato tolto: non c'e' un «dopo».
  turno_dopo jsonb,
  creato_at timestamptz not null default now(),
  -- «Ho letto». Finche' e' NULL l'avviso resta in faccia a chi lo riguarda:
  -- un avviso che sparisce da solo dopo qualche giorno e' un avviso che
  -- qualcuno non ha visto, e nessuno saprebbe dire chi.
  letto_at timestamptz
);

create index if not exists shift_notices_da_leggere
  on public.shift_notices (profile_id, letto_at, creato_at desc);

alter table public.shift_notices enable row level security;

-- Lo legge l'interessato, e il responsabile che l'ha mandato: sapere se e'
-- stato letto e' meta' del motivo per cui lo si manda.
drop policy if exists shift_notices_select on public.shift_notices;
create policy shift_notices_select on public.shift_notices
  for select using (
    company_id = public.current_company_id()
    and (public.is_capo() or profile_id = public.current_profile_id())
  );

-- Lo scrive solo il responsabile, e solo dentro la sua azienda.
drop policy if exists shift_notices_insert on public.shift_notices;
create policy shift_notices_insert on public.shift_notices
  for insert
  with check (company_id = public.current_company_id() and public.is_capo());

-- L'aggiornamento e' del responsabile. Il «ho letto» dell'interessato non
-- passa di qui ma dalla funzione piu' sotto: un permesso di update su questa
-- riga gli lascerebbe riscrivere anche il motivo e la fotografia del turno.
drop policy if exists shift_notices_update on public.shift_notices;
create policy shift_notices_update on public.shift_notices
  for update
  using (company_id = public.current_company_id() and public.is_capo())
  with check (company_id = public.current_company_id() and public.is_capo());

-- «Ho letto», sul proprio avviso e su nient'altro. Restituisce un booleano e
-- non void: un void che esce in silenzio farebbe sparire il riquadro dallo
-- schermo anche quando non e' stato scritto niente.
create or replace function public.segna_avviso_letto(avviso uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  toccati int;
begin
  update public.shift_notices
     set letto_at = now()
   where id = avviso
     and profile_id = public.current_profile_id()
     and letto_at is null;

  get diagnostics toccati = row_count;
  return toccati > 0;
end $$;

grant execute on function public.segna_avviso_letto(uuid) to authenticated;

-- ------------------------------------------------- la settimana da accettare

--  Una riga per persona e per settimana. E' l'unita' giusta: alla
--  pubblicazione la domanda e' «questa settimana ti va bene?», e chi va in
--  straordinario la guarda intera prima di rispondere.
create table if not exists public.week_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Il lunedi', come in published_weeks: la settimana si chiama col suo
  -- primo giorno dappertutto nell'app.
  monday date not null,
  -- Per ora se ne fa una sola ragione, ma la colonna c'e' perche' la
  -- seconda arrivera' — «settimana molto diversa dalla precedente», per
  -- dirne una — e aggiungerla dopo vorrebbe dire un'altra migrazione.
  motivo text not null default 'straordinario' check (motivo in ('straordinario')),
  -- I due numeri che spiegano la domanda, in minuti: quanto lavorerebbe e
  -- quanto dice il contratto. Congelati qui perche' il tabellone cambia, e
  -- una richiesta deve poter raccontare la settimana su cui e' nata.
  minuti_previsti int not null,
  minuti_contratto int not null,
  stato text not null default 'in_attesa'
    check (stato in ('in_attesa', 'accettata', 'rifiutata')),
  -- Il perche' del no, o la richiesta di ritocco allegata al si'. Una sola
  -- colonna: e' lo stesso spazio, e distinguerne due vorrebbe dire due
  -- campi di cui uno sempre vuoto.
  nota text,
  creato_at timestamptz not null default now(),
  deciso_at timestamptz,
  -- Quando il responsabile ha letto la risposta.
  visto_at timestamptz,
  -- Una sola domanda per persona e settimana. Ripubblicare non ne crea una
  -- seconda: la riga c'e' gia', e se e' stata decisa la decisione vale.
  unique (company_id, profile_id, monday)
);

create index if not exists week_requests_da_vedere
  on public.week_requests (company_id, stato, monday);

alter table public.week_requests enable row level security;

drop policy if exists week_requests_select on public.week_requests;
create policy week_requests_select on public.week_requests
  for select using (
    company_id = public.current_company_id()
    and (public.is_capo() or profile_id = public.current_profile_id())
  );

-- Le crea la pubblicazione, che e' un gesto del responsabile.
drop policy if exists week_requests_insert on public.week_requests;
create policy week_requests_insert on public.week_requests
  for insert
  with check (
    company_id = public.current_company_id()
    and public.is_capo()
    -- Nasce sempre in attesa. Anche qui, come per le richieste di permesso:
    -- una domanda che nascesse gia' decisa non sarebbe una domanda.
    and stato = 'in_attesa'
  );

drop policy if exists week_requests_update on public.week_requests;
create policy week_requests_update on public.week_requests
  for update
  using (company_id = public.current_company_id() and public.is_capo())
  with check (company_id = public.current_company_id() and public.is_capo());

-- Il si' alla settimana, con eventuale richiesta di ritocco allegata.
--
-- La nota non e' una modifica: la applica il responsabile a mano, se e'
-- d'accordo. Un si' che cambiasse da solo il tabellone non sarebbe un si',
-- sarebbe un permesso di scrittura sui propri turni.
create or replace function public.accetta_settimana(lunedi date, nota_ritocco text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  toccati int;
begin
  update public.week_requests
     set stato = 'accettata',
         nota = left(nullif(btrim(coalesce(nota_ritocco, '')), ''), 500),
         deciso_at = now()
   where monday = lunedi
     and profile_id = public.current_profile_id()
     and stato = 'in_attesa'
     -- Una settimana finita non si accetta piu': o e' stata lavorata o non
     -- lo e' stata, e in nessuno dei due casi serve un parere. Il confine e'
     -- la domenica sera, in ora italiana come tutto il resto.
     and lunedi + 6 >= (now() at time zone 'Europe/Rome')::date;

  get diagnostics toccati = row_count;
  return toccati > 0;
end $$;

grant execute on function public.accetta_settimana(date, text) to authenticated;

-- Il no alla settimana intera. La motivazione e' obbligatoria, e non per
-- burocrazia: un «no» secco su sette giorni non dice al responsabile niente
-- di cui possa fare qualcosa, e la settimana va comunque rifatta.
create or replace function public.rifiuta_settimana(lunedi date, motivazione text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  pulita text;
  toccati int;
begin
  pulita := left(nullif(btrim(coalesce(motivazione, '')), ''), 500);
  if pulita is null then
    return false;
  end if;

  update public.week_requests
     set stato = 'rifiutata',
         nota = pulita,
         deciso_at = now()
   where monday = lunedi
     and profile_id = public.current_profile_id()
     and stato = 'in_attesa'
     and lunedi + 6 >= (now() at time zone 'Europe/Rome')::date;

  get diagnostics toccati = row_count;
  return toccati > 0;
end $$;

grant execute on function public.rifiuta_settimana(date, text) to authenticated;

-- PostgREST tiene in memoria una copia dello schema, e la ricarica da solo
-- ma non sempre subito. Finche' non lo fa, l'app chiede una colonna che nel
-- database c'e' gia' e si sente rispondere «Could not find the column ... in
-- the schema cache» — un errore che sembra una migrazione non eseguita e non
-- lo e'. Questa riga glielo dice esplicitamente, e costa niente.
notify pgrst, 'reload schema';
