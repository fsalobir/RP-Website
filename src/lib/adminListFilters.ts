export function normalizeAdminSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchesAdminListFilters(
  itemStatus: string,
  statusFilter: string,
  haystack: string,
  tokens: string[]
): boolean {
  return (statusFilter === "all" || itemStatus === statusFilter)
    && tokens.every((token) => haystack.includes(token));
}
