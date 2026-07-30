'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

type RoleFilter = 'all' | 'client' | 'coach' | 'admin';

interface UserRoleFilterProps {
  currentRole: string;
  counts: { all: number; client: number; coach: number; admin: number };
}

const filterLabels: Record<RoleFilter, string> = {
  all: 'Todos',
  client: 'Clientes',
  coach: 'Coaches',
  admin: 'Admins',
};

export function UserRoleFilter({ currentRole, counts }: UserRoleFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleFilter(role: RoleFilter) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (role === 'all') {
        params.delete('role');
      } else {
        params.set('role', role);
      }
      params.delete('page'); // Reset to page 1
      const query = params.toString();
      router.push(query ? `?${query}` : '/admin/users');
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(filterLabels) as RoleFilter[]).map((key) => (
        <button
          key={key}
          type="button"
          disabled={isPending}
          onClick={() => handleFilter(key)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-11 rounded-lg font-body text-sm font-medium transition-colors disabled:opacity-70 ${
            currentRole === key || (key === 'all' && !currentRole)
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
          }`}
        >
          {filterLabels[key]}
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            currentRole === key || (key === 'all' && !currentRole)
              ? 'bg-on-primary/20 text-on-primary'
              : 'bg-outline-variant/30 text-outline'
          }`}>
            {counts[key]}
          </span>
        </button>
      ))}
    </div>
  );
}
