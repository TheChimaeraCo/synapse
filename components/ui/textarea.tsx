import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-zinc-600 flex field-sizing-content min-h-16 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-zinc-200 shadow-xs transition-all outline-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus:border-blue-500/30 focus:ring-1 focus:ring-blue-500/20",
        "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
