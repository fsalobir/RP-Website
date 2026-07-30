export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim();
}

export function matchesSearchText(query: string, values: readonly string[]): boolean {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack = normalizeSearchText(values.join(" "));
  return tokens.every((token) => haystack.includes(token));
}
