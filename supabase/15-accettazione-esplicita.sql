-- =====================================================================
--  Turni — il si' esplicito torna, accanto al no
--  Da eseguire dopo 14-preapprovazione-e-rifiuti.sql.
-- =====================================================================
--
--  Il verso resta quello di ieri: il turno vale comunque, e chi tace ha
--  accettato. Ma tacere e dire di si' non sono la stessa cosa per chi
--  guarda il tabellone. Con il solo «no» il responsabile vedeva due stati:
--  rifiutato, e tutto il resto — dentro cui stavano insieme chi aveva letto
--  ed era d'accordo e chi non aveva ancora aperto l'app. Sabato sera sono
--  due situazioni diverse.
--
--  Da qui in avanti gli stati sono tre:
--    in attesa   il turno vale, l'interessato non si e' ancora espresso
--    accettato   ha guardato e ha detto di si'
--    rifiutato   ha detto di no, e il responsabile ha un messaggio
--
--  `confermato_at` c'era gia' dai tempi in cui il si' era obbligatorio
--  (11-impostazioni.sql): la colonna resta quella, cambia solo che adesso
--  quel si' e' una cortesia e non un lasciapassare.

-- Il si' dell'interessato sul proprio turno. Come il no: passa da qui e non
-- da un permesso di scrittura, che gli lascerebbe cambiare anche gli orari.
--
-- Si accetta solo cio' su cui non ci si e' gia' espressi: un turno rifiutato
-- ha gia' lasciato un messaggio al responsabile, e magari un buco da
-- coprire; ripescarlo con un si' vorrebbe dire rimettere in piedi da soli
-- qualcosa che intanto e' stato disfatto altrove.
create or replace function public.accetta_turno(turno uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  toccati int;
begin
  update public.shifts
     set confermato_at = now()
   where id = turno
     and profile_id = public.current_profile_id()
     and richiede_conferma is not null
     and confermato_at is null
     and rifiutato_at is null
     -- Come per il no: sui giorni gia' passati non c'e' piu' niente da
     -- dire, il turno o e' stato fatto o non lo e' stato.
     and date >= (now() at time zone 'Europe/Rome')::date;

  get diagnostics toccati = row_count;
  return toccati > 0;
end $$;

grant execute on function public.accetta_turno(uuid) to authenticated;

-- E per simmetria: non si rifiuta piu' quello che si e' gia' accettato. La
-- parola data vale, altrimenti il si' non significherebbe niente — e chi
-- cambia davvero le sue condizioni chiede un permesso, che e' l'altra
-- strada e serve apposta.
drop function if exists public.rifiuta_turno(uuid, text);

create function public.rifiuta_turno(turno uuid, motivazione text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.shifts%rowtype;
begin
  select * into t
    from public.shifts
   where id = turno
     and profile_id = public.current_profile_id()
     and richiede_conferma is not null
     and rifiutato_at is null
     and confermato_at is null
     and date >= (now() at time zone 'Europe/Rome')::date;

  if not found then
    return false;
  end if;

  motivazione := left(nullif(btrim(coalesce(motivazione, '')), ''), 300);

  update public.shifts
     set rifiutato_at = now(),
         nota_rifiuto = motivazione
   where id = turno;

  insert into public.shift_messages
    (company_id, profile_id, shift_id, motivo, nota, giorno, turno_prima, turno_dopo)
  values (
    t.company_id,
    t.profile_id,
    t.id,
    t.richiede_conferma,
    motivazione,
    t.date,
    t.stato_prima,
    jsonb_build_object(
      'profile_id', t.profile_id,
      'date', t.date,
      'start_time', left(t.start_time::text, 5),
      'end_time', left(t.end_time::text, 5),
      'department_id', t.department_id,
      'title', t.title,
      'location', t.location,
      'notes', t.notes
    )
  );

  return true;
end $$;

grant execute on function public.rifiuta_turno(uuid, text) to authenticated;
