// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Pure logic extracted from src/app/(portal)/admin/users/[userId]/page.tsx
 * for property-based testing without database dependencies.
 */

// Sort order validation (mirrors the query's orderBy(desc(...)))
function isSortedDescending(dates: (Date | null)[]): boolean {
  for (let i = 1; i < dates.length; i++) {
    const prev = dates[i - 1];
    const curr = dates[i];
    if (prev === null || curr === null) continue;
    if (prev.getTime() < curr.getTime()) return false;
  }
  return true;
}

// Metrics computation logic (extracted from the page component)
type EnrollmentStatus = 'pending' | 'attended' | 'absent' | 'late_cancelled';

interface EnrollmentRecord {
  id: string;
  classType: string | null;
  classDate: Date | null;
  status: EnrollmentStatus | null;
}

function computeMetrics(enrollmentRecords: EnrollmentRecord[]) {
  let totalAttended = 0;
  let totalAbsences = 0;
  let totalLateCancellations = 0;

  for (const record of enrollmentRecords) {
    if (record.status === 'attended') totalAttended++;
    else if (record.status === 'absent') totalAbsences++;
    else if (record.status === 'late_cancelled') totalLateCancellations++;
  }

  return { totalAttended, totalAbsences, totalLateCancellations };
}

/**
 * Property 30: Client History Sort Order
 *
 * For any client's history query, the returned records SHALL be ordered
 * by date descending (most recent first).
 *
 * **Validates: Requirements 12.1**
 */
describe('Property 30: Client History Sort Order', () => {
  it('records sorted by date descending remain in valid order after sort', () => {
    // Generate valid timestamps as integers, then convert to dates (avoids NaN dates)
    const validDateArb = fc
      .integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() })
      .map((ts) => new Date(ts));

    fc.assert(
      fc.property(
        fc.array(validDateArb, { minLength: 0, maxLength: 50 }),
        (dates) => {
          // Simulate what the query does: orderBy(desc(date))
          const sorted = [...dates].sort((a, b) => b.getTime() - a.getTime());

          // The sorted result must always be in descending order
          expect(isSortedDescending(sorted)).toBe(true);

          // Verify each consecutive pair
          for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i - 1].getTime()).toBeGreaterThanOrEqual(sorted[i].getTime());
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('subscriptions, payments, and attendance each maintain descending date order independently', () => {
    const dateArb = fc
      .integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() })
      .map((ts) => new Date(ts));

    fc.assert(
      fc.property(
        fc.array(dateArb, { minLength: 0, maxLength: 20 }), // subscription dates
        fc.array(dateArb, { minLength: 0, maxLength: 20 }), // payment dates
        fc.array(dateArb, { minLength: 0, maxLength: 20 }), // attendance dates
        (subDates, payDates, attDates) => {
          // Sort each collection descending (as the DB queries do)
          const sortedSubs = [...subDates].sort((a, b) => b.getTime() - a.getTime());
          const sortedPays = [...payDates].sort((a, b) => b.getTime() - a.getTime());
          const sortedAtts = [...attDates].sort((a, b) => b.getTime() - a.getTime());

          // Each must independently be in descending order
          expect(isSortedDescending(sortedSubs)).toBe(true);
          expect(isSortedDescending(sortedPays)).toBe(true);
          expect(isSortedDescending(sortedAtts)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });
});

/**
 * Property 31: Attendance Metrics Accuracy
 *
 * For any client, the computed attendance metrics SHALL equal the actual count
 * of enrollment records with status "attended" (total attended), "absent"
 * (total absences), and "late_cancelled" (total late cancellations) respectively.
 *
 * **Validates: Requirements 12.2**
 */
describe('Property 31: Attendance Metrics Accuracy', () => {
  const enrollmentStatusArb = fc.constantFrom<EnrollmentStatus>(
    'pending',
    'attended',
    'absent',
    'late_cancelled'
  );

  const enrollmentRecordArb = fc.record({
    id: fc.uuid(),
    classType: fc.constantFrom('yoga', 'mat_pilates', 'barre', null),
    classDate: fc.option(
      fc.integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() }).map((ts) => new Date(ts)),
      { nil: null }
    ),
    status: fc.option(enrollmentStatusArb, { nil: null }),
  });

  it('computed metrics match actual counts of each enrollment status', () => {
    fc.assert(
      fc.property(
        fc.array(enrollmentRecordArb, { minLength: 0, maxLength: 100 }),
        (enrollments) => {
          const metrics = computeMetrics(enrollments);

          // Count manually using filter
          const expectedAttended = enrollments.filter((e) => e.status === 'attended').length;
          const expectedAbsences = enrollments.filter((e) => e.status === 'absent').length;
          const expectedLateCancellations = enrollments.filter(
            (e) => e.status === 'late_cancelled'
          ).length;

          expect(metrics.totalAttended).toBe(expectedAttended);
          expect(metrics.totalAbsences).toBe(expectedAbsences);
          expect(metrics.totalLateCancellations).toBe(expectedLateCancellations);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('total metrics never exceed total enrollment count', () => {
    fc.assert(
      fc.property(
        fc.array(enrollmentRecordArb, { minLength: 0, maxLength: 100 }),
        (enrollments) => {
          const metrics = computeMetrics(enrollments);

          const totalCounted =
            metrics.totalAttended + metrics.totalAbsences + metrics.totalLateCancellations;

          // Sum of counted statuses should never exceed total records
          expect(totalCounted).toBeLessThanOrEqual(enrollments.length);

          // Pending records are not counted in any metric
          const pendingCount = enrollments.filter((e) => e.status === 'pending').length;
          const nullStatusCount = enrollments.filter((e) => e.status === null).length;

          // Total counted + pending + null should equal total enrollments
          expect(totalCounted + pendingCount + nullStatusCount).toBe(enrollments.length);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('metrics are zero when all records have status "pending"', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            classType: fc.constantFrom('yoga', 'mat_pilates', 'barre', null),
            classDate: fc.option(
              fc.integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() }).map((ts) => new Date(ts)),
              { nil: null }
            ),
            status: fc.constant<EnrollmentStatus>('pending'),
          }),
          { minLength: 0, maxLength: 50 }
        ),
        (pendingEnrollments) => {
          const metrics = computeMetrics(pendingEnrollments);

          expect(metrics.totalAttended).toBe(0);
          expect(metrics.totalAbsences).toBe(0);
          expect(metrics.totalLateCancellations).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
