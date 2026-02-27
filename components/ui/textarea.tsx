import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-zinc-500 flex field-sizing-content min-h-16 w-full rounded-xl border border-white/[0.12] bg-white/[0.035] px-4 py-3 text-sm text-zinc-100 shadow-xs transition-all outline-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/25",
        "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
