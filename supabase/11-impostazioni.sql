-- =====================================================================
--  Turni — impostazioni dell'azienda, conferme dei dipendenti, bozze
--  Da eseguire dopo 10-permessi.sql.
-- =====================================================================

-- ------------------------------------------------------ impostazioni
-- Una riga per azienda. Se manca, valgono i default scritti qui: cosi' le
-- aziende nate prima di questa tabella non hanno bisogno di niente.
create table if not exists public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  -- La Supervisione la vedono anche i dipendenti?
  supervisione_dipendenti boolean not null default true,
  -- Le causali che un dipendente puo' chiedere dalla pagina Permessi.
  -- Il responsabile, registrando a mano, le ha sempre tutte.
  causali_richiedibili text[] not null default array[
    'malattia', 'infortunio', 'visita_medica', 'legge_104',
    'permesso_retribuito', 'permesso_non_retribuito', 'rol', 'banca_ore',
    'ferie', 'maternita', 'congedo_parentale', 'lutto', 'matrimonio',
    'donazione_sangue', 'studio', 'carica_pubblica', 'sciopero',
    'aspettativa', 'sospensione', 'altro'
  ],
  -- Un turno nuovo che porta oltre le ore da contratto va accettato?
  conferma_straordinari boolean not null default false,
  -- Una modifica a una settimana gia' pubblicata va accettata?
  -- Due interruttori: le modifiche che generano straordinario e le altre.
  conferma_modifiche boolean not null default false,
  conferma_modifiche_straordinari boolean not null default false,
  -- Gli orari preimpostati da contratto: se accesi, un turno diverso
  -- dall'orario scritto sul contratto della persona va accettato.
  orari_preimpostati boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.company_settings enable row level security;

drop policy if exists company_settings_select on public.company_settings;
create policy company_settings_select on public.company_settings
  for select using (company_id = public.current_company_id());

drop policy if exists company_settings_write on public.company_settings;
create policy company_settings_write on public.company_settings
  for all
  using (company_id = public.current_company_id() and public.is_capo())
  with check (company_id = public.current_company_id() and public.is_capo());

-- ------------------------------------------------- conferme sui turni
-- Il motivo per cui il turno aspetta un si' del dipendente, e quando il
-- si' e' arrivato. NULL = non serve nessuna conferma.
alter table public.shifts
  add column if not exists richiede_conferma text
  check (richiede_conferma in
    ('straordinario', 'modifica', 'modifica_straordinario', 'orario_diverso'));
alter table public.shifts
  add column if not exists confermato_at timestamptz;

-- Il si' lo da' solo l'interessato, e puo' toccare solo quello: con un
-- permesso di update su shifts potrebbe spostarsi gli orari.
create or replace function public.conferma_turno(turno uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shifts
     set confermato_at = now()
   where id = turno
     and profile_id = public.current_profile_id()
     and richiede_conferma is not null
     and confermato_at is null;
end $$;

grant execute on function public.conferma_turno(uuid) to authenticated;

-- ------------------------------------------------------------- bozze
-- Le settimane elencate qui sono bozze: il responsabile ci lavora, i
-- dipendenti non le vedono finche' non le pubblica (= togliere la riga).
create table if not exists public.draft_weeks (
  company_id uuid not null references public.companies(id) on delete cascade,
  monday date not null,
  created_at timestamptz not null default now(),
  primary key (company_id, monday)
);

alter table public.draft_weeks enable row level security;

-- La leggono tutti quelli dell'azienda: al dipendente serve per capire che
-- la settimana vuota e' "non ancora pubblicata", non "sei a riposo".
drop policy if exists draft_weeks_select on public.draft_weeks;
create policy draft_weeks_select on public.draft_weeks
  for select using (company_id = public.current_company_id());

drop policy if exists draft_weeks_write on public.draft_weeks;
create policy draft_weeks_write on public.draft_weeks
  for all
  using (company_id = public.current_company_id() and public.is_capo())
  with check (company_id = public.current_company_id() and public.is_capo());

-- ------------------------------------- orario preimpostato da contratto
-- Sta sulla persona, perche' e' il suo contratto. Il flag che lo rende
-- vincolante sta nelle impostazioni dell'azienda.
alter table public.profiles
  add column if not exists preset_start time;
alter table public.profiles
  add column if not exists preset_end time;
