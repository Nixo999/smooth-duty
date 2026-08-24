-- =====================================================================
--  Turni — una persona può lavorare in più reparti
--  Da eseguire dopo 07-persone-senza-account.sql.
-- =====================================================================
--
--  Non contemporaneamente: in un turno fa una cosa sola. Ma chi sta in
--  cucina il lunedì può stare in sala il sabato, e finora il modello non lo
--  permetteva — `profiles.department_id` era uno solo.
--
--  `profiles.department_id` resta, e diventa il reparto **principale**:
--  quello che si scrive accanto al nome e che vale quando non c'è altro da
--  cui dedurre. I reparti in cui può lavorare stanno qui.

create table if not exists public.profile_departments (
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  department_id  uuid not null references public.departments(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (profile_id, department_id)
);

create index if not exists profile_departments_reparto_idx
  on public.profile_departments (department_id);

-- Chi aveva un reparto lo tiene, e diventa il primo dei suoi.
insert into public.profile_departments (profile_id, department_id)
select id, department_id from public.profiles where department_id is not null
on conflict do nothing;

-- Stesso controllo degli altri: persona e reparto devono essere della stessa
-- azienda, e sta nel database così vale per ogni strada che scrive.
create or replace function public.profile_department_same_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.profiles p
      join public.departments d on d.company_id = p.company_id
     where p.id = new.profile_id and d.id = new.department_id
  ) then
    raise exception 'Persona e reparto non sono della stessa azienda';
  end if;
  return new;
end $$;

drop trigger if exists profile_departments_company_check on public.profile_departments;
create trigger profile_departments_company_check
  before insert or update on public.profile_departments
  for each row execute function public.profile_department_same_company();

-- ------------------------------------------------------------------- RLS
alter table public.profile_departments enable row level security;

-- Serve a tutti per sapere chi può coprire cosa; la scrittura al responsabile.
drop policy if exists profile_departments_select on public.profile_departments;
create policy profile_departments_select on public.profile_departments
  for select using (
    exists (
      select 1 from public.profiles p
       where p.id = profile_id and p.company_id = public.current_company_id()
    )
    or public.is_platform_admin()
  );

drop policy if exists profile_departments_write on public.profile_departments;
create policy profile_departments_write on public.profile_departments
  for all
  using (
    public.is_capo()
    and exists (
      select 1 from public.profiles p
       where p.id = profile_id and p.company_id = public.current_company_id()
    )
  )
  with check (
    public.is_capo()
    and exists (
      select 1 from public.profiles p
       where p.id = profile_id and p.company_id = public.current_company_id()
    )
  );

-- ------------------------------------------------ il reparto più frequente
-- Quando si aggiunge un turno a chi lavora in più reparti, la scelta di
-- partenza è quello in cui lavora più spesso. Si guarda ai turni già fatti,
-- non a una preferenza dichiarata: le abitudini vere le sa il tabellone.
--
-- security_invoker: la vista gira con i permessi di chi la interroga, quindi
-- eredita le policy di shifts e profiles e non fa uscire niente di altrui.
drop view if exists public.reparto_piu_frequente;
create view public.reparto_piu_frequente
with (security_invoker = true) as
select profile_id, department_id, turni
  from (
    select s.profile_id,
           coalesce(s.department_id, p.department_id) as department_id,
           count(*) as turni,
           row_number() over (
             partition by s.profile_id
             order by count(*) desc, coalesce(s.department_id, p.department_id)
           ) as posizione
      from public.shifts s
      join public.profiles p on p.id = s.profile_id
     where s.profile_id is not null
     group by s.profile_id, coalesce(s.department_id, p.department_id)
  ) conteggio
 where posizione = 1 and department_id is not null;

grant select on public.reparto_piu_frequente to authenticated;
