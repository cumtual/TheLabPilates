import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { classEnrollments, guestEnrollments, userSubscriptions, users } from '@/db/schema';
import { isCancelledEnrollmentStatus } from '@/lib/enrollment/cancellation';
import { formatAuditDateTime } from '@/lib/utils/date';
import type { UserRole } from '@/lib/types/roles';

/**
 * Auditoría temporal de inscripciones — EXCLUSIVA de admin
 * (SPEC-CANCELLATION-AUDIT-AND-TERMS §3.5).
 *
 * Solo se importa desde rutas /admin/** (guardado por audit-import-boundary.test.ts).
 * Defensa en profundidad: además del redirect de la página, cada consulta exige
 * `viewer.role === 'admin'` ANTES de tocar la BD.
 */

export class AdminAuditForbiddenError extends Error {
  constructor() {
    super('Solo administradores pueden consultar la auditoría de inscripciones.');
    this.name = 'AdminAuditForbiddenError';
  }
}

export type AuditViewer = { role: UserRole } | null | undefined;

export function assertAdminViewer(viewer: AuditViewer): asserts viewer is { role: 'admin' } {
  if (viewer?.role !== 'admin') throw new AdminAuditForbiddenError();
}

type EnrollmentStatus = (typeof classEnrollments.$inferSelect)['status'];

export type AuditLabels = {
  /** Fecha y hora de reserva (`created_at`), `DD/MM/YYYY, hh:mm A` CDMX. */
  bookedAt: string;
  /** Fecha y hora de cancelación; `null` si la inscripción no está cancelada. */
  cancelledAt: string | null;
};

/**
 * Serializador único de los timestamps de auditoría. `cancelledAt` solo se
 * expone para `cancelled`/`late_cancelled`, aunque la BD traiga un valor.
 */
export function toAuditLabels(
  status: EnrollmentStatus,
  createdAt: Date | string | null,
  cancelledAt: Date | string | null
): AuditLabels {
  return {
    bookedAt: formatAuditDateTime(createdAt),
    cancelledAt: isCancelledEnrollmentStatus(status) ? formatAuditDateTime(cancelledAt) : null,
  };
}

export type AdminEnrollmentAuditRow = AuditLabels & {
  kind: 'titular' | 'guest';
  enrollmentId: string;
  name: string;
  /** Email del titular o «Invitado de {nombre}». */
  detail: string;
  status: EnrollmentStatus;
};

/** Titulares e invitados de una clase con sus timestamps de reserva/cancelación. */
export async function getClassEnrollmentAudit(
  classId: string,
  viewer: AuditViewer
): Promise<AdminEnrollmentAuditRow[]> {
  assertAdminViewer(viewer);

  const titulares = await db
    .select({
      enrollmentId: classEnrollments.id,
      status: classEnrollments.status,
      createdAt: classEnrollments.createdAt,
      cancelledAt: classEnrollments.cancelledAt,
      name: users.username,
      email: users.email,
    })
    .from(classEnrollments)
    .innerJoin(userSubscriptions, eq(classEnrollments.userSubscriptionId, userSubscriptions.id))
    .innerJoin(users, eq(userSubscriptions.userId, users.id))
    .where(eq(classEnrollments.openClassId, classId))
    .orderBy(asc(classEnrollments.createdAt));

  const guests = await db
    .select({
      enrollmentId: guestEnrollments.id,
      status: guestEnrollments.status,
      createdAt: guestEnrollments.createdAt,
      cancelledAt: guestEnrollments.cancelledAt,
      name: guestEnrollments.guestName,
      registeredByName: users.username,
    })
    .from(guestEnrollments)
    .innerJoin(users, eq(guestEnrollments.registeredById, users.id))
    .where(eq(guestEnrollments.openClassId, classId))
    .orderBy(asc(guestEnrollments.createdAt));

  return [
    ...titulares.map((row) => ({
      kind: 'titular' as const,
      enrollmentId: row.enrollmentId,
      name: row.name ?? row.email,
      detail: row.email,
      status: row.status,
      ...toAuditLabels(row.status, row.createdAt, row.cancelledAt),
    })),
    ...guests.map((row) => ({
      kind: 'guest' as const,
      enrollmentId: row.enrollmentId,
      name: row.name,
      detail: `Invitado de ${row.registeredByName ?? 'usuario'}`,
      status: row.status,
      ...toAuditLabels(row.status, row.createdAt, row.cancelledAt),
    })),
  ];
}
