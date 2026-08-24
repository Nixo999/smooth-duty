-- =====================================================================
--  Turni — assenze (malattia e simili)
--  Da eseguire dopo 04-reparti-e-copertura.sql.
-- =====================================================================

do $$ begin
  create type public.absence_type as enum ('malattia', 'infortunio', 'permesso', 'altro');
exception when duplicate_object then null;
end $$;

-- Un'assenza aperta e' il caso normale, non l'eccezione: chi si ammala non
-- sa quando torna. end_date NULL significa "ancora in corso", e resta cosi'
-- finche' qualcuno non conferma il rientro.
--
-- I turni NON vengono cancellati: restano dove sono, si vedono in
-- trasparenza e non contano. E' esattamente cio' che serve al responsabile
-- per sapere cosa deve coprire se la persona non rientra.
create table if not exists public.absences (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  type        public.absence_type not null default 'malattia',
  start_date  date not null,
  -- Ultimo giorno di assenza, compreso. NULL = ancora in corso.
  end_date    date,
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index if not exists absences_profile_idx
  on public.absences (profile_id, start_date);
create index if not exists absences_company_idx
  on public.absences (company_id, start_date);

-- Una sola assenza aperta per persona: due contemporanee non vogliono dire
-- niente, e renderebbero ambiguo quale chiude il rientro.
create unique index if not exists absences_una_aperta
  on public.absences (profile_id) where end_date is null;

-- Stesso controllo degli altri: la persona dev'essere dell'azienda che
-- possiede la riga, e sta nel database cosi' vale per ogni strada che scrive.
create or replace function public.absence_profile_matches_company()
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
    raise exception 'L''assenza riguarda una persona di un''altra azienda';
  end if;
  return new;
end $$;

drop trigger if exists absences_company_check on public.absences;
create trigger absences_company_check
  before insert or update on public.absences
  for each row execute function public.absence_profile_matches_company();

-- --------------------------------------------------------- conferma rientro
-- Il rientro lo puo' confermare la persona stessa. Passa da una funzione e
-- non da una policy di update perche' cosi' l'unica cosa che puo' toccare e'
-- la data di fine della propria assenza aperta: con un permesso di update su
-- absences potrebbe anche spostarsi l'inizio, o chiudere quella di un altro.
--
-- Si passa il primo giorno in cui torna: l'assenza finisce il giorno prima.
create or replace function public.conferma_rientro(primo_giorno date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.absences
     set end_date = primo_giorno - 1
   where profile_id = auth.uid()
     and end_date is null
     and primo_giorno > start_date;
end $$;

grant execute on function public.conferma_rientro(date) to authenticated;

-- ------------------------------------------------------------------- RLS
alter table public.absences enable row level security;

-- Le vedono tutti quelli dell'azienda: la Supervisione serve anche ai
-- dipendenti, e un turno in trasparenza senza sapere perche' e' peggio che
-- non vederlo.
drop policy if exists absences_select on public.absences;
create policy absences_select on public.absences
  for select using (company_id = public.current_company_id());

drop policy if exists absences_write on public.absences;
create policy absences_write on public.absences
  for all
  using (company_id = public.current_company_id() and public.is_capo())
  with check (company_id = public.current_company_id() and public.is_capo());
