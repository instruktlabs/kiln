/** Text rules for kiln_save and kiln_assets results. */

/**
 * Longest build warning a save result returns whole. The longest realistic FLUSH_FACES line
 * (three named pairs with 24-character part names and the budget note) is 659 characters, and
 * the 550-character "Floating parts" line fits with room to spare.
 */
export const SAVE_WARNING_LIMIT = 700;

/**
 * A warning within the limit whole; a longer one cut after its last whole word that fits, with
 * the count of characters left out and where the full line lives. Never cuts silently or inside
 * a word.
 */
export function cutWarning(line: string, limit: number = SAVE_WARNING_LIMIT): string {
  if (line.length <= limit) return line;
  let end = limit;
  if (!/\s/.test(line[end] ?? ' ')) {
    // The cut falls inside a word: back up to the whitespace before it.
    while (end > 0 && !/\s/.test(line[end - 1]!)) end--;
  }
  const kept = line.slice(0, end).trimEnd();
  const notice = `(${line.length - kept.length} more characters; the saved manifest has the full line)`;
  return kept ? `${kept} … ${notice}` : `… ${notice}`;
}
