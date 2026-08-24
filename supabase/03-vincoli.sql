-- =====================================================================
--  Turni — il turno e la persona devono essere della stessa azienda
--  Da eseguire dopo 02-amministratori.sql.
-- =====================================================================

-- Le policy sui turni controllano che company_id sia quello di chi scrive,
-- ma non che profile_id appartenga a quella stessa azienda: chi sa costruire
-- una richiesta a mano potrebbe mettere in turno una persona di un'altra
-- azienda. Non e' una fuga di dati, ma sporcherebbe il tabellone altrui.
-- Il controllo sta qui e non nel codice perche' cosi' vale per ogni strada
-- che scrive: interfaccia, importazione, o qualunque cosa venga dopo.
create or replace function public.shift_profile_matches_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_id is not null
     and not exists (
       select 1 from public.profiles p
        where p.id = new.profile_id
          and p.company_id = new.company_id
     )
  then
    raise exception
      'Il turno è assegnato a una persona che non appartiene a questa azienda';
  end if;
  return new;
end $$;

drop trigger if exists shifts_profile_company_check on public.shifts;
create trigger shifts_profile_company_check
  before insert or update on public.shifts
  for each row execute function public.shift_profile_matches_company();
