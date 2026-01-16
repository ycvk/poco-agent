"use client";

import * as React from "react";
import type {
  SearchResultTask,
  SearchResultProject,
  SearchResultMessage,
} from "@/features/search/types";
import { chatService } from "@/features/chat/services/chat-service";

/**
 * Hook for fetching and aggregating search data
 * Currently uses mock data - will be replaced with API calls later
 */
export function useSearchData() {
  const [tasks, setTasks] = React.useState<SearchResultTask[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  // Fetch data from API
  const fetchData = React.useCallback(async () => {
    try {
      setIsLoading(true);

      const sessions = await chatService.listSessions({ limit: 20 });

      const realTasks: SearchResultTask[] = sessions.map((session) => ({
        id: session.session_id,
        title: session.session_id.slice(0, 8), // Use partial ID as title for now
        status: session.status,
        timestamp: session.updated_at,
        type: "task",
      }));

      setTasks(realTasks);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch search data:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial data fetch
  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const projects = React.useMemo<SearchResultProject[]>(() => [], []);
  const messages = React.useMemo<SearchResultMessage[]>(() => [], []);

  return {
    tasks,
    projects,
    messages,
    isLoading,
    error,
    refetch: fetchData,
  };
}
