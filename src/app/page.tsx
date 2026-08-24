import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";

/** Smistamento: dove finisce chi apre l'app dipende da cosa e'. */
export default async function Home() {
  const viewer = await getViewer();

  if (!viewer) redirect("/login");
  if (viewer.profile?.must_change_password) redirect("/cambia-password");
  if (viewer.profile) redirect("/turni");
  if (viewer.isPlatformAdmin) redirect("/admin");

  // Autenticato ma senza profilo ne' amministrazione: account rimasto orfano.
  redirect("/login?orfano=1");
}
