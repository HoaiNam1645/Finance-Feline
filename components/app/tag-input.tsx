"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX_TAG_LENGTH = 50;

type TagInputProps = {
  tags: string[];
  onTagsChange: (nextTags: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  maxTags?: number;
};

export function TagInput({
  tags,
  onTagsChange,
  disabled = false,
  placeholder = "Nhập tag rồi bấm +",
  maxTags = 20,
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const reachedLimit = tags.length >= maxTags;

  function addTag() {
    const tag = draft.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
    if (!tag || reachedLimit) return;
    if (tags.some((item) => item.toLowerCase() === tag.toLowerCase())) {
      setDraft("");
      return;
    }
    onTagsChange([...tags, tag]);
    setDraft("");
  }

  function removeAt(index: number) {
    onTagsChange(tags.filter((_, tagIndex) => tagIndex !== index));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            addTag();
          }}
          disabled={disabled || reachedLimit}
          placeholder={reachedLimit ? `Tối đa ${maxTags} tag` : placeholder}
          maxLength={MAX_TAG_LENGTH}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="shrink-0"
          disabled={disabled || reachedLimit || !draft.trim()}
          onClick={addTag}
          aria-label="Thêm tag"
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag, index) => (
            <Badge key={`${tag}-${index}`} variant="outline" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeAt(index)}
                aria-label={`Xóa tag ${tag}`}
                className="rounded-sm p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Không bắt buộc. Nhập tag rồi bấm + hoặc Enter để thêm.</p>
      )}
    </div>
  );
}
