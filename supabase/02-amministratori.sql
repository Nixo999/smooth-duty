-- =====================================================================
--  Turni — amministratori della piattaforma e password temporanee
--  Da eseguire dopo 01-schema.sql.
-- =====================================================================

-- ------------------------------------------------- amministratori
-- Chi gestisce la piattaforma non appartiene a nessuna azienda: crea le
-- aziende e il loro responsabile. Per questo non e' un ruolo dentro
-- profiles, che invece ha company_id obbligatorio.
create table if not exists public.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  created_at  timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

-- Ognuno vede solo la propria riga: serve all'app per sapere "sono admin?",
-- non per farsi dare l'elenco di chi altro lo e'.
drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins
  for select using (user_id = auth.uid());

-- ------------------------------------------- password da cambiare
-- Un account creato da qualcun altro nasce con una password che quella
-- persona conosce: finche' non la cambia, l'app non la lascia entrare
-- da nessun'altra parte.
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- Il flag lo puo' azzerare solo l'interessato, e solo quello: una policy di
-- update su profiles aperta all'utente gli permetterebbe di cambiarsi anche
-- il ruolo.
create or replace function public.mark_password_changed()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set must_change_password = false
   where id = auth.uid();
$$;

grant execute on function public.mark_password_changed() to authenticated;

-- --------------------------------------------------- policy aggiornate
-- L'amministratore vede e gestisce tutte le aziende e tutte le persone.

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select using (
    id = public.current_company_id() or public.is_platform_admin()
  );

drop policy if exists companies_admin_write on public.companies;
create policy companies_admin_write on public.companies
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    company_id = public.current_company_id() or public.is_platform_admin()
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (
    (company_id = public.current_company_id() and public.is_capo())
    or public.is_platform_admin()
  );

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete using (
    (
      company_id = public.current_company_id()
      and public.is_capo()
      and id <> auth.uid()
    )
    or (public.is_platform_admin() and id <> auth.uid())
  );

-- =====================================================================
--  Il primo amministratore
--  Non esiste una pagina pubblica per diventarlo: sarebbe una porta aperta.
--  Si promuove un account gia' esistente, una volta sola, da qui.
--  Sostituisci l'indirizzo con il tuo.
-- =====================================================================
-- insert into public.platform_admins (user_id, email)
-- select id, email from auth.users where email = 'tua@email.it'
-- on conflict (user_id) do nothing;
