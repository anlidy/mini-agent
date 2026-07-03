"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverPortal({ ...props }: PopoverPrimitive.Portal.Props) {
  return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />
}

function PopoverClose({ ...props }: PopoverPrimitive.Close.Props) {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />
}

function PopoverBackdrop({
  className,
  ...props
}: PopoverPrimitive.Backdrop.Props) {
  return (
    <PopoverPrimitive.Backdrop
      data-slot="popover-backdrop"
      className={cn("fixed inset-0 z-40", className)}
      {...props}
    />
  )
}

function PopoverContent({
  className,
  align = "start",
  side = "bottom",
  sideOffset = 4,
  children,
  ...props
}: PopoverPrimitive.Popup.Props & {
  align?: "start" | "center" | "end"
  side?: "top" | "bottom" | "left" | "right"
  sideOffset?: number
}) {
  return (
    <PopoverPortal>
      <PopoverBackdrop />
      <PopoverPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 min-w-[160px] rounded-xl bg-surface p-1.5 text-sm text-ink shadow-lg ring-1 ring-line/25 outline-none",
            "origin-[var(--transform-origin)]",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPortal>
  )
}

function PopoverItem({
  className,
  children,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      data-slot="popover-item"
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] leading-relaxed transition-colors duration-fast",
        "text-ink-secondary hover:bg-muted hover:text-ink",
        "focus-visible:bg-muted focus-visible:text-ink focus-visible:outline-none",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverItem,
  PopoverClose,
  PopoverPortal,
}
