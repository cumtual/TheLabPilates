import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { formatAuditDateTime, AUDIT_DATE_FALLBACK } from '@/lib/utils/date';

/**
 * Formato de auditoría (SPEC-CANCELLATION-AUDIT-AND-TERMS §4.1):
 * `DD/MM/YYYY, hh:mm A`, siempre en America/Mexico_City.
 */
describe('formatAuditDateTime', () => {
  it('convierte a CDMX aunque en UTC ya sea el día siguiente', () => {
    expect(formatAuditDateTime(new Date('2026-09-25T01:05:00Z'))).toBe('24/09/2026, 07:05 PM');
  });

  it('medianoche CDMX → 12:00 AM', () => {
    expect(formatAuditDateTime('2026-09-24T06:00:00Z')).toBe('24/09/2026, 12:00 AM');
  });

  it('mediodía CDMX → 12:00 PM', () => {
    expect(formatAuditDateTime('2026-09-24T18:00:00.000Z')).toBe('24/09/2026, 12:00 PM');
  });

  it('acepta strings ISO con offset', () => {
    expect(formatAuditDateTime('2026-01-05T09:03:00-06:00')).toBe('05/01/2026, 09:03 AM');
  });

  it.each([null, undefined, '', 'no-es-fecha', new Date('invalid')])(
    '%s → "Sin registro"',
    (value) => {
      expect(formatAuditDateTime(value as never)).toBe(AUDIT_DATE_FALLBACK);
      expect(AUDIT_DATE_FALLBACK).toBe('Sin registro');
    }
  );

  it('propiedad: la salida siempre cumple DD/MM/YYYY, hh:mm AM|PM', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2035-12-31T23:59:59Z'), noInvalidDate: true }),
        (date) => {
          expect(formatAuditDateTime(date)).toMatch(/^\d{2}\/\d{2}\/\d{4}, (0[1-9]|1[0-2]):[0-5]\d (AM|PM)$/);
        }
      ),
      { numRuns: 200 }
    );
  });
});
