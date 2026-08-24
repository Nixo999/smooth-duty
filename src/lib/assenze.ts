/** Chi è assente, e perché.
 *
 *  I turni di chi è assente non si cancellano: restano al loro posto, si
 *  vedono in trasparenza e non contano da nessuna parte. È l'unico modo per
 *  cui il responsabile possa vedere che cosa deve coprire — cancellandoli,
 *  quei buchi sparirebbero dallo schermo insieme ai turni.
 *
 *  ⚠️ Il **motivo** dell'assenza è un dato riservato: malattia e legge 104
 *  dicono cose sulla salute di una persona e della sua famiglia. Lo vedono
 *  solo il responsabile e l'interessato. Ai colleghi arriva soltanto il
 *  fatto che quel giorno non c'è, tramite la vista `absence_days` che il
 *  motivo non lo contiene proprio. */

export type AssenzaInput = {
  id: string;
  profile_id: string;
  /** Assente per la vista che i colleghi possono leggere: lì il motivo non
   *  viene proprio selezionato. */
  type?: string | null;
  start_date: string; // YYYY-MM-DD
  /** Ultimo giorno di assenza, compreso. null = ancora in corso. */
  end_date: string | null;
  note?: string | null;
};

/** Le causali previste, raggruppate come le pensa chi compila il cartellino.
 *  L'elenco vive anche nel vincolo su `absences.type`: aggiungerne una vuole
 *  dire toccare tutti e due. */
export const CAUSALI = [
  {
    gruppo: "Salute",
    voci: [
      ["malattia", "Malattia"],
      ["infortunio", "Infortunio sul lavoro"],
      ["visita_medica", "Visita medica"],
      ["legge_104", "Permesso legge 104"],
    ],
  },
  {
    gruppo: "Permessi",
    voci: [
      ["permesso_retribuito", "Permesso retribuito"],
      ["permesso_non_retribuito", "Permesso non retribuito"],
      ["rol", "ROL / ex festività"],
      ["banca_ore", "Banca ore"],
    ],
  },
  {
    gruppo: "Famiglia",
    voci: [
      ["ferie", "Ferie"],
      ["maternita", "Maternità / paternità"],
      ["congedo_parentale", "Congedo parentale"],
      ["lutto", "Permesso per lutto"],
      ["matrimonio", "Congedo matrimoniale"],
    ],
  },
  {
    gruppo: "Altro",
    voci: [
      ["donazione_sangue", "Donazione sangue"],
      ["studio", "Permesso per studio"],
      ["carica_pubblica", "Carica pubblica / elettorale"],
      ["sciopero", "Sciopero"],
      ["aspettativa", "Aspettativa"],
      ["sospensione", "Sospensione / cassa integrazione"],
      ["altro", "Altro"],
    ],
  },
] as const satisfies ReadonlyArray<{
  gruppo: string;
  voci: ReadonlyArray<readonly [string, string]>;
}>;

/** I codici ammessi, gli stessi del vincolo su `absences.type`. */
export const CODICI_CAUSALE = CAUSALI.flatMap((g) =>
  g.voci.map(([codice]) => codice),
) as string[];

const NOMI = new Map<string, string>(
  CAUSALI.flatMap((g) => g.voci.map(([codice, nome]) => [codice, nome] as const)),
);

/** Se il motivo non c'è (perché chi guarda non ha diritto di vederlo) o è
 *  sconosciuto, resta comunque vero che la persona è assente. */
export function ETICHETTA(tipo?: string | null): string {
  if (!tipo) return "assente";
  return NOMI.get(tipo) ?? "assente";
}

/** Se queste ore vadano pagate lo decide il contratto, non l'app: qui si
 *  distingue solo per poterlo mostrare nel prospetto. */
export const NON_RETRIBUITE = new Set([
  "permesso_non_retribuito",
  "aspettativa",
  "sciopero",
]);

/** L'assenza che copre quel giorno, se c'è.
 *
 *  Le date sono stringhe YYYY-MM-DD e si confrontano direttamente: essendo a
 *  lunghezza fissa, l'ordine alfabetico e quello cronologico coincidono. Fare
 *  il giro da oggetti Date aprirebbe il solito problema dei fusi orari. */
export function assenzaDelGiorno<T extends AssenzaInput>(
  assenze: T[],
  profileId: string | null,
  giorno: string,
): T | null {
  if (!profileId) return null;
  return (
    assenze.find(
      (a) =>
        a.profile_id === profileId &&
        a.start_date <= giorno &&
        (a.end_date === null || giorno <= a.end_date),
    ) ?? null
  );
}

/** L'assenza aperta di una persona, quella senza data di fine. */
export function assenzaAperta<T extends AssenzaInput>(
  assenze: T[],
  profileId: string,
): T | null {
  return assenze.find((a) => a.profile_id === profileId && a.end_date === null) ?? null;
}

/** Come si scrive un'assenza in una riga: «Malattia, dal 19 agosto». */
export function descriviAssenza(
  a: AssenzaInput,
  formattaData: (iso: string) => string,
): string {
  const che = ETICHETTA(a.type);
  if (a.end_date === null) return `${che}, dal ${formattaData(a.start_date)}`;
  if (a.start_date === a.end_date) return `${che}, il ${formattaData(a.start_date)}`;
  return `${che}, dal ${formattaData(a.start_date)} al ${formattaData(a.end_date)}`;
}
