/** Resolve a path under `public/` respecting Vite's configured base URL. */
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return base.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
}
