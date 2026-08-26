-- =====================================================================
--  Turni — provare all'infinito non si puo'
--  Da eseguire dopo 17-turno-spostato.sql.
-- =====================================================================
--
--  Una password si indovina provando. Con l'app raggiungibile da internet,
--  «provando» vuol dire un programma che tenta migliaia di combinazioni al
--  minuto contro un indirizzo email che si conosce — e gli indirizzi di
--  un'azienda si conoscono sempre.
--
--  Il contatore sta nel database e non nella memoria del server per una
--  ragione pratica: le pagine girano in funzioni che nascono e muoiono a
--  ogni richiesta, e su una piattaforma seria non e' nemmeno detto che due
--  richieste finiscano sulla stessa macchina. Un contatore in memoria
--  ripartirebbe da zero continuamente, cioe' non conterebbe niente.
--
--  Si contano solo i tentativi ANDATI MALE, e un accesso riuscito azzera il
--  conto: chi sbaglia due volte e poi entra non deve trovarsi a meta' del
--  fido la settimana dopo.

create table if not exists public.access_attempts (
  id bigserial primary key,
  -- Cosa si sta limitando: 'accesso:mario@ditta.it', 'ip:1.2.3.4',
  -- 'recupero:mario@ditta.it'. La forma la decide il codice, qui si conta
  -- e basta.
  chiave text not null,
  creato_at timestamptz not null default now()
);

create index if not exists access_attempts_chiave_idx
  on public.access_attempts (chiave, creato_at desc);

-- Nessuno la legge dall'app: ci parlano solo le funzioni qui sotto, con i
-- privilegi del proprietario. RLS acceso e nessuna policy significa che per
-- chiunque altro questa tabella e' vuota e non scrivibile.
alter table public.access_attempts enable row level security;

-- ------------------------------------------------------------ il conto

/** Quanti tentativi falliti ci sono su questa chiave, dentro la finestra. */
create or replace function public.tentativi_recenti(
  chiave text,
  finestra_minuti int
)
returns int
language sql
security definer
set search_path = public
as $$
  select count(*)::int
    from public.access_attempts a
   where a.chiave = tentativi_recenti.chiave
     and a.creato_at > now() - make_interval(mins => finestra_minuti);
$$;

/** Segna un tentativo andato male. La pulizia sta qui e non in un lavoro
 *  programmato: e' una riga, gira solo quando qualcuno sbaglia, e cosi' la
 *  tabella non cresce per sempre senza che nessuno se ne accorga. */
create or replace function public.segna_tentativo(chiave text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.access_attempts (chiave) values (chiave);
  delete from public.access_attempts where creato_at < now() - interval '1 day';
end $$;

/** Entrato: il conto riparte da zero. */
create or replace function public.azzera_tentativi(chiave text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.access_attempts a where a.chiave = azzera_tentativi.chiave;
$$;

-- ⚠️ In Postgres una funzione nuova e' eseguibile da PUBLIC: senza queste
-- righe chiunque, anche senza aver fatto accesso, potrebbe chiamare
-- `azzera_tentativi` e cancellarsi il blocco appena preso — cioe' proprio
-- la cosa da cui questa migrazione difende. Le chiama solo il server, con
-- la chiave di servizio.
revoke execute on function public.tentativi_recenti(text, int) from public, anon, authenticated;
revoke execute on function public.segna_tentativo(text) from public, anon, authenticated;
revoke execute on function public.azzera_tentativi(text) from public, anon, authenticated;

notify pgrst, 'reload schema';
