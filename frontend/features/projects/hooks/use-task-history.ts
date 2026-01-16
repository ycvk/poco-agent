import { useState, useCallback, useEffect } from "react";
import { tasksService } from "@/features/projects/services/projects-service";
import type { TaskHistoryItem } from "@/features/projects/types";

interface UseTaskHistoryOptions {
  initialTasks?: TaskHistoryItem[];
  enableStorage?: boolean;
}

export function useTaskHistory(options: UseTaskHistoryOptions = {}) {
  const { initialTasks = [], enableStorage = true } = options;
  const [taskHistory, setTaskHistory] =
    useState<TaskHistoryItem[]>(initialTasks);
  const [isLoading, setIsLoading] = useState(!initialTasks.length);

  const STORAGE_KEY = "opencowork_task_history";

  const fetchTasks = useCallback(async () => {
    if (!enableStorage) {
      setIsLoading(false);
      return;
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setTaskHistory(JSON.parse(saved));
      } else {
        const data = await tasksService.listHistory();
        setTaskHistory(data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } catch (error) {
      console.error("Failed to fetch task history", error);
    } finally {
      setIsLoading(false);
    }
  }, [enableStorage]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const updateTasks = useCallback(
    (setter: (prev: TaskHistoryItem[]) => TaskHistoryItem[]) => {
      setTaskHistory((prev) => {
        const next = setter(prev);
        if (enableStorage) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        }
        return next;
      });
    },
    [enableStorage],
  );

  const addTask = useCallback(
    (
      title: string,
      options?: {
        timestamp?: string;
        status?: TaskHistoryItem["status"];
        projectId?: string;
        id?: string;
      },
    ) => {
      const newTask: TaskHistoryItem = {
        id: options?.id || `task-${Date.now()}`,
        title,
        timestamp: options?.timestamp || new Date().toISOString(),
        status: options?.status || "pending",
        projectId: options?.projectId,
      };
      updateTasks((prev) => [newTask, ...prev]);
      return newTask;
    },
    [updateTasks],
  );

  const removeTask = useCallback(
    (taskId: string) => {
      updateTasks((prev) => prev.filter((task) => task.id !== taskId));
    },
    [updateTasks],
  );

  const moveTask = useCallback(
    (taskId: string, projectId: string | null) => {
      updateTasks((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? { ...task, projectId: projectId ?? undefined }
            : task,
        ),
      );
    },
    [updateTasks],
  );

  return {
    taskHistory,
    isLoading,
    addTask,
    removeTask,
    moveTask,
  };
}
