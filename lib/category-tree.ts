/** Roots of the structured category trees; anything outside them is legacy. */
export const STRUCTURED_ROOT_CODES = ["FELINE", "SUPPLIER"];

/** Legacy categories stay readable on old records but are no longer offered for new ones. */
export function isStructuredCategory(category: { rootCode?: string | null }) {
  return Boolean(category.rootCode && STRUCTURED_ROOT_CODES.includes(category.rootCode));
}

export type CategoryTreeInput = {
  id: string;
  name: string;
  note?: string | null;
  rootCode?: string | null;
  type: "INCOME" | "EXPENSE";
  parentId?: string | null;
};

export type CategoryTreeNode<T extends CategoryTreeInput> = {
  category: T;
  children: Array<CategoryTreeNode<T>>;
  /** Only leaves carry money, so a node with children is a header, not a choice. */
  selectable: boolean;
};

/**
 * Builds the category tree for a picker: every branch that leads to at least one
 * selectable leaf of the wanted type is kept, ancestors included even when their own
 * type differs (a root like "Feline" holds both Thu and Chi below it).
 */
export function buildCategoryTree<T extends CategoryTreeInput>(
  categories: T[],
  type: "INCOME" | "EXPENSE"
): Array<CategoryTreeNode<T>> {
  const childrenByParentId = new Map<string, T[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    childrenByParentId.set(category.parentId, [...(childrenByParentId.get(category.parentId) ?? []), category]);
  }

  const build = (category: T): CategoryTreeNode<T> | null => {
    const rawChildren = childrenByParentId.get(category.id) ?? [];
    const children = rawChildren
      .toSorted((a, b) => a.name.localeCompare(b.name, "vi"))
      .map(build)
      .filter((node): node is CategoryTreeNode<T> => node !== null);
    const selectable = rawChildren.length === 0 && category.type === type;
    if (!selectable && !children.length) return null;
    return { category, children, selectable };
  };

  return categories
    .filter((category) => !category.parentId)
    .toSorted((a, b) => a.name.localeCompare(b.name, "vi"))
    .map(build)
    .filter((node): node is CategoryTreeNode<T> => node !== null);
}

export function collectSelectableCategories<T extends CategoryTreeInput>(nodes: Array<CategoryTreeNode<T>>): T[] {
  const result: T[] = [];
  const walk = (list: Array<CategoryTreeNode<T>>) => {
    for (const node of list) {
      if (node.selectable) result.push(node.category);
      walk(node.children);
    }
  };
  walk(nodes);
  return result;
}
