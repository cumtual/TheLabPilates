'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  /** If provided, uses local callback instead of URL-based navigation (for client-side pagination) */
  onChange?: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onChange }: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const navigateToPage = useCallback(
    (page: number) => {
      if (onChange) {
        onChange(page);
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      if (page <= 1) {
        params.delete('page');
      } else {
        params.set('page', String(page));
      }
      const query = params.toString();
      router.push(query ? `?${query}` : '?');
    },
    [onChange, router, searchParams]
  );

  if (totalPages <= 1) return null;

  const isFirst = currentPage <= 1;
  const isLast = currentPage >= totalPages;

  return (
    <nav
      aria-label="Paginación"
      className="flex items-center justify-center gap-2 pt-6"
    >
      <button
        type="button"
        onClick={() => navigateToPage(currentPage - 1)}
        disabled={isFirst}
        aria-label="Página anterior"
        className="inline-flex items-center justify-center min-w-11 min-h-11 px-3 py-2 rounded-lg font-body text-sm font-medium transition-colors bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface-container-low"
      >
        &lt; Anterior
      </button>

      <span className="font-body text-sm text-on-surface-variant px-2">
        Página {currentPage} de {totalPages}
      </span>

      <button
        type="button"
        onClick={() => navigateToPage(currentPage + 1)}
        disabled={isLast}
        aria-label="Página siguiente"
        className="inline-flex items-center justify-center min-w-11 min-h-11 px-3 py-2 rounded-lg font-body text-sm font-medium transition-colors bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface-container-low"
      >
        Siguiente &gt;
      </button>
    </nav>
  );
}
