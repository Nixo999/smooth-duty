-- =====================================================================
--  Turni — una persona può esistere senza avere un accesso
--  Da eseguire dopo 06-causali-e-riservatezza.sql.
-- =====================================================================
--
--  Finora un profilo *era* un account: la sua chiave era l'identificativo
--  dell'utente in auth.users. Voleva dire che per mettere qualcuno in turno
--  serviva prima un indirizzo email — su un tabellone da trenta persone, di
--  cui metà non aprirà mai l'app, è un ostacolo che non ha ragione di
--  esistere.
--
--  Da qui in poi le due cose sono separate: la persona sta in `profiles`, il
--  suo accesso (se ce l'ha) in `profiles.user_id`. NULL vuol dire che è in
--  squadra, va in turno, compare nei conti, ma non può entrare nell'app.

-- --------------------------------------------------- la chiave si stacca
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();

alter table public.profiles
  add column if not exists user_id uuid unique
    references auth.users(id) on delete set null;

-- Le righe che c'erano nascevano con id = identificativo dell'utente.
update public.profiles set user_id = id where user_id is null;

-- Senza accesso non c'è nemmeno un indirizzo a cui scrivere.
alter table public.profiles alter column email drop not null;

-- ------------------------------------------- chi sta guardando lo schermo
-- Prima bastava auth.uid(), perché era anche l'identificativo del profilo.
-- Ora i due numeri sono diversi e va fatto il passaggio.
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where user_id = auth.uid();
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where user_id = auth.uid();
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
    where user_id = auth.uid() and role = 'capo' and active
  );
$$;

create or replace function public.mark_password_changed()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set must_change_password = false
   where user_id = auth.uid();
$$;

create or replace function public.conferma_rientro(primo_giorno date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.absences
     set end_date = primo_giorno - 1
   where profile_id = public.current_profile_id()
     and end_date is null
     and primo_giorno > start_date;
end $$;

-- ------------------------------------------------------ policy aggiornate
-- Ovunque si confrontava auth.uid() con un identificativo di profilo.

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete using (
    (
      company_id = public.current_company_id()
      and public.is_capo()
      and id <> public.current_profile_id()
    )
    or (public.is_platform_admin() and id <> public.current_profile_id())
  );

drop policy if exists absences_select on public.absences;
create policy absences_select on public.absences
  for select using (
    company_id = public.current_company_id()
    and (public.is_capo() or profile_id = public.current_profile_id())
  );

-- Una persona senza accesso non ha una password da cambiare.
alter table public.profiles drop constraint if exists profiles_accesso_coerente;
alter table public.profiles
  add constraint profiles_accesso_coerente
  check (user_id is not null or not must_change_password);
