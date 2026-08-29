/** Keep internal fixture labels out of user-facing profile surfaces. */
export function publicDisplayName(value: string | null | undefined, fallback = "CORE Member") {
  const name = value?.trim();
  if (!name || name.toLocaleLowerCase() === "billing sandbox") return fallback;
  return name;
}
