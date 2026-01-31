import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 100] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

interface PaginatedGridProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  canGoNext: boolean;
  canGoPrevious: boolean;
  onPageChange: (page: number) => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onPageSizeChange: (size: number) => void;
  children: React.ReactNode;
  className?: string;
  totalItems?: number;
}

export function PaginatedGrid({
  currentPage,
  totalPages,
  pageSize,
  canGoNext,
  canGoPrevious,
  onPageChange,
  onNextPage,
  onPreviousPage,
  onPageSizeChange,
  children,
  className,
  totalItems,
}: PaginatedGridProps) {
  const { t } = useT("translation");

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    const maxVisible = 5; // Show at most 5 page numbers

    if (totalPages <= maxVisible) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage <= 3) {
        // Near start: 1 2 3 4 5 ... last
        for (let i = 2; i <= maxVisible - 1; i++) {
          pages.push(i);
        }
        pages.push("ellipsis");
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        // Near end: 1 ... last-4 last-3 last-2 last-1 last
        pages.push("ellipsis");
        for (let i = totalPages - maxVisible + 2; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // Middle: 1 ... current-1 current current+1 ... last
        pages.push("ellipsis");
        pages.push(currentPage - 1);
        pages.push(currentPage);
        pages.push(currentPage + 1);
        pages.push("ellipsis");
        pages.push(totalPages);
      }
    }

    return pages;
  };

  if (totalPages <= 1 && !totalItems) {
    return <div className={cn("space-y-6", className)}>{children}</div>;
  }

  const pageNumbers = getPageNumbers();

  // Calculate current range
  const startItem = totalItems
    ? Math.min((currentPage - 1) * pageSize + 1, totalItems)
    : null;
  const endItem = totalItems
    ? Math.min(currentPage * pageSize, totalItems)
    : null;

  return (
    <div className={cn("flex flex-col space-y-4", className)}>
      {children}

      {/* Pagination Footer */}
      {(totalItems || totalPages > 1) && (
        <div className="flex flex-col items-center justify-between gap-4 py-2 sm:flex-row">
          {/* Left: Page info */}
          <div className="flex-1 text-sm text-muted-foreground text-center sm:text-left">
            {totalItems && (
              <>
                {t("pagination.page", "Page {{page}}", { page: currentPage })}{" "}
                {t("pagination.of", "/ {{total}}", { total: totalPages })}
                <span className="mx-2">·</span>
                {startItem}-{endItem} {t("pagination.items", "items")}
              </>
            )}
          </div>

          {/* Center: Pagination controls */}
          <div className="flex-none">
            {totalPages > 1 && (
              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={onPreviousPage}
                      className={
                        !canGoPrevious
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                    >
                      <ChevronLeftIcon />
                      <span className="hidden sm:block">
                        {t("pagination.previous", "Previous")}
                      </span>
                    </PaginationPrevious>
                  </PaginationItem>

                  {pageNumbers.map((page, index) => {
                    if (page === "ellipsis") {
                      return (
                        <PaginationItem key={`ellipsis-${index}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      );
                    }

                    return (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => onPageChange(page as number)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}

                  <PaginationItem>
                    <PaginationNext
                      onClick={onNextPage}
                      className={
                        !canGoNext
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                    >
                      <span className="hidden sm:block">
                        {t("pagination.next", "Next")}
                      </span>
                      <ChevronRightIcon />
                    </PaginationNext>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>

          {/* Right: Page size selector */}
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground sm:justify-end">
            {totalPages > 1 && (
              <>
                <span>{t("pagination.rowsPerPage", "Rows per page")}</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) =>
                    onPageSizeChange(Number(value) as PageSizeOption)
                  }
                >
                  <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
