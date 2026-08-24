-- =====================================================================
--  Turni — causali di assenza all'italiana, e chi può vederle
--  Da eseguire dopo 05-assenze.sql.
-- =====================================================================

-- ------------------------------------------------------------- causali
-- Da enum a testo con vincolo. Un enum si allarga solo con ALTER TYPE, che
-- dentro una transazione non lascia usare subito il valore nuovo; un vincolo
-- CHECK si riscrive in una riga. Questo elenco è destinato a crescere — le
-- causali di assenza in Italia sono tante e cambiano — quindi conviene la
-- forma che si modifica senza cerimonie.
alter table public.absences
  alter column type type text using type::text;

alter table public.absences
  alter column type set default 'malattia';

drop type if exists public.absence_type;

-- Le vecchie righe usavano "permesso", che ora si distingue in retribuito e
-- non: senza scelta esplicita vale la forma più comune.
update public.absences set type = 'permesso_retribuito' where type = 'permesso';

alter table public.absences drop constraint if exists absences_causale_valida;
alter table public.absences add constraint absences_causale_valida check (
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
-- Il motivo di un'assenza dice cose sulla salute di una persona, e con la
-- legge 104 anche su quella di un suo familiare. Non è un dato di servizio:
-- lo vedono solo il responsabile e l'interessato.
drop policy if exists absences_select on public.absences;
create policy absences_select on public.absences
  for select using (
    company_id = public.current_company_id()
    and (public.is_capo() or profile_id = auth.uid())
  );

-- Ai colleghi serve un'altra cosa, e una sola: sapere che quel giorno la
-- persona non c'è, perché è ciò che rende scoperto un turno. Questa vista
-- espone i giorni e basta — il motivo non viene proprio selezionato, quindi
-- non c'è niente da far trapelare.
--
-- La vista gira con i privilegi di chi la possiede, quindi non eredita le
-- policy di absences: il confine fra aziende lo tiene la clausola where.
drop view if exists public.absence_days;
create view public.absence_days
with (security_invoker = false) as
  select id, company_id, profile_id, start_date, end_date
    from public.absences
   where company_id = public.current_company_id();

grant select on public.absence_days to authenticated;
