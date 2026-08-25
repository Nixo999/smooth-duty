-- =====================================================================
--  Turni — il turno vale subito, e il dipendente lo puo' rifiutare
--  Da eseguire dopo 13-pagine-e-cambio-reparto.sql.
-- =====================================================================
--
--  Cambia il verso delle conferme, e vale SOLO per i turni.
--
--  Prima: il turno che generava straordinario, o che veniva cambiato dopo
--  la pubblicazione, restava appeso finche' l'interessato non diceva di si'.
--  Il responsabile costruiva la settimana e poi aspettava; chi non apriva
--  l'app per due giorni teneva ferma la sua.
--
--  Adesso: quel turno e' preapprovato — vale, si vede, si conta — e il
--  dipendente ha la facolta' di rifiutarlo. Chi non dice niente ha
--  accettato, che e' il caso di gran lunga piu' frequente; chi rifiuta
--  manda un messaggio al responsabile, e li' il turno cambia strada.
--
--  Due strade, e si distinguono da una domanda sola: quel turno c'era gia'?
--    - Si': il rifiuto lo riporta com'era. La modifica non e' passata, e il
--      turno di prima e' ancora un turno buono.
--    - No, era nuovo: non c'e' niente a cui tornare. Il turno si toglie e
--      resta un buco, che il responsabile deve coprire con un turno nuovo
--      per quella persona: finche' non lo fa, il messaggio resta aperto.
--
--  Le richieste di permesso NON c'entrano: quelle nascono con riserva e
--  restano tali finche' il responsabile le approva. La' il verso e' giusto
--  cosi': un'assenza data per buona in attesa di smentita e' un buco in
--  turno che nessuno ha visto arrivare.

-- ------------------------------------------------ lo stato di partenza
-- Com'era il turno prima della modifica preapprovata. Serve solo a poterlo
-- rimettere se l'interessato rifiuta, e si azzera appena la questione e'
-- chiusa. NULL su un turno nato adesso: non c'e' un "prima".
alter table public.shifts
  add column if not exists stato_prima jsonb;

-- Il no dell'interessato: quando, e volendo il perche'.
alter table public.shifts
  add column if not exists rifiutato_at timestamptz;
alter table public.shifts
  add column if not exists nota_rifiuto text;

-- ------------------------------------------------------- i messaggi
-- Un rifiuto che aspetta il responsabile. Porta con se' tutto quello che
-- serve a raccontarlo e ad applicarlo, perche' il turno da cui nasce puo'
-- non esistere piu' quando il messaggio viene letto.
create table if not exists public.shift_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Chi ha rifiutato.
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Il turno, finche' esiste: cancellandolo il messaggio resta comunque.
  shift_id uuid references public.shifts(id) on delete set null,
  -- Il motivo per cui era rifiutabile: gli stessi valori di
  -- shifts.richiede_conferma.
  motivo text not null,
  -- Il perche' del no, se l'ha scritto.
  nota text,
  -- Il giorno del turno: dopo l'eliminazione e' l'unico modo di sapere
  -- quale buco va coperto.
  giorno date not null,
  -- Com'era prima (NULL = era un turno nuovo) e com'era al momento del no.
  turno_prima jsonb,
  turno_dopo jsonb not null,
  -- Che cosa e' successo quando il responsabile l'ha aperto:
  --   ripristinato = il turno e' tornato come prima
  --   da_rifare    = il turno e' stato tolto, ne va fatto uno nuovo
  --   superato     = nel frattempo il responsabile lo aveva gia' cambiato,
  --                  e allora comanda l'ultima parola sua, non un
  --                  ripristino che gli cancellerebbe il lavoro
  esito text check (esito in ('ripristinato', 'da_rifare', 'superato')),
  creato_at timestamptz not null default now(),
  -- Quando il responsabile l'ha aperto: e' li' che l'effetto scatta.
  visto_at timestamptz,
  -- Solo per i "da_rifare": quando il turno nuovo e' stato creato.
  risolto_at timestamptz
);

create index if not exists shift_messages_da_vedere
  on public.shift_messages (company_id, visto_at, creato_at desc);

alter table public.shift_messages enable row level security;

-- Li legge il responsabile, e l'interessato i propri: chi ha rifiutato deve
-- poter vedere che il suo no e' arrivato.
drop policy if exists shift_messages_select on public.shift_messages;
create policy shift_messages_select on public.shift_messages
  for select using (
    company_id = public.current_company_id()
    and (public.is_capo() or profile_id = public.current_profile_id())
  );

-- Li aggiorna solo il responsabile (segnarli visti, chiuderli). L'inserimento
-- non passa da qui ma dalla funzione qui sotto: il dipendente non ha scrittura
-- su questa tabella, e cosi' non puo' scrivere un messaggio a nome d'altri.
drop policy if exists shift_messages_update on public.shift_messages;
create policy shift_messages_update on public.shift_messages
  for update
  using (company_id = public.current_company_id() and public.is_capo())
  with check (company_id = public.current_company_id() and public.is_capo());

-- --------------------------------------------------- il no del dipendente
-- Come il si' di ieri: passa da qui e non da un permesso di update, perche'
-- con quello l'interessato potrebbe riscriversi gli orari. Qui puo' fare una
-- cosa sola, e solo sul proprio turno.
create or replace function public.rifiuta_turno(turno uuid, motivazione text default null)
returns void
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
     and rifiutato_at is null;

  if not found then
    return;
  end if;

  update public.shifts
     set rifiutato_at = now(),
         nota_rifiuto = nullif(btrim(coalesce(motivazione, '')), '')
   where id = turno;

  insert into public.shift_messages
    (company_id, profile_id, shift_id, motivo, nota, giorno, turno_prima, turno_dopo)
  values (
    t.company_id,
    t.profile_id,
    t.id,
    t.richiede_conferma,
    nullif(btrim(coalesce(motivazione, '')), ''),
    t.date,
    t.stato_prima,
    jsonb_build_object(
      'date', t.date,
      -- I primi cinque caratteri di '09:00:00': l'app gli orari li scrive
      -- e li legge sempre come HH:MM. Niente to_char, che su una colonna
      -- `time` ci arriva solo passando per un cast a interval.
      'start_time', left(t.start_time::text, 5),
      'end_time', left(t.end_time::text, 5),
      'department_id', t.department_id,
      'title', t.title,
      'location', t.location,
      'notes', t.notes
    )
  );
end $$;

grant execute on function public.rifiuta_turno(uuid, text) to authenticated;

-- Il si' esplicito non esiste piu': ora chi tace ha accettato. Tenere in giro
-- la funzione vecchia vorrebbe dire avere due verita' su cosa vale un turno.
drop function if exists public.conferma_turno(uuid);
