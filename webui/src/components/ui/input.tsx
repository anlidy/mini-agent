import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<typeof InputPrimitive>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-line/30 bg-surface px-2.5 py-1 text-sm transition-colors duration-fast ease-expo outline-none",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink",
        "placeholder:text-ink-muted",
        "hover:border-line-hover/50",
        "focus-visible:border-accent/50 focus-visible:ring-2 focus-visible:ring-ring/30",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-muted",
        "aria-invalid:border-error aria-invalid:ring-2 aria-invalid:ring-error/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
