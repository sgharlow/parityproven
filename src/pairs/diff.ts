/** Minimal line diff (LCS). Renders changed lines only, with @@ markers where unchanged text was skipped. */
export function lineDiff(from: string, to: string, fromLabel = "engineOutput", toLabel = "final"): string {
  const a = from.replace(/\r\n/g, "\n").split("\n");
  const b = to.replace(/\r\n/g, "\n").split("\n");
  const n = a.length, m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const out: string[] = [];
  let i = 0, j = 0, skipped = false;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { i++; j++; skipped = true; continue; }
    if (skipped) { out.push(`@@ engineOutput line ${i + 1} / final line ${j + 1} @@`); skipped = false; }
    if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) out.push(`+${b[j++]}`);
    else out.push(`-${a[i++]}`);
  }
  if (out.length === 0) return `--- ${fromLabel}\n+++ ${toLabel}\n(no changes: engine output accepted as final)`;
  return [`--- ${fromLabel}`, `+++ ${toLabel}`, ...out].join("\n");
}
