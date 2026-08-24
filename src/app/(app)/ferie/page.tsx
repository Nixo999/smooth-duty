import { redirect } from "next/navigation";

/** La pagina si chiama Permessi da quando si chiede qualunque assenza, non
 *  solo le ferie. Il vecchio indirizzo resta per chi lo ha salvato. */
export default function Ferie() {
  redirect("/permessi");
}
