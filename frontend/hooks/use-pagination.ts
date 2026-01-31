import { useMemo, useState, useCallback } from "react";

interface PaginationOptions {
  pageSize?: number;
  initialPage?: number;
}

interface PaginationResult<T> {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  paginatedData: T[];
  canGoNext: boolean;
  canGoPrevious: boolean;
  nextPage: () => void;
  previousPage: () => void;
  goToPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

export function usePagination<T>(
  data: T[],
  options: PaginationOptions = {},
): PaginationResult<T> {
  const { pageSize: initialPageSize = 12, initialPage = 1 } = options;
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(data.length / pageSize)),
    [data.length, pageSize],
  );

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return data.slice(startIndex, endIndex);
  }, [data, currentPage, pageSize]);

  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const nextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  const previousPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  }, []);

  const goToPage = useCallback(
    (page: number) => {
      const clampedPage = Math.max(1, Math.min(page, totalPages));
      setCurrentPage(clampedPage);
    },
    [totalPages],
  );

  // Reset to page 1 when data changes significantly
  const maxValidPage = Math.max(1, Math.ceil(data.length / pageSize));
  if (currentPage > maxValidPage) {
    setCurrentPage(maxValidPage);
  }

  return {
    currentPage,
    pageSize,
    totalPages,
    paginatedData,
    canGoNext,
    canGoPrevious,
    nextPage,
    previousPage,
    goToPage,
    setPageSize,
  };
}
