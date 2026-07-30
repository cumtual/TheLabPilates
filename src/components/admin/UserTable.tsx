'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { changeUserRoleAction, deleteUserAction } from '@/actions/admin';
import type { UserRole } from '@/lib/types/roles';

interface UserRow {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

interface UserTableProps {
  users: UserRow[];
}

const roleLabels: Record<UserRole, string> = {
  client: 'Cliente',
  coach: 'Coach',
  admin: 'Admin',
};

const roleBadgeVariant: Record<UserRole, 'confirmed' | 'pending' | 'expired'> = {
  client: 'confirmed',
  coach: 'pending',
  admin: 'expired',
};

export function UserTable({ users }: UserTableProps) {
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<{ id: string; name: string } | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [localRoles, setLocalRoles] = useState<Record<string, UserRole>>(() => {
    const map: Record<string, UserRole> = {};
    for (const user of users) {
      map[user.id] = user.role;
    }
    return map;
  });

  function handleRoleChange(userId: string, newRole: UserRole) {
    setError(null);
    setSuccessMessage(null);
    setPendingUserId(userId);

    startTransition(async () => {
      const result = await changeUserRoleAction(userId, newRole);

      if (result.success) {
        setLocalRoles((prev) => ({ ...prev, [userId]: newRole }));
        setSuccessMessage(result.message ?? 'Rol actualizado exitosamente.');
      } else {
        setError(result.error);
      }
      setPendingUserId(null);
    });
  }

  function handleDeleteConfirm() {
    if (!confirmDeleteUser) return;
    const userId = confirmDeleteUser.id;
    setConfirmDeleteUser(null);
    setError(null);
    setSuccessMessage(null);
    setPendingUserId(userId);

    startTransition(async () => {
      const result = await deleteUserAction(userId);
      if (result.success) {
        setDeletedIds((prev) => new Set([...prev, userId]));
        setSuccessMessage(result.message ?? 'Cuenta eliminada.');
      } else {
        setError(result.error);
      }
      setPendingUserId(null);
    });
  }

  const visibleUsers = users.filter((u) => !deletedIds.has(u.id));

  if (visibleUsers.length === 0) {
    return (
      <Card>
        <p className="font-body text-sm text-outline text-center py-8">
          No hay usuarios registrados.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-error/10 border border-error/30 rounded-lg p-3">
          <p className="font-body text-sm text-error">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
          <p className="font-body text-sm text-primary">{successMessage}</p>
        </div>
      )}

      <div className="space-y-3">
        {visibleUsers.map((user) => {
          const currentRole = localRoles[user.id] ?? user.role;

          return (
            <Card key={user.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1 flex-1">
                  <p className="font-body text-sm font-semibold text-on-surface">
                    {user.username}
                  </p>
                  <p className="font-body text-xs text-outline">
                    {user.email}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={roleBadgeVariant[currentRole]}>
                      {roleLabels[currentRole]}
                    </Badge>
                    <span className="font-body text-xs text-outline">
                      Registrado: {user.createdAt}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={currentRole}
                    onChange={(e) =>
                      handleRoleChange(user.id, e.target.value as UserRole)
                    }
                    disabled={isPending && pendingUserId === user.id}
                    className="font-body text-sm text-on-surface bg-surface-container border border-outline/30 rounded-lg px-3 py-2 min-h-11 min-w-11 focus:outline-2 focus:outline-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Cambiar rol de ${user.username}`}
                  >
                    <option value="client">Cliente</option>
                    <option value="coach">Coach</option>
                    <option value="admin">Admin</option>
                  </select>

                  <Link
                    href={`/admin/users/${user.id}`}
                    className="inline-flex items-center justify-center px-4 py-2 font-body text-sm font-medium text-primary border border-primary/30 rounded-lg transition-all duration-200 ease-out hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary min-h-11 min-w-11"
                  >
                    Historial
                  </Link>

                  <button
                    type="button"
                    onClick={() => setConfirmDeleteUser({ id: user.id, name: user.username })}
                    disabled={isPending && pendingUserId === user.id}
                    className="inline-flex items-center justify-center px-3 py-2 font-body text-sm font-medium text-error border border-error/30 rounded-lg transition-all duration-200 ease-out hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error disabled:opacity-50 disabled:cursor-not-allowed min-h-11 min-w-11"
                    aria-label={`Eliminar cuenta de ${user.username}`}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={confirmDeleteUser !== null}
        onClose={() => setConfirmDeleteUser(null)}
        onConfirm={handleDeleteConfirm}
        title="Eliminar cuenta"
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        variant="danger"
      >
        <p>¿Estás seguro de que deseas eliminar la cuenta de <strong>{confirmDeleteUser?.name}</strong>?</p>
        <p className="mt-2 text-sm text-on-surface-variant">
          Esta acción no se puede deshacer. El usuario no podrá acceder al sistema.
        </p>
      </Modal>
    </div>
  );
}
