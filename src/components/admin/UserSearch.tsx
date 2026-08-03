'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

interface UserSearchProps {
  initialQuery: string;
}

export function UserSearch({ initialQuery }: UserSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query.trim()) {
        params.set('q', query.trim());
        params.delete('page'); // Reset to page 1 on new search
      } else {
        params.delete('q');
        params.delete('page');
      }
      const queryString = params.toString();
      router.push(queryString ? `?${queryString}` : '/admin/users');
    });
  }

  function handleClear() {
    setQuery('');
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('q');
      params.delete('page');
      const queryString = params.toString();
      router.push(queryString ? `?${queryString}` : '/admin/users');
    });
  }

  return (
    <form onSubmit={handleSearch} className="flex gap-2">
      <div className="relative flex-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[20px] text-outline pointer-events-none">
          search
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o correo..."
          className="w-full pl-10 pr-4 py-3 min-h-11 font-body text-sm text-on-surface bg-surface border border-outline-variant rounded-lg placeholder:text-outline/60 transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center px-4 min-h-11 min-w-11 font-body text-sm font-semibold bg-soft-charcoal text-on-primary rounded-lg transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {isPending ? '...' : 'Buscar'}
      </button>
      {initialQuery && (
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center justify-center px-3 min-h-11 min-w-11 font-body text-sm text-on-surface-variant bg-surface-container-low border border-outline-variant rounded-lg transition-colors hover:bg-surface-container-high"
        >
          Limpiar
        </button>
      )}
    </form>
  );
}
