import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-0",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-purple-500/[0.22] via-blue-500/[0.15] to-purple-500/[0.22] hover:from-purple-500/[0.30] hover:via-blue-500/[0.22] hover:to-purple-500/[0.30] backdrop-blur-xl border border-purple-400/[0.25] hover:border-purple-400/[0.4] text-white shadow-[0_0_16px_rgba(139,92,246,0.2),0_2px_8px_rgba(0,0,0,0.2)] hover:shadow-[0_0_24px_rgba(139,92,246,0.35),0_4px_12px_rgba(0,0,0,0.25)]",
        primary:
          "bg-gradient-to-b from-blue-500/90 to-blue-600/90 hover:from-blue-400/90 hover:to-blue-500/90 backdrop-blur-xl border border-blue-400/20 text-white shadow-[0_2px_16px_rgba(59,130,246,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_4px_20px_rgba(59,130,246,0.3),inset_0_1px_0_rgba(255,255,255,0.15)]",
        destructive:
          "bg-red-500/[0.08] hover:bg-red-500/[0.15] backdrop-blur-xl border border-red-500/20 hover:border-red-500/30 text-red-300 shadow-[0_2px_12px_rgba(0,0,0,0.2)]",
        outline:
          "bg-white/[0.03] hover:bg-white/[0.07] backdrop-blur-xl border border-white/[0.1] hover:border-white/[0.18] text-zinc-300 shadow-[0_2px_8px_rgba(0,0,0,0.15)]",
        secondary:
          "bg-white/[0.05] hover:bg-white/[0.09] backdrop-blur-xl border border-white/[0.08] hover:border-white/[0.14] text-zinc-200 shadow-[0_2px_8px_rgba(0,0,0,0.15)]",
        ghost:
          "hover:bg-white/[0.06] active:bg-white/[0.10] text-zinc-400 hover:text-zinc-200",
        link: "text-blue-400 underline-offset-4 hover:underline hover:text-blue-300",
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
