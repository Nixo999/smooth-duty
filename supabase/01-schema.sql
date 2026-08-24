-- =====================================================================
--  Turni — schema iniziale
--  Da incollare nel SQL Editor di Supabase ed eseguire una volta sola.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- aziende
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  created_at  timestamptz not null default now()
);

-- --------------------------------------------------------------- profili
do $$ begin
  create type public.app_role as enum ('capo', 'dipendente');
exception when duplicate_object then null;
end $$;

-- Un profilo per ogni account. company_id e' la colonna su cui gira tutto
-- l'isolamento fra aziende diverse.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  full_name   text not null,
  email       text not null,
  role        public.app_role not null default 'dipendente',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists profiles_company_idx on public.profiles (company_id);

-- ---------------------------------------------------------------- turni
create table if not exists public.shifts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  -- null = turno scoperto: c'e' da lavorare ma non e' ancora assegnato.
  profile_id  uuid references public.profiles(id) on delete set null,
  date        date not null,
  start_time  time not null,
  end_time    time not null,
  title       text,
  location    text,
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Le due interrogazioni che fa l'app: la settimana di tutta l'azienda,
-- e i turni di una persona.
create index if not exists shifts_company_date_idx on public.shifts (company_id, date);
create index if not exists shifts_profile_date_idx on public.shifts (profile_id, date);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists shifts_touch_updated_at on public.shifts;
create trigger shifts_touch_updated_at
  before update on public.shifts
  for each row execute function public.touch_updated_at();

-- =====================================================================
--  RLS
--  Regola da non violare mai: una policy non deve leggere una tabella che
--  a sua volta e' protetta da RLS, altrimenti Postgres entra in ricorsione
--  infinita (errore 42P17). Per questo l'azienda e il ruolo di chi sta
--  chiedendo si leggono con funzioni SECURITY DEFINER, che RLS non lo
--  applicano.
-- =====================================================================

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_capo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'capo' and active
  );
$$;

alter table public.companies enable row level security;
alter table public.profiles  enable row level security;
alter table public.shifts    enable row level security;

-- aziende: si vede solo la propria, e la rinomina solo il capo
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select using (id = public.current_company_id());

drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies
  for update using (id = public.current_company_id() and public.is_capo());

-- profili: tutti vedono i colleghi (servono i nomi nel calendario),
-- ma solo il capo puo' modificarli
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (company_id = public.current_company_id());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (company_id = public.current_company_id() and public.is_capo());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete using (
    company_id = public.current_company_id()
    and public.is_capo()
    and id <> auth.uid()          -- il capo non puo' cancellare se stesso
  );

-- turni: il capo vede tutta l'azienda, il dipendente solo i suoi.
-- Per far vedere a tutti il tabellone completo basta togliere le due righe
-- dopo l'and: e' una decisione di prodotto, non un vincolo tecnico.
drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts
  for select using (
    company_id = public.current_company_id()
    and (public.is_capo() or profile_id = auth.uid())
  );

drop policy if exists shifts_insert on public.shifts;
create policy shifts_insert on public.shifts
  for insert with check (
    company_id = public.current_company_id() and public.is_capo()
  );

drop policy if exists shifts_update on public.shifts;
create policy shifts_update on public.shifts
  for update using (
    company_id = public.current_company_id() and public.is_capo()
  );

drop policy if exists shifts_delete on public.shifts;
create policy shifts_delete on public.shifts
  for delete using (
    company_id = public.current_company_id() and public.is_capo()
  );
