const HEADER_PREFIXES = [
  "diff --git ",
  "diff --cc ",
  "index ",
] as const;

export function stripDiffHeaderLines(diff: string): string[] {
  const normalized = diff.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  if (lines.length >= 4) {
    const [first, second, third, fourth] = lines;
    const looksLikeGeneratedAddedFileHeader =
      (first ?? "").startsWith("diff --git ") &&
      (second ?? "") === "--- /dev/null" &&
      (third ?? "").startsWith("+++ b/") &&
      (fourth ?? "").startsWith("@@ -0,0 +1,");

    if (looksLikeGeneratedAddedFileHeader) {
      return lines.slice(4);
    }
  }

  const stripped = lines.filter((line) => {
    if (line.startsWith("@@")) return false;
    if (line.startsWith("--- ")) return false;
    if (line.startsWith("+++ ")) return false;
    return !HEADER_PREFIXES.some((prefix) => line.startsWith(prefix));
  });

  if (stripped.length === 0) return lines;
  return stripped;
}
