"use client";

import { Search, X } from "lucide-react";
import * as React from "react";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** Campo di ricerca per nome. Non e' un `type="search"`: la crocetta che ci
 *  mette il browser cambia da browser a browser e su iOS non c'e', quindi il
 *  modo per svuotarlo se lo disegna l'app. */
export function Ricerca({
  valore,
  onChange,
  placeholder = "Cerca per nome",
  className,
  id,
}: {
  valore: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
      />
      <Input
        id={id}
        type="text"
        value={valore}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        className={cn("pl-9", valore && "pr-9")}
      />
      {valore ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Svuota la ricerca"
          className="tap absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-text"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
