import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold cursor-pointer transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35 focus-visible:ring-offset-0",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-cyan-500/90 to-emerald-500/85 hover:from-cyan-400/90 hover:to-emerald-400/90 border border-cyan-300/30 text-white shadow-[0_10px_24px_rgba(6,182,212,0.28)] hover:shadow-[0_14px_30px_rgba(6,182,212,0.35)]",
        primary:
          "bg-gradient-to-r from-sky-500/95 to-cyan-500/95 hover:from-sky-400/95 hover:to-cyan-400/95 border border-sky-300/30 text-white shadow-[0_10px_24px_rgba(14,165,233,0.28)]",
        destructive:
          "bg-red-500/[0.12] hover:bg-red-500/[0.2] backdrop-blur-xl border border-red-400/35 hover:border-red-400/45 text-red-100 shadow-[0_8px_20px_rgba(127,29,29,0.35)]",
        outline:
          "bg-white/[0.03] hover:bg-white/[0.08] backdrop-blur-xl border border-white/[0.14] hover:border-cyan-300/35 text-zinc-200 shadow-[0_8px_16px_rgba(0,0,0,0.18)]",
        secondary:
          "bg-slate-900/50 hover:bg-slate-800/60 backdrop-blur-xl border border-white/[0.1] hover:border-white/[0.18] text-zinc-100 shadow-[0_8px_18px_rgba(0,0,0,0.2)]",
        ghost:
          "hover:bg-white/[0.08] active:bg-white/[0.12] text-zinc-400 hover:text-zinc-100",
        link: "text-cyan-300 underline-offset-4 hover:underline hover:text-cyan-200",
      },
      size: {
        default: "h-9 px-5 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-lg px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 rounded-lg gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-xl px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
