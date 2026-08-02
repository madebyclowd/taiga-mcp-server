/** Shared by both transports' env-var config loaders: `"true"`/`"1"`
 * (case-insensitive) are truthy, anything else (including unset) is
 * false — no transport currently needs a boolean env var to default to
 * true, so "unset means false" is the only case to get right. */
export function parseBooleanEnv(value: string | undefined): boolean {
  if (value === undefined) return false;
  return value.toLowerCase() === "true" || value === "1";
}
