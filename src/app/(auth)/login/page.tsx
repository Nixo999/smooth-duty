import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getViewer } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sospeso?: string; orfano?: string }>;
}) {
  if (await getViewer()) redirect("/");
  const { sospeso, orfano } = await searchParams;

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-7">
      <h1 className="text-[22px] font-semibold tracking-tight">Accedi</h1>
      <p className="mt-1 text-sm text-muted">
        Bastano email e password: l&apos;azienda la riconosciamo dal tuo account.
      </p>

      {sospeso ? (
        <p className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning">
          Il tuo account è stato sospeso. Contatta il responsabile.
        </p>
      ) : null}

      {orfano ? (
        <p className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning">
          Il tuo account non è collegato a nessuna azienda. Contatta chi te
          l&apos;ha creato.
        </p>
      ) : null}

      <LoginForm />

      <p className="mt-5 text-center text-[13px] text-muted">
        Gli account li crea l&apos;azienda: se non ne hai uno, chiedilo al tuo
        responsabile.
      </p>
    </div>
  );
}
