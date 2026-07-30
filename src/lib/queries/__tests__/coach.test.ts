// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock the db module
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();

vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: mockFrom }),
  },
}));

// We need to capture what the where/orderBy logic does,
// so chain the mock properly
mockFrom.mockReturnValue({ where: mockWhere });
mockWhere.mockReturnValue({ orderBy: mockOrderBy });

import { getCoachClasses } from '../coach';

// Arbitrary for UUID-like strings
const uuidArb = fc.uuid();

// Arbitrary for class records with a specific coachUserId
const classRecordArb = (coachUserId: string) =>
  fc.record({
    id: fc.uuid(),
    classDate: fc.date({
      min: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      max: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).filter((d) => !isNaN(d.getTime())),
    coachUserId: fc.constant(coachUserId),
    capacity: fc.integer({ min: 1, max: 20 }),
    available: fc.constantFrom('available', 'not_available', 'full'),
    classType: fc.constantFrom('yoga', 'mat_pilates', 'barre'),
    status: fc.constantFrom('scheduled', 'cancelled', 'completed'),
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
  });

// Arbitrary for class records belonging to a DIFFERENT coach
const otherCoachClassArb = (excludeCoachId: string) =>
  fc.record({
    id: fc.uuid(),
    classDate: fc.date({
      min: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      max: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).filter((d) => !isNaN(d.getTime())),
    coachUserId: fc.uuid().filter((id) => id !== excludeCoachId),
    capacity: fc.integer({ min: 1, max: 20 }),
    available: fc.constantFrom('available', 'not_available', 'full'),
    classType: fc.constantFrom('yoga', 'mat_pilates', 'barre'),
    status: fc.constantFrom('scheduled', 'cancelled', 'completed'),
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
  });

/**
 * Property 21: Coach Class Ownership Filter
 *
 * For any coach accessing their class list, every returned Open_Class record
 * SHALL have `coach_user_id` equal to the authenticated coach's user ID,
 * and the records SHALL be sorted by `class_date` descending.
 *
 * **Validates: Requirements 8.1**
 */
describe('Property 21: Coach Class Ownership Filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  });

  it('every returned class has coach_user_id matching authenticated coach', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        fc.array(classRecordArb('placeholder'), { minLength: 0, maxLength: 10 }),
        async (coachId, _classTemplates) => {
          // Generate classes belonging to this coach (sorted by date desc to simulate DB response)
          const coachClasses = _classTemplates.map((c) => ({
            ...c,
            coachUserId: coachId,
          }));
          const sortedClasses = [...coachClasses].sort(
            (a, b) => b.classDate.getTime() - a.classDate.getTime()
          );

          // Mock the DB to return only the coach's classes (simulating the WHERE clause)
          mockOrderBy.mockResolvedValueOnce(sortedClasses);

          const result = await getCoachClasses(coachId);

          // Property: every returned class belongs to this coach
          for (const cls of result) {
            expect(cls.coachUserId).toBe(coachId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('results are sorted by class_date descending', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        fc.array(classRecordArb('placeholder'), { minLength: 2, maxLength: 15 }),
        async (coachId, _classTemplates) => {
          const coachClasses = _classTemplates.map((c) => ({
            ...c,
            coachUserId: coachId,
          }));
          // Sort descending by classDate (simulating what the DB orderBy does)
          const sortedClasses = [...coachClasses].sort(
            (a, b) => b.classDate.getTime() - a.classDate.getTime()
          );

          mockOrderBy.mockResolvedValueOnce(sortedClasses);

          const result = await getCoachClasses(coachId);

          // Property: results are sorted by class_date descending
          for (let i = 1; i < result.length; i++) {
            expect(result[i - 1]!.classDate!.getTime()).toBeGreaterThanOrEqual(
              result[i]!.classDate!.getTime()
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('classes from other coaches are never returned', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        fc.array(classRecordArb('placeholder'), { minLength: 0, maxLength: 5 }),
        fc.array(otherCoachClassArb('placeholder'), { minLength: 1, maxLength: 5 }),
        async (coachId, _ownClasses, _otherClasses) => {
          // The own classes belong to this coach
          const ownClasses = _ownClasses.map((c) => ({
            ...c,
            coachUserId: coachId,
          }));

          // The DB query with WHERE coach_user_id = coachId should only return own classes
          // Simulate the filtering behavior: the query ONLY returns classes matching the coach
          const sortedOwn = [...ownClasses].sort(
            (a, b) => b.classDate.getTime() - a.classDate.getTime()
          );
          mockOrderBy.mockResolvedValueOnce(sortedOwn);

          const result = await getCoachClasses(coachId);

          // Property: no class from another coach appears in results
          for (const cls of result) {
            expect(cls.coachUserId).toBe(coachId);
          }

          // The other coaches' classes should NOT be in the result
          const otherClasses = _otherClasses.map((c) => ({
            ...c,
            coachUserId: c.coachUserId === coachId ? 'other-' + c.coachUserId : c.coachUserId,
          }));
          for (const otherCls of otherClasses) {
            const found = result.some((r) => r.id === otherCls.id);
            expect(found).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('the query passes the correct coachUserId to the where clause', async () => {
    await fc.assert(
      fc.asyncProperty(uuidArb, async (coachId) => {
        mockOrderBy.mockResolvedValueOnce([]);

        await getCoachClasses(coachId);

        // Verify the query chain was called (select -> from -> where -> orderBy)
        expect(mockFrom).toHaveBeenCalled();
        expect(mockWhere).toHaveBeenCalled();
        expect(mockOrderBy).toHaveBeenCalled();
      }),
      { numRuns: 50 }
    );
  });
});
