import type { CheckinCandidate, CheckinRepository } from '@/lib/checkin/checkin-repository';
import type { CheckinTransactionRunner } from '@/lib/checkin/process-checkin';

/**
 * Repositorio en memoria con estado mutable para probar el servicio de
 * check-in sin BD: reuso de tokens, carreras y conteo de transacciones.
 */

export interface FakeEnrollment extends CheckinCandidate {
  checkinToken: string | null;
  checkedInAt: Date | null;
}

export const COACH_ID = 'coach-owner-id';
export const OTHER_COACH_ID = 'coach-other-id';
export const ADMIN_ID = 'admin-id';
export const VALID_TOKEN = 'a'.repeat(64);
/** Clase de hoy 09:00 CDMX (el "hoy" de los tests es 2026-09-22 CDMX). */
export const CLASS_DATE = new Date('2026-09-22T09:00:00.000-06:00');

export function buildEnrollment(overrides: Partial<FakeEnrollment> = {}): FakeEnrollment {
  return {
    enrollmentId: 'enrollment-1',
    status: 'pending',
    classDate: CLASS_DATE,
    classStatus: 'scheduled',
    coachUserId: COACH_ID,
    classType: 'mat_pilates',
    customName: null,
    studentName: 'Ana',
    checkinToken: VALID_TOKEN,
    checkedInAt: null,
    ...overrides,
  };
}

export function createFakeCheckinStore(rows: FakeEnrollment[]) {
  const enrollments = rows.map((row) => ({ ...row }));
  let transactionCount = 0;

  const repository: CheckinRepository = {
    async findByTokenForUpdate(token) {
      const row = enrollments.find((e) => e.checkinToken === token);
      if (!row) return null;
      return {
        enrollmentId: row.enrollmentId,
        status: row.status,
        classDate: row.classDate,
        classStatus: row.classStatus,
        coachUserId: row.coachUserId,
        classType: row.classType,
        customName: row.customName,
        studentName: row.studentName,
      };
    },
    async markAttended(enrollmentId, token) {
      const row = enrollments.find(
        (e) => e.enrollmentId === enrollmentId && e.status === 'pending' && e.checkinToken === token
      );
      if (!row) return null;
      row.status = 'attended';
      row.checkinToken = null;
      row.checkedInAt = new Date();
      return row.checkedInAt;
    },
  };

  const runInTransaction: CheckinTransactionRunner = (work) => {
    transactionCount += 1;
    return work(repository);
  };

  return {
    enrollments,
    repository,
    runInTransaction,
    transactionCount: () => transactionCount,
  };
}
