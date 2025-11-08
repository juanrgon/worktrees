export const SUGGESTION_LIMIT_DEFAULT = 200 as const;
export const SUGGESTION_LIMIT_MAX = 1000 as const;

export function normalizeSuggestionLimit(limit?: number) {
  if (limit === undefined || !Number.isFinite(limit)) {
    return SUGGESTION_LIMIT_DEFAULT;
  }

  const rounded = Math.floor(limit);
  if (rounded <= 0) {
    return SUGGESTION_LIMIT_MAX;
  }

  return Math.min(rounded, SUGGESTION_LIMIT_MAX);
}
