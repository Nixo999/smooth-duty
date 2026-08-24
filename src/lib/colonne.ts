/** Le colonne che le pagine chiedono a Supabase.
 *
 *  Stanno qui e non sparse nelle query perché ogni volta che si aggiunge un
 *  campo va aggiornato ovunque: dimenticarne una pagina produce un `undefined`
 *  che non somiglia a un errore e si scopre settimane dopo. */

export const COLONNE_PROFILO =
  "id, company_id, full_name, email, role, active, must_change_password, department_id, contract_hours, on_call";

export const COLONNE_TURNO =
  "id, company_id, profile_id, date, start_time, end_time, title, location, notes, department_id";

export const COLONNE_REPARTO = "id, company_id, name, hue, position";

export const COLONNE_ASSENZA =
  "id, company_id, profile_id, type, start_date, end_date, note";

export const COLONNE_FASCIA =
  "id, company_id, department_id, name, start_time, end_time, required, weekdays, position";
