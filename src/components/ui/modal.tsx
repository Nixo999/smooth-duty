"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Da telefono sale dal basso come un foglio, da schermo grande e' una
 *  finestra centrata. E' lo stesso componente: cambia solo dove si ancora. */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex flex-col bg-surface shadow-float",
            "data-[state=open]:animate-sheet-up",
            // telefono: foglio agganciato in basso, angoli alti arrotondati
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl",
            // desktop: finestra centrata
            "sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2",
            "sm:w-[min(30rem,calc(100vw-2rem))] sm:max-h-[85dvh]",
            "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            "border border-border",
            className,
          )}
        >
          <header className="flex items-start gap-3 px-5 pt-5 pb-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[17px] font-semibold tracking-tight">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-[13px] text-muted">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Chiudi"
              className="tap -mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-muted hover:text-text"
            >
              <X className="size-4" />
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>

          {footer ? (
            <footer className="safe-bottom flex items-center justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3.5 sm:rounded-b-2xl">
              {footer}
            </footer>
          ) : (
            <div className="safe-bottom" />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
