import { Layers, ChevronLeft, ChevronRight, Download } from "lucide-react";
import {
  PanelHeader,
  PanelHeaderAction,
} from "@/components/shared/panel-header";
import type { FileNode } from "@/features/chat/types";
import { apiClient, API_ENDPOINTS } from "@/lib/api-client";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/client";

interface ArtifactsHeaderProps {
  title?: string;
  selectedFile?: FileNode;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  sessionId?: string;
}

/**
 * Header component for artifacts panel
 * Used across all view modes (artifacts list, document preview, empty state)
 */
export function ArtifactsHeader({
  title,
  selectedFile,
  isSidebarCollapsed = false,
  onToggleSidebar,
  sessionId,
}: ArtifactsHeaderProps) {
  const { t } = useT("translation");
  const headerTitle =
    title || selectedFile?.name || t("chat.artifacts.previewTitle");

  const handleDownload = async () => {
    if (!sessionId) return;
    try {
      const response = await apiClient.get<{
        url?: string | null;
        filename?: string | null;
      }>(API_ENDPOINTS.sessionWorkspaceArchive(sessionId));

      if (response.url) {
        // Trigger download
        const filename = response.filename || `workspace-${sessionId}.zip`;
        const link = document.createElement("a");
        link.href = response.url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(t("chat.artifacts.toasts.downloadStarted"));
      } else {
        toast.error(t("chat.artifacts.toasts.archiveUnavailable"));
      }
    } catch (error) {
      console.error("[Artifacts] Failed to download workspace archive", error);
      toast.error(t("chat.artifacts.toasts.downloadFailed"));
    }
  };

  return (
    <PanelHeader
      icon={Layers}
      title={headerTitle}
      description={t("chat.artifacts.description")}
      className="border-b"
      action={
        <div className="flex items-center gap-1">
          {sessionId && (
            <PanelHeaderAction
              onClick={handleDownload}
              aria-label={t("chat.artifacts.actions.downloadArchive")}
            >
              <Download className="size-4" />
            </PanelHeaderAction>
          )}
          {onToggleSidebar && (
            <PanelHeaderAction
              onClick={onToggleSidebar}
              aria-label={
                isSidebarCollapsed
                  ? t("chat.artifacts.actions.expandSidebar")
                  : t("chat.artifacts.actions.collapseSidebar")
              }
            >
              {isSidebarCollapsed ? (
                <ChevronLeft className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </PanelHeaderAction>
          )}
        </div>
      }
    />
  );
}
