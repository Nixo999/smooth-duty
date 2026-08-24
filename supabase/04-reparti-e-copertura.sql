-- =====================================================================
--  Turni — reparti, ore da contratto e copertura richiesta
--  Da eseguire dopo 03-vincoli.sql.
-- =====================================================================

-- ---------------------------------------------------------------- reparti
create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  -- Tinta in gradi (0-360). Si salva il numero e non un colore finito perche'
  -- chiaro e scuro hanno bisogno di due luminosita' diverse: il colore vero
  -- lo compone il foglio di stile.
  hue         smallint not null default 210 check (hue between 0 and 360),
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  unique (company_id, name)
);

create index if not exists departments_company_idx
  on public.departments (company_id, position);

-- ------------------------------------------------- ore e tipo di rapporto
alter table public.profiles
  add column if not exists department_id uuid
    references public.departments(id) on delete set null;

-- Ore settimanali da contratto. NULL quando non ha senso, cioe' per chi e'
-- a chiamata: un contratto a chiamata non ha un monte ore da rispettare.
alter table public.profiles
  add column if not exists contract_hours numeric(5,2)
    check (contract_hours is null or (contract_hours >= 0 and contract_hours <= 80));

alter table public.profiles
  add column if not exists on_call boolean not null default false;

-- Le due cose si escludono: o hai un monte ore, o sei a chiamata.
do $$ begin
  alter table public.profiles
    add constraint profiles_ore_o_chiamata
    check (not (on_call and contract_hours is not null));
exception when duplicate_object then null;
end $$;

-- Un turno puo' appartenere a un reparto diverso da quello della persona:
-- capita di coprire in sala per un giorno. NULL = vale quello della persona.
alter table public.shifts
  add column if not exists department_id uuid
    references public.departments(id) on delete set null;

-- --------------------------------------------- fasce di copertura ("turni")
-- Quante persone servono, in che ore, in quali giorni. E' la regola con cui
-- la pagina Supervisione stabilisce se una giornata e' scoperta.
create table if not exists public.coverage_bands (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  department_id  uuid not null references public.departments(id) on delete cascade,
  name           text not null check (length(trim(name)) > 0),
  start_time     time not null,
  end_time       time not null,
  required       smallint not null default 1 check (required between 1 and 99),
  -- Giorni in cui vale, secondo ISO: 1 = lunedi, 7 = domenica.
  weekdays       smallint[] not null default '{1,2,3,4,5,6,7}',
  position       smallint not null default 0,
  created_at     timestamptz not null default now(),
  check (start_time <> end_time)
);

create index if not exists coverage_bands_department_idx
  on public.coverage_bands (department_id, position);

-- Stesso ragionamento del trigger sui turni: il reparto di una fascia deve
-- essere dell'azienda che la possiede, e il controllo sta nel database cosi'
-- vale per ogni strada che scrive.
create or replace function public.band_department_matches_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.departments d
     where d.id = new.department_id and d.company_id = new.company_id
  ) then
    raise exception 'Il reparto non appartiene a questa azienda';
  end if;
  return new;
end $$;

drop trigger if exists coverage_bands_company_check on public.coverage_bands;
create trigger coverage_bands_company_check
  before insert or update on public.coverage_bands
  for each row execute function public.band_department_matches_company();

-- Lo stesso per il reparto scritto sul turno.
create or replace function public.shift_department_matches_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.department_id is not null
     and not exists (
       select 1 from public.departments d
        where d.id = new.department_id and d.company_id = new.company_id
     )
  then
    raise exception 'Il reparto del turno non appartiene a questa azienda';
  end if;
  return new;
end $$;

drop trigger if exists shifts_department_company_check on public.shifts;
create trigger shifts_department_company_check
  before insert or update on public.shifts
  for each row execute function public.shift_department_matches_company();

-- ------------------------------------------------------------------- RLS
alter table public.departments     enable row level security;
alter table public.coverage_bands  enable row level security;

drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments
  for select using (
    company_id = public.current_company_id() or public.is_platform_admin()
  );

drop policy if exists departments_write on public.departments;
create policy departments_write on public.departments
  for all
  using (company_id = public.current_company_id() and public.is_capo())
  with check (company_id = public.current_company_id() and public.is_capo());

-- I dipendenti le devono leggere: la pagina Supervisione serve anche a loro,
-- per sapere se la giornata e' coperta.
drop policy if exists coverage_bands_select on public.coverage_bands;
create policy coverage_bands_select on public.coverage_bands
  for select using (company_id = public.current_company_id());

drop policy if exists coverage_bands_write on public.coverage_bands;
create policy coverage_bands_write on public.coverage_bands
  for all
  using (company_id = public.current_company_id() and public.is_capo())
  with check (company_id = public.current_company_id() and public.is_capo());

-- ------------------------------------------------- lettura dei turni
-- La pagina Supervisione serve anche ai dipendenti: devono poter vedere se la
-- giornata e' coperta, e questo vuol dire vedere i turni dei colleghi. Prima
-- la policy li limitava ai propri.
--
-- Il confine che conta resta l'azienda. Che il dipendente nella sua pagina
-- veda solo i suoi turni ora e' una scelta di quella schermata, scritta nella
-- query: e' la cosa giusta, perche' e' li' che si decide cosa mostrare.
drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts
  for select using (company_id = public.current_company_id());
