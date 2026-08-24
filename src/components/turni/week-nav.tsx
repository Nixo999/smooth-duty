"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toISODate, weekLabel, weekStart, fromISODate } from "@/lib/date";
import { addDays } from "@/lib/week";

export function WeekNav({ monday }: { monday: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (iso: string) =>
    startTransition(() => router.push(`/turni?s=${iso}`, { scroll: false }));

  const thisWeek = toISODate(weekStart(new Date()));
  const isCurrent = monday === thisWeek;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-lg border border-border bg-surface shadow-soft">
        <button
          type="button"
          aria-label="Settimana precedente"
          onClick={() => go(addDays(monday, -7))}
          className="tap grid h-9 w-9 place-items-center rounded-l-lg text-muted hover:bg-surface-2 hover:text-text"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="w-px self-stretch bg-border" />
        <button
          type="button"
          aria-label="Settimana successiva"
          onClick={() => go(addDays(monday, 7))}
          className="tap grid h-9 w-9 place-items-center rounded-r-lg text-muted hover:bg-surface-2 hover:text-text"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="min-w-0">
        <p
          className="truncate text-[15px] font-semibold tracking-tight first-letter:uppercase"
          aria-live="polite"
          data-pending={pending || undefined}
        >
          {weekLabel(fromISODate(monday))}
        </p>
      </div>

      {!isCurrent ? (
        <Button variant="ghost" size="sm" onClick={() => go(thisWeek)}>
          Oggi
        </Button>
      ) : null}
    </div>
  );
}
