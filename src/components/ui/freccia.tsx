import { cn } from "@/lib/utils";

/** La freccetta dei richiudibili, una sola per tutta l'app: gira quando il
 *  `<details>` che la contiene (col `group`) e' aperto. Era scritta due
 *  volte, in Impostazioni e in Prospetto, identica salvo un margine. */
export function Freccia({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "shrink-0 text-[13px] text-faint transition-transform group-open:rotate-90",
        className,
      )}
    >
      ›
    </span>
  );
}
