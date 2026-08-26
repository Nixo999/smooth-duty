import Link from "next/link";
import { redirect } from "next/navigation";
import { RecuperoForm } from "@/components/auth/recupero-form";
import { getViewer } from "@/lib/auth";

export default async function PasswordDimenticataPage() {
  // Chi e' gia' dentro non ha niente da recuperare: la password si cambia dal
  // menu dell'account, e li' viene chiesta quella di adesso.
  if (await getViewer()) redirect("/");

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-7">
      <h1 className="text-[22px] font-semibold tracking-tight">
        Password dimenticata
      </h1>
      <p className="mt-1 text-sm text-muted">
        Scrivi il tuo indirizzo: ti mandiamo un link per sceglierne una nuova.
      </p>

      <RecuperoForm />

      <p className="mt-5 text-center text-[13px] text-muted">
        <Link href="/login" className="hover:text-text hover:underline">
          Torna all&apos;accesso
        </Link>
      </p>
    </div>
  );
}
