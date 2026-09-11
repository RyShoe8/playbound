/**
 * HoloCure Discord Rich Presence — keep draft in Mongo; seed must not resurrect.
 * Field-scoped writes go through insert-catalog-wave PATCH_MOD_FIELDS.
 */
export const HOLOCURE_RICH_PRESENCE_SLUG = "holocure-rich-presence" as const;

export const holocureRichPresencePatchSource = {
  status: "draft" as const,
  published: false,
};
