"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Shows the "what belongs in here" note a category carries, on hover and on tap. */
export function CategoryNoteHint({ note }: { note?: string | null }) {
  if (!note?.trim()) return null;

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 items-center text-muted-foreground transition hover:text-foreground"
            aria-label={`Ghi chú: ${note}`}
            onClick={(event) => event.stopPropagation()}
          >
            <Info className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px]">{note}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
