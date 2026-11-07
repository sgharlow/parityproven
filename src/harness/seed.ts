/** Seed management for reproducible fast-check runs. */

/**
 * Parses --seed <n> from process.argv.
 * Returns the seed as a number, or undefined if not supplied.
 */
export function parseSeedArg(): number | undefined {
  const args = process.argv;
  const idx = args.indexOf("--seed");
  if (idx === -1) return undefined;
  const val = args[idx + 1];
  if (!val || isNaN(Number(val))) return undefined;
  return Number(val);
}

/** Generates a random seed if none was supplied. */
export function resolveSeed(supplied?: number): number {
  return supplied ?? Math.floor(Math.random() * 2 ** 31);
}
