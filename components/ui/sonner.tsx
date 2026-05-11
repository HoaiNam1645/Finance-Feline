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

const Toaster = ({ position = "bottom-center", ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast rounded-xl border border-border/80 bg-popover text-popover-foreground px-3 py-3 text-sm data-[type=success]:border-emerald-300 data-[type=error]:border-rose-300 data-[type=warning]:border-amber-300 data-[type=info]:border-sky-300",
          title: "text-sm font-semibold",
          description: "text-xs text-muted-foreground mt-0.5",
          actionButton:
            "rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90",
          cancelButton:
            "rounded-md border border-border bg-transparent px-3 py-1 text-xs font-medium text-foreground",
          icon:
            "size-8 rounded-full border border-border/70 bg-muted/40 p-1.5 text-foreground data-[type=success]:border-emerald-300 data-[type=success]:text-emerald-600 data-[type=error]:border-rose-300 data-[type=error]:text-rose-600 data-[type=warning]:border-amber-300 data-[type=warning]:text-amber-600 data-[type=info]:border-sky-300 data-[type=info]:text-sky-600",
          closeButton:
            "rounded-md border border-border bg-background text-muted-foreground hover:text-foreground",
        },
      }}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "calc(var(--radius) + 2px)",
        } as React.CSSProperties
      }
      position={position}
      {...props}
    />
  )
}

export { Toaster }
