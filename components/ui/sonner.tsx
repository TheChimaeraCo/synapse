"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: "!bg-white/[0.07] !backdrop-blur-3xl !border-white/[0.12] !rounded-xl !shadow-[0_16px_64px_rgba(0,0,0,0.4)] !text-zinc-200",
          title: "!text-zinc-100 !font-medium",
          description: "!text-zinc-400",
          actionButton: "!bg-gradient-to-r !from-blue-500 !to-blue-600 !text-white !rounded-lg",
          cancelButton: "!bg-white/[0.06] !text-zinc-300 !rounded-lg",
        },
      }}
      style={
        {
          "--normal-bg": "rgba(255, 255, 255, 0.07)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "rgba(255, 255, 255, 0.12)",
          "--border-radius": "0.75rem",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
