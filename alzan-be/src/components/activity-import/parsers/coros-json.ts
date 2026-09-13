/** Preserve COROS signed 64-bit identifiers before JavaScript rounds them. */
export function parseCorosJson(content: string): unknown {
  // Validate the original grammar before quoting numbers (e.g. leading zeroes).
  JSON.parse(content);
  // Match entire strings as well as numbers: digits inside strings must never change.
  const normalized = content.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token => {
    if (/^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token))) return JSON.stringify(token);
    return token;
  });
  return JSON.parse(normalized) as unknown;
}
