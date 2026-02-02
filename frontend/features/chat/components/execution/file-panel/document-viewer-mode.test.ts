import { describe, expect, it } from "vitest";
import { resolveDocumentViewerKind } from "./document-viewer-mode";

describe("resolveDocumentViewerKind", () => {
  it("uses html preview in preview mode", () => {
    expect(
      resolveDocumentViewerKind({
        mode: "preview",
        extension: "html",
        hasDocType: false,
        textLanguage: "markup",
      }),
    ).toBe("htmlPreview");
  });

  it("uses text viewer for html in source mode", () => {
    expect(
      resolveDocumentViewerKind({
        mode: "source",
        extension: "html",
        hasDocType: false,
        textLanguage: "markup",
      }),
    ).toBe("text");
  });

  it("renders doc types only in preview mode", () => {
    expect(
      resolveDocumentViewerKind({
        mode: "preview",
        extension: "pdf",
        hasDocType: true,
        textLanguage: undefined,
      }),
    ).toBe("docPreview");

    expect(
      resolveDocumentViewerKind({
        mode: "source",
        extension: "pdf",
        hasDocType: true,
        textLanguage: undefined,
      }),
    ).toBe("sourceUnsupported");
  });

  it("renders markdown as preview in preview mode but as text in source mode", () => {
    expect(
      resolveDocumentViewerKind({
        mode: "preview",
        extension: "md",
        hasDocType: false,
        textLanguage: "markdown",
      }),
    ).toBe("markdownPreview");

    expect(
      resolveDocumentViewerKind({
        mode: "source",
        extension: "md",
        hasDocType: false,
        textLanguage: "markdown",
      }),
    ).toBe("text");
  });
});

