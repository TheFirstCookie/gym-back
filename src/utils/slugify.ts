const MAX_SLUG_LENGTH = 160;

/** "Pro Bench 2.0 (Black)" -> "pro-bench-2-0-black". Matches the database's slug check. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, "");
}
