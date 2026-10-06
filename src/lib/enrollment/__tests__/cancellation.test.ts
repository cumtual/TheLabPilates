// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import {
  CANCELLED_ENROLLMENT_STATUSES,
  buildEnrollmentCancellationPatch,
  buildGuestCancellationPatch,
  isCancelledEnrollmentStatus,
} from '@/lib/enrollment/cancellation';

const dialect = new PgDialect();
const toSql = (value: unknown) => dialect.sqlToQuery(value as SQL).sql;

describe('buildEnrollmentCancellationPatch', () => {
  it.each(CANCELLED_ENROLLMENT_STATUSES)('fija status=%s y cancelledAt = now() de la BD', (status) => {
    const patch = buildEnrollmentCancellationPatch(status);
    expect(patch.status).toBe(status);
    expect(toSql(patch.cancelledAt)).toBe('now()');
  });

  it('invalida el token de check-in (una inscripción cancelada no conserva un QR válido)', () => {
    expect(buildEnrollmentCancellationPatch('cancelled').checkinToken).toBeNull();
  });

  it('solo acepta estados cancelados', () => {
    // @ts-expect-error — 'attended' no es un estado de cancelación
    buildEnrollmentCancellationPatch('attended');
  });
});

describe('buildGuestCancellationPatch', () => {
  it('fija status y cancelledAt = now(), sin columnas de check-in', () => {
    const patch = buildGuestCancellationPatch('late_cancelled');
    expect(patch).toEqual({ status: 'late_cancelled', cancelledAt: expect.anything() });
    expect(toSql(patch.cancelledAt)).toBe('now()');
  });
});

describe('isCancelledEnrollmentStatus', () => {
  it('reconoce solo cancelled y late_cancelled', () => {
    expect(isCancelledEnrollmentStatus('cancelled')).toBe(true);
    expect(isCancelledEnrollmentStatus('late_cancelled')).toBe(true);
    for (const s of ['pending', 'attended', 'absent', null, undefined]) {
      expect(isCancelledEnrollmentStatus(s)).toBe(false);
    }
  });
});
