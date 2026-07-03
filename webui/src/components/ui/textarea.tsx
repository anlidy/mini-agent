import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          "flex min-h-16 w-full rounded-lg border border-line/40 bg-surface px-3 py-2 text-sm transition-colors duration-fast ease-expo outline-none",
          "placeholder:text-ink-muted",
          "hover:border-line-hover/50",
          "focus-visible:border-accent/50 focus-visible:ring-2 focus-visible:ring-ring/30",
          "disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-muted",
          "aria-invalid:border-error aria-invalid:ring-2 aria-invalid:ring-error/20",
          className
        )}
        {...props}
      />
    );
  }
);

export { Textarea }
