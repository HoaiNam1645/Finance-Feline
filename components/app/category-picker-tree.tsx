"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryNoteHint } from "@/components/app/category-note-hint";
import type { CategoryTreeInput, CategoryTreeNode } from "@/lib/category-tree";

type CategoryPickerTreeProps<T extends CategoryTreeInput> = {
  nodes: Array<CategoryTreeNode<T>>;
  selectedId: string;
  onSelect: (categoryId: string) => void;
  emptyLabel?: string;
};

export function CategoryPickerTree<T extends CategoryTreeInput>({
  nodes,
  selectedId,
  onSelect,
  emptyLabel = "Không có danh mục phù hợp.",
}: CategoryPickerTreeProps<T>) {
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);

  if (!nodes.length) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const renderNodes = (list: Array<CategoryTreeNode<T>>, depth: number) => (
    <ul className={depth === 0 ? "divide-y rounded-md border" : "space-y-0.5"}>
      {list.map((node) => {
        const collapsed = collapsedIds.includes(node.category.id);
        const hasChildren = node.children.length > 0;
        return (
          <li
            key={node.category.id}
            className={depth === 0 ? "py-1" : ""}
            // Anchors for the onboarding walkthrough: first group, first sub-group, first leaf.
            data-tour={
              hasChildren
                ? depth === 0
                  ? "category-group"
                  : "category-subgroup"
                : node.selectable && depth >= 2
                  ? "category-leaf"
                  : undefined
            }
          >
            <div className="flex items-center gap-1 px-2" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
              {hasChildren ? (
                <>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    aria-label={collapsed ? `Mở ${node.category.name}` : `Đóng ${node.category.name}`}
                    onClick={() =>
                      setCollapsedIds((prev) =>
                        prev.includes(node.category.id)
                          ? prev.filter((id) => id !== node.category.id)
                          : [...prev, node.category.id]
                      )
                    }
                  >
                    <ChevronRight className={`size-4 transition-transform ${collapsed ? "" : "rotate-90"}`} />
                  </Button>
                  <p
                    className={`flex flex-1 items-center gap-1.5 px-1 py-1.5 text-left text-sm ${
                      depth === 0 ? "font-semibold" : "font-medium"
                    }`}
                  >
                    {node.category.name}
                    <CategoryNoteHint note={node.category.note} />
                  </p>
                </>
              ) : (
                <>
                  <span className="inline-block size-7 shrink-0" />
                  {/* The hint is its own button, so it has to sit beside the choice, not inside it. */}
                  <button
                    type="button"
                    className={`flex-1 rounded px-2 py-1.5 text-left text-sm transition ${
                      node.category.id === selectedId ? "font-semibold text-primary" : "hover:bg-muted"
                    }`}
                    onClick={() => onSelect(node.category.id)}
                  >
                    {node.category.name}
                  </button>
                  <CategoryNoteHint note={node.category.note} />
                </>
              )}
            </div>
            {hasChildren && !collapsed ? <div className="mt-0.5">{renderNodes(node.children, depth + 1)}</div> : null}
          </li>
        );
      })}
    </ul>
  );

  return renderNodes(nodes, 0);
}
