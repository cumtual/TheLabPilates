import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

/**
 * Property 16: Cálculo de capacidad incluye ambas tablas
 * Validates: Requirements 7.4
 *
 * For any class with N active enrollments in `class_enrolleds` and M active
 * enrollments in `guest_enrollments` (excluding status 'cancelled' and
 * 'late_cancelled'), the available capacity must be exactly `capacity - N - M`.
 */

// Mock the @/db module
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    query: {
      openClasses: {
        findFirst: vi.fn(),
      },
    },
  },
}));

import { db } from '@/db';
import { getAvailableCapacity, getTotalOccupied } from '../capacity';

// Arbitraries
const capacityArb = fc.integer({ min: 1, max: 20 });
const enrollmentCountArb = fc.integer({ min: 0, max: 20 });

describe('Property 16: Cálculo de capacidad incluye ambas tablas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper to mock DB queries for getTotalOccupied.
   * The function does two SELECT COUNT queries:
   * 1. class_enrollments (titulares activos)
   * 2. guest_enrollments (invitados activos)
   */
  function mockTotalOccupiedQueries(
    activeEnrollments: number,
    activeGuestEnrollments: number
  ) {
    const selectMock = vi.fn();
    const fromMock = vi.fn();
    const whereMock = vi.fn();

    // Each call to db.select() starts a chain: .select().from().where()
    // First call returns enrollment count, second returns guest count
    let callIndex = 0;

    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: () => ({
        where: () => {
          const result =
            callIndex === 0
              ? [{ count: activeEnrollments }]
              : [{ count: activeGuestEnrollments }];
          callIndex++;
          return Promise.resolve(result);
        },
      }),
    }));
  }

  /**
   * Helper to mock DB queries for getAvailableCapacity.
   * It does a findFirst for the class, then calls getTotalOccupied internally.
   */
  function mockAvailableCapacityQueries(
    classCapacity: number | null,
    activeEnrollments: number,
    activeGuestEnrollments: number,
    classExists: boolean = true
  ) {
    // Mock the findFirst for open class
    (
      db.query.openClasses.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue(
      classExists ? { id: 'test-class-id', capacity: classCapacity } : null
    );

    // Mock the select chain for getTotalOccupied
    mockTotalOccupiedQueries(activeEnrollments, activeGuestEnrollments);
  }

  describe('getTotalOccupied', () => {
    it.each([
      { enrollments: 0, guests: 0, expected: 0 },
      { enrollments: 5, guests: 3, expected: 8 },
      { enrollments: 10, guests: 0, expected: 10 },
      { enrollments: 0, guests: 7, expected: 7 },
    ])(
      'returns $expected when enrollments=$enrollments, guests=$guests',
      async ({ enrollments, guests, expected }) => {
        mockTotalOccupiedQueries(enrollments, guests);
        const result = await getTotalOccupied('test-class-id');
        expect(result).toBe(expected);
      }
    );

    it('property: total occupied = active enrollments + active guest enrollments', async () => {
      await fc.assert(
        fc.asyncProperty(
          enrollmentCountArb,
          enrollmentCountArb,
          async (activeEnrollments, activeGuestEnrollments) => {
            vi.clearAllMocks();
            mockTotalOccupiedQueries(activeEnrollments, activeGuestEnrollments);

            const result = await getTotalOccupied('test-class-id');
            expect(result).toBe(activeEnrollments + activeGuestEnrollments);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('getAvailableCapacity', () => {
    it('returns 0 when class does not exist', async () => {
      mockAvailableCapacityQueries(null, 0, 0, false);
      const result = await getAvailableCapacity('non-existent-class');
      expect(result).toBe(0);
    });

    it('returns 0 when class has null capacity', async () => {
      mockAvailableCapacityQueries(null, 0, 0, true);
      const result = await getAvailableCapacity('test-class-id');
      expect(result).toBe(0);
    });

    it('property: available capacity = max(0, capacity - N - M)', async () => {
      /**
       * **Validates: Requirements 7.4**
       *
       * For any combination of class capacity, active enrollments (N),
       * and active guest enrollments (M), the available capacity must be
       * exactly max(0, capacity - N - M).
       */
      await fc.assert(
        fc.asyncProperty(
          capacityArb,
          enrollmentCountArb,
          enrollmentCountArb,
          async (capacity, activeEnrollments, activeGuestEnrollments) => {
            vi.clearAllMocks();
            mockAvailableCapacityQueries(
              capacity,
              activeEnrollments,
              activeGuestEnrollments
            );

            const result = await getAvailableCapacity('test-class-id');
            const expected = Math.max(
              0,
              capacity - activeEnrollments - activeGuestEnrollments
            );
            expect(result).toBe(expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property: available capacity is never negative', async () => {
      await fc.assert(
        fc.asyncProperty(
          capacityArb,
          enrollmentCountArb,
          enrollmentCountArb,
          async (capacity, activeEnrollments, activeGuestEnrollments) => {
            vi.clearAllMocks();
            mockAvailableCapacityQueries(
              capacity,
              activeEnrollments,
              activeGuestEnrollments
            );

            const result = await getAvailableCapacity('test-class-id');
            expect(result).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property: when class is empty (N=0, M=0), capacity equals class capacity', async () => {
      await fc.assert(
        fc.asyncProperty(capacityArb, async (capacity) => {
          vi.clearAllMocks();
          mockAvailableCapacityQueries(capacity, 0, 0);

          const result = await getAvailableCapacity('test-class-id');
          expect(result).toBe(capacity);
        }),
        { numRuns: 100 }
      );
    });

    it('property: adding one enrollment decreases capacity by exactly 1 (when not at 0)', async () => {
      await fc.assert(
        fc.asyncProperty(
          capacityArb,
          // Ensure N+M < capacity so we have room
          fc.integer({ min: 0, max: 18 }),
          fc.integer({ min: 0, max: 18 }),
          async (capacity, n, m) => {
            // Only test when there's still room
            if (n + m >= capacity) return;

            vi.clearAllMocks();
            mockAvailableCapacityQueries(capacity, n, m);
            const before = await getAvailableCapacity('test-class-id');

            vi.clearAllMocks();
            mockAvailableCapacityQueries(capacity, n + 1, m);
            const after = await getAvailableCapacity('test-class-id');

            expect(before - after).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property: adding one guest enrollment decreases capacity by exactly 1 (when not at 0)', async () => {
      await fc.assert(
        fc.asyncProperty(
          capacityArb,
          fc.integer({ min: 0, max: 18 }),
          fc.integer({ min: 0, max: 18 }),
          async (capacity, n, m) => {
            // Only test when there's still room
            if (n + m >= capacity) return;

            vi.clearAllMocks();
            mockAvailableCapacityQueries(capacity, n, m);
            const before = await getAvailableCapacity('test-class-id');

            vi.clearAllMocks();
            mockAvailableCapacityQueries(capacity, n, m + 1);
            const after = await getAvailableCapacity('test-class-id');

            expect(before - after).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
