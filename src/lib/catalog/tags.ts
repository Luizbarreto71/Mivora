/** Cache tags for public storefront data. Admin mutations expire them with updateTag(). */
export const TAGS = {
  catalog: "catalog",
  settings: "settings",
  content: "content",
} as const;
