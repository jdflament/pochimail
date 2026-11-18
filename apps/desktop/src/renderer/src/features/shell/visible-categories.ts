import { CATEGORIES, type Category } from "@pochimail/core/domain/category";

/** D5: a category with no email for the current selection is not shown; it appears as soon as it has mail. */
export const visibleCategories = (
  counts: Readonly<Partial<Record<Category, number>>> | undefined,
) =>
  CATEGORIES.flatMap((id) => {
    const count = counts?.[id] ?? 0;
    return count > 0 ? [{ id, count }] : [];
  });
