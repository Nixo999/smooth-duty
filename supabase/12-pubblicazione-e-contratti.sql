-- =====================================================================
--  Turni — settimane pubblicate (bozza rovesciata) e tipo di contratto
--  Da eseguire dopo 11-impostazioni.sql.
-- =====================================================================

-- ------------------------------------------------ settimane pubblicate
-- Rovescio della logica di ieri: una settimana E' una bozza finche' il
-- responsabile non la pubblica. Qui stanno le pubblicate; tutto il resto
-- e' lavoro in corso che i dipendenti non vedono. E' il verso giusto:
-- una tabella di bozze presuppone che qualcuno si ricordi di marcarle,
-- e una settimana dimenticata finirebbe in faccia ai dipendenti a meta'.
create table if not exists public.published_weeks (
  company_id   uuid not null references public.companies(id) on delete cascade,
  monday       date not null,
  published_at timestamptz not null default now(),
  primary key (company_id, monday)
);

alter table public.published_weeks enable row level security;

drop policy if exists published_weeks_select on public.published_weeks;
create policy published_weeks_select on public.published_weeks
  for select using (company_id = public.current_company_id());

drop policy if exists published_weeks_write on public.published_weeks;
create policy published_weeks_write on public.published_weeks
  for all
  using (company_id = public.current_company_id() and public.is_capo())
  with check (company_id = public.current_company_id() and public.is_capo());

-- Le settimane che hanno gia' turni erano visibili prima di questa regola:
-- si considerano pubblicate, altrimenti i tabelloni di tutti sparirebbero
-- dall'oggi al domani. date_trunc('week') in Postgres parte dal lunedi'.
insert into public.published_weeks (company_id, monday)
select distinct company_id, (date_trunc('week', date::timestamp))::date
  from public.shifts
on conflict do nothing;

-- La tabella di ieri, mai arrivata in produzione, si ritira.
drop table if exists public.draft_weeks;

-- ------------------------------------------------- tipo di contratto
-- A chiamata, part time o full time: lo dice la scheda della persona, non
-- una soglia automatica sulle ore. Le righe esistenti si classificano una
-- volta col criterio d'uso comune (38 ore e su = full time), poi comanda
-- la scheda.
alter table public.profiles
  add column if not exists contract_type text not null default 'part_time'
  check (contract_type in ('chiamata', 'part_time', 'full_time'));

update public.profiles
   set contract_type = case
     when on_call then 'chiamata'
     when contract_hours is not null and contract_hours >= 38 then 'full_time'
     else 'part_time'
   end
 where contract_type = 'part_time';
