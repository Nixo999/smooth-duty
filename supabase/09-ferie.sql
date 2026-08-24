-- =====================================================================
--  Turni — richieste di ferie
--  Da eseguire dopo 08-piu-reparti.sql.
-- =====================================================================

-- Il dipendente si segna le ferie "con riserva"; valgono solo quando il
-- responsabile le conferma. La richiesta e l'assenza restano due cose:
-- la richiesta e' un desiderio con uno stato, l'assenza (tabella absences,
-- causale 'ferie') e' il fatto che toglie ore dai turni. L'approvazione
-- crea l'assenza e se la segna in absence_id, cosi' una revoca sa cosa
-- cancellare.
create table if not exists public.vacation_requests (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  start_date  date not null,
  -- Ultimo giorno di ferie, compreso: una richiesta senza fine non esiste.
  end_date    date not null,
  note        text,
  status      text not null default 'richiesta'
              check (status in ('richiesta', 'approvata', 'rifiutata')),
  -- L'assenza creata dall'approvazione. Se qualcuno la cancella a mano
  -- dalla Squadra il riferimento si azzera da solo.
  absence_id  uuid references public.absences(id) on delete set null,
  decided_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists vacation_requests_company_idx
  on public.vacation_requests (company_id, start_date);
create index if not exists vacation_requests_profile_idx
  on public.vacation_requests (profile_id, start_date);

-- Stesso controllo di shifts e absences: la persona dev'essere dell'azienda
-- che possiede la riga.
create or replace function public.vacation_profile_matches_company()
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
    raise exception 'La richiesta riguarda una persona di un''altra azienda';
  end if;
  return new;
end $$;

drop trigger if exists vacation_requests_company_check on public.vacation_requests;
create trigger vacation_requests_company_check
  before insert or update on public.vacation_requests
  for each row execute function public.vacation_profile_matches_company();

-- ------------------------------------------------------------------- RLS
alter table public.vacation_requests enable row level security;

-- Le vedono tutti quelli dell'azienda: il calendario delle ferie serve
-- proprio a scegliere le settimane guardando quelle degli altri, e "ferie"
-- non dice niente di riservato — a differenza del motivo di un'assenza.
drop policy if exists vacation_requests_select on public.vacation_requests;
create policy vacation_requests_select on public.vacation_requests
  for select using (company_id = public.current_company_id());

-- Ognuno chiede per se', e una richiesta nasce per forza "con riserva":
-- lo stato lo cambia solo il responsabile.
drop policy if exists vacation_requests_insert on public.vacation_requests;
create policy vacation_requests_insert on public.vacation_requests
  for insert with check (
    company_id = public.current_company_id()
    and profile_id = public.current_profile_id()
    and status = 'richiesta'
    and absence_id is null
  );

drop policy if exists vacation_requests_update on public.vacation_requests;
create policy vacation_requests_update on public.vacation_requests
  for update
  using (company_id = public.current_company_id() and public.is_capo())
  with check (company_id = public.current_company_id() and public.is_capo());

-- Ritirare una richiesta si puo' finche' e' ancora una richiesta: quelle
-- decise sono storia, e le toglie solo il responsabile.
drop policy if exists vacation_requests_delete on public.vacation_requests;
create policy vacation_requests_delete on public.vacation_requests
  for delete using (
    company_id = public.current_company_id()
    and (
      public.is_capo()
      or (profile_id = public.current_profile_id() and status = 'richiesta')
    )
  );
