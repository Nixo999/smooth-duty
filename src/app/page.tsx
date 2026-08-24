import { redirect } from "next/navigation";
import { destinazioneDi, getViewer } from "@/lib/auth";

/** Smistamento: dove finisce chi apre l'app dipende da cosa e'. */
export default async function Home() {
  redirect(destinazioneDi(await getViewer()));
}
