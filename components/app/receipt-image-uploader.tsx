"use client";

import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";

type ReceiptImageUploaderProps = {
  files: File[];
  onFilesChange: (nextFiles: File[]) => void;
  disabled?: boolean;
  chooseButtonLabel?: string;
  hint?: string;
};

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function ReceiptImageUploader({
  files,
  onFilesChange,
  disabled = false,
  chooseButtonLabel = "Chọn ảnh",
  hint = "Bạn có thể kéo thả hoặc dán ảnh (Ctrl+V) vào vùng này.",
}: ReceiptImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const previews = useMemo(
    () =>
      files.map((file) => ({
        key: fileKey(file),
        file,
        url: URL.createObjectURL(file),
      })),
    [files]
  );

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  function appendFiles(nextFiles: File[]) {
    if (!nextFiles.length) return;
    const imageFiles = nextFiles.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;

    const existingKeys = new Set(files.map((file) => fileKey(file)));
    const merged = [...files];
    for (const file of imageFiles) {
      const key = fileKey(file);
      if (existingKeys.has(key)) continue;
      merged.push(file);
      existingKeys.add(key);
    }
    onFilesChange(merged);
  }

  function removeAt(index: number) {
    onFilesChange(files.filter((_, fileIndex) => fileIndex !== index));
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          appendFiles(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {chooseButtonLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || files.length === 0}
          onClick={() => onFilesChange([])}
        >
          Xóa tất cả
        </Button>
        <p className="text-xs text-muted-foreground">Đã chọn: {files.length} ảnh</p>
      </div>
      <div
        tabIndex={0}
        onPaste={(event) => {
          if (disabled) return;
          const pasted = Array.from(event.clipboardData.items)
            .filter((item) => item.kind === "file")
            .map((item) => item.getAsFile())
            .filter((item): item is File => Boolean(item));
          appendFiles(pasted);
        }}
        className="rounded-md border border-dashed p-3 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {hint}
      </div>
      {previews.length > 0 ? (
        <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
          {previews.map((preview, index) => (
            <div key={preview.key} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.file.name}
                className="size-16 rounded-md border object-cover"
              />
              <Button
                type="button"
                size="xs"
                variant="destructive"
                className="absolute -right-2 -top-2 h-5 px-1.5 text-[10px]"
                disabled={disabled}
                onClick={() => removeAt(index)}
              >
                X
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
