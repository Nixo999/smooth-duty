import * as React from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full bg-surface-2 text-text placeholder:text-faint border border-border " +
  "rounded-lg px-3 transition-colors " +
  "hover:border-border-strong focus:border-accent focus:bg-surface " +
  "disabled:opacity-50 disabled:cursor-not-allowed " +
  // 16px pieni: sotto questa soglia iOS ingrandisce la pagina appena
  // tocchi il campo, e non torna piu' indietro da solo.
  "text-base sm:text-sm";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(control, "h-11 sm:h-10", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea className={cn(control, "py-2.5 min-h-20 resize-y", className)} {...props} />
  );
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        control,
        "h-11 sm:h-10 appearance-none cursor-pointer pr-9",
        // freccia disegnata come sfondo, cosi' resta uguale su ogni browser
        "bg-[image:var(--chevron)] bg-no-repeat bg-[position:right_0.7rem_center] bg-[size:0.7rem]",
        className,
      )}
      style={{
        // currentColor non funziona dentro un data URI: si passa il colore
        // dal tema con una variabile.
        ["--chevron" as string]:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5 6 6.5l5-5' stroke='%23888892' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
      }}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-[13px] font-medium text-muted"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12.5px] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[12.5px] text-faint">{hint}</p>
      ) : null}
    </div>
  );
}
