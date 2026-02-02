import { describe, expect, it } from "vitest";
import { stripDiffHeaderLines } from "./diff-utils";

describe("stripDiffHeaderLines", () => {
  it("strips the standard generated header for added-file diffs", () => {
    const diff = [
      "diff --git a/foo.txt b/foo.txt",
      "--- /dev/null",
      "+++ b/foo.txt",
      "@@ -0,0 +1,2 @@",
      "+line1",
      "+line2",
    ].join("\n");

    expect(stripDiffHeaderLines(diff)).toEqual(["+line1", "+line2"]);
  });

  it("strips common git file headers and keeps hunk content", () => {
    const diff = [
      "diff --git a/foo.txt b/foo.txt",
      "index 123..456 100644",
      "--- a/foo.txt",
      "+++ b/foo.txt",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+line1",
    ].join("\n");

    expect(stripDiffHeaderLines(diff)).toEqual(["-old", "+line1"]);
  });
});
