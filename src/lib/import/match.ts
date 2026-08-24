/** Confronto fra il nome scritto nel file e quello dei dipendenti in elenco.
 *  Deve reggere accenti, apostrofi, doppi spazi e l'ordine invertito:
 *  "Marcinno' Concetta" e "Concetta Marcinnò" sono la stessa persona. */

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Le stesse parole in qualunque ordine. */
function sortedWords(value: string): string {
  return normalizeName(value).split(" ").sort().join(" ");
}

export type Candidate = { id: string; full_name: string };

export function matchPerson(
  fullName: string,
  candidates: Candidate[],
): string | null {
  const exact = normalizeName(fullName);
  const found = candidates.find((c) => normalizeName(c.full_name) === exact);
  if (found) return found.id;

  const scrambled = sortedWords(fullName);
  const reordered = candidates.filter((c) => sortedWords(c.full_name) === scrambled);
  // Un solo candidato o e' un abbinamento, due sono un dubbio: meglio
  // lasciare scegliere che indovinare.
  if (reordered.length === 1) return reordered[0].id;

  return null;
}
