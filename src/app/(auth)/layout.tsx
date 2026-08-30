import { CalendarDays } from "lucide-react";
import { NOME_PRODOTTO } from "@/app/layout";
import { ThemeToggle } from "@/components/ui/theme";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-app flex flex-col">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-lg marchio">
            <CalendarDays className="size-4" />
          </div>
          {/* L'unico posto in cui il prodotto si nomina prima del ruolo: vale
              per login, password dimenticata, cambia password e atterraggio. */}
          <span className="text-[15px] font-semibold tracking-tight">
            {NOME_PRODOTTO}
          </span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-8">
        <div className="w-full max-w-[25rem] animate-rise">{children}</div>
      </main>
    </div>
  );
}
