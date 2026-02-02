export type DocumentViewerMode = "preview" | "source";

export type DocumentViewerKind =
  | "htmlPreview"
  | "docPreview"
  | "markdownPreview"
  | "text"
  | "sourceUnsupported"
  | "unsupported";

interface ResolveDocumentViewerKindParams {
  mode: DocumentViewerMode;
  extension: string;
  hasDocType: boolean;
  textLanguage?: string;
}

export function resolveDocumentViewerKind({
  mode,
  extension,
  hasDocType,
  textLanguage,
}: ResolveDocumentViewerKindParams): DocumentViewerKind {
  const normalizedExtension = extension.toLowerCase();

  if (normalizedExtension === "html" || normalizedExtension === "htm") {
    return mode === "preview" ? "htmlPreview" : "text";
  }

  if (hasDocType) {
    return mode === "preview" ? "docPreview" : "sourceUnsupported";
  }

  if (textLanguage === "markdown") {
    return mode === "preview" ? "markdownPreview" : "text";
  }

  if (textLanguage) {
    return "text";
  }

  return "unsupported";
}

