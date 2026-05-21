/**
 * Secret-masking utilities.
 *
 * The action redacts input values whose names match a configurable set of
 * regex patterns. This catches the common mistake of passing a token or
 * password as a workflow input and prevents it from being printed in the
 * job summary.
 *
 * The runner's own `::add-mask::` mechanism is independent and is honored
 * by GitHub when it renders summaries — this layer is an extra belt to go
 * with the runner's braces.
 */

/**
 * Default regex pattern that matches input keys commonly associated with
 * secret-like values. Case-insensitive.
 */
export const DEFAULT_MASK_PATTERN = "(?i)(secret|token|password|api[_-]?key)";

/**
 * The placeholder used in place of a redacted value.
 */
export const MASK_PLACEHOLDER = "***";

/**
 * Parses a comma-separated list of regex patterns into an array of `RegExp`
 * objects.
 *
 * Patterns may begin with `(?i)` to enable case-insensitive matching, mirroring
 * the syntax found in many other regex flavors. Whitespace around each pattern
 * is trimmed and empty entries are ignored. Invalid patterns throw with a
 * descriptive message identifying the offending entry.
 */
export function parseMaskPatterns(input: string | undefined): RegExp[] {
  if (!input) return [];
  return input
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => compilePattern(p));
}

function compilePattern(pattern: string): RegExp {
  // Support a leading `(?i)` flag prefix as a portable way to express
  // case-insensitive matching across regex flavors.
  let flags = "";
  let body = pattern;
  const flagMatch = body.match(/^\(\?([imsux]+)\)/);
  if (flagMatch && flagMatch[1] !== undefined) {
    flags = flagMatch[1]
      .split("")
      .filter((f) => "imsu".includes(f))
      .join("");
    body = body.slice(flagMatch[0].length);
  }
  try {
    return new RegExp(body, flags);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid mask pattern "${pattern}": ${message}`);
  }
}

/**
 * Returns true if any of the supplied patterns matches the given key.
 */
export function shouldMask(key: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((p) => p.test(key));
}

/**
 * Redacts a value if its key matches any of the supplied patterns.
 */
export function maskValue(key: string, value: string, patterns: readonly RegExp[]): string {
  return shouldMask(key, patterns) ? MASK_PLACEHOLDER : value;
}
