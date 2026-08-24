-- =====================================================================
--  Turni — da ferie a permessi: si chiede qualunque assenza
--  Da eseguire dopo 09-ferie.sql.
-- =====================================================================

-- La richiesta porta la sua causale, con lo stesso elenco di absences:
-- all'approvazione la causale passa pari pari nell'assenza creata.
alter table public.vacation_requests
  add column if not exists type text not null default 'ferie';

alter table public.vacation_requests
  drop constraint if exists vacation_requests_causale_valida;
alter table public.vacation_requests
  add constraint vacation_requests_causale_valida check (
    type in (
      -- salute
      'malattia', 'infortunio', 'visita_medica', 'legge_104',
      -- permessi
      'permesso_retribuito', 'permesso_non_retribuito', 'rol', 'banca_ore',
      -- famiglia
      'ferie', 'maternita', 'congedo_parentale', 'lutto', 'matrimonio',
      -- altro
      'donazione_sangue', 'studio', 'carica_pubblica', 'sciopero',
      'aspettativa', 'sospensione', 'altro'
    )
  );

-- ------------------------------------------------------- riservatezza
-- Le ferie sono un fatto d'agenda e le vede tutta l'azienda: il calendario
-- serve a scegliere le settimane guardando quelle degli altri. Ogni altra
-- causale dice qualcosa di personale — la salute, la famiglia — e resta fra
-- l'interessato e il responsabile. Stessa regola su richieste e assenze,
-- altrimenti la stessa malattia sarebbe segreta da una parte e no dall'altra.
drop policy if exists vacation_requests_select on public.vacation_requests;
create policy vacation_requests_select on public.vacation_requests
  for select using (
    company_id = public.current_company_id()
    and (
      public.is_capo()
      or profile_id = public.current_profile_id()
      or type = 'ferie'
    )
  );

drop policy if exists absences_select on public.absences;
create policy absences_select on public.absences
  for select using (
    company_id = public.current_company_id()
    and (
      public.is_capo()
      or profile_id = public.current_profile_id()
      or type = 'ferie'
    )
  );
