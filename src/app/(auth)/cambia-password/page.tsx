import { redirect } from "next/navigation";
import { esci } from "@/app/(auth)/actions";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { getViewer } from "@/lib/auth";

export default async function CambiaPasswordPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  // Chi ci arriva senza doverla cambiare non ha niente da fare qui.
  if (!viewer.profile?.must_change_password) {
    redirect(viewer.profile ? "/turni" : "/admin");
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-7">
      <h1 className="text-[22px] font-semibold tracking-tight">
        Scegli la tua password
      </h1>
      <p className="mt-1 text-sm text-muted">
        Quella che ti hanno consegnato è provvisoria. Sostituiscila con una che
        conosci solo tu.
      </p>

      <ChangePasswordForm />

      <form action={esci} className="mt-5 text-center">
        <button
          type="submit"
          className="text-[13px] text-muted hover:text-text hover:underline"
        >
          Esci
        </button>
      </form>
    </div>
  );
}
