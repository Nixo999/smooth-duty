"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const button = cva(
  "tap inline-flex items-center justify-center gap-2 font-medium select-none " +
    "disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg hover:bg-accent-hover shadow-soft",
        secondary:
          "bg-surface text-text border border-border hover:bg-surface-2 shadow-soft",
        subtle: "bg-surface-3 text-text hover:brightness-95 dark:hover:brightness-125",
        ghost: "text-muted hover:bg-surface-3 hover:text-text",
        danger: "bg-danger-soft text-danger hover:brightness-95 dark:hover:brightness-125",
      },
      size: {
        sm: "h-8 px-3 text-[13px] rounded-md",
        md: "h-10 px-4 text-sm rounded-lg",
        lg: "h-12 px-5 text-[15px] rounded-lg",
        icon: "h-9 w-9 rounded-md",
        "icon-sm": "h-8 w-8 rounded-md",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Props = React.ComponentProps<"button"> &
  VariantProps<typeof button> & { loading?: boolean };

export function Button({
  className,
  variant,
  size,
  block,
  loading,
  children,
  disabled,
  ...props
}: Props) {
  return (
    <button
      className={cn(button({ variant, size, block }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
