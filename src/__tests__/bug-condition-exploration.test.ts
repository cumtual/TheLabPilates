// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeDate } from '@/lib/utils/date';

/**
 * Bug Condition Exploration Test
 *
 * **Property 1: Bug Condition** - formatRelativeDate Calendar Day Mismatch,
 * Missing Auto-Completion & Coupled Coach Actions
 *
 * This test encodes the EXPECTED (correct) behavior. It is expected to FAIL
 * on unfixed code, confirming that the bugs exist.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */

// ============================================================
// Bug 2: formatRelativeDate Calendar Day Mismatch
// ============================================================
describe('Bug 2: formatRelativeDate Calendar Day Mismatch (America/Mexico_City)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "Hoy" for same calendar day in America/Mexico_City (2025-01-15T06:32:00Z at server time 2025-01-15T19:00:00Z)', () => {
    // In America/Mexico_City (UTC-6):
    //   2025-01-15T06:32:00Z = Jan 15 00:32 (same day)
    //   2025-01-15T19:00:00Z = Jan 15 13:00 (same day)
    // Both are on January 15 in Mexico City → should return "Hoy"
    // But Math.round(diffMs / 86400000) = Math.round((-12.47h) / 24h) = Math.round(-0.52) = -1 → "Ayer"

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T19:00:00Z'));

    const classDate = new Date('2025-01-15T06:32:00Z');
    const result = formatRelativeDate(classDate);

    // Expected: "Hoy" (same calendar day in America/Mexico_City)
    // Actual (buggy): "Ayer" (Math.round rounds -0.52 to -1)
    expect(result).toBe('Hoy');
  });

  it('should return "Ayer" for previous calendar day in America/Mexico_City (2025-01-15T05:30:00Z at server time 2025-01-15T14:00:00Z)', () => {
    // In America/Mexico_City (UTC-6):
    //   2025-01-15T05:30:00Z = Jan 14 23:30 (previous day!)
    //   2025-01-15T14:00:00Z = Jan 15 08:00 (current day)
    // Class is on January 14, current is January 15 → should return "Ayer"
    // But Math.round(diffMs / 86400000) = Math.round((-8.5h) / 24h) = Math.round(-0.35) = 0 → "Hoy"

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T14:00:00Z'));

    const classDate = new Date('2025-01-15T05:30:00Z');
    const result = formatRelativeDate(classDate);

    // Expected: "Ayer" (previous calendar day in America/Mexico_City)
    // Actual (buggy): "Hoy" (Math.round rounds -0.35 to 0)
    expect(result).toBe('Ayer');
  });
});

// ============================================================
// Bug 1: Missing Auto-Completion Mechanism
// ============================================================
describe('Bug 1: Missing Auto-Completion Mechanism', () => {
  it('autoCompletePassedClasses function should exist and be importable', async () => {
    // The function autoCompletePassedClasses should exist at
    // src/lib/queries/class-auto-completion.ts
    // This test will FAIL because the function doesn't exist yet,
    // proving Bug 1: no auto-completion mechanism exists.

    let autoCompletePassedClasses: (() => Promise<number>) | undefined;

    try {
      const module = await import('@/lib/queries/class-auto-completion');
      autoCompletePassedClasses = module.autoCompletePassedClasses;
    } catch {
      // Module doesn't exist - this is the bug
    }

    // Assert the function exists (will fail on unfixed code)
    expect(autoCompletePassedClasses).toBeDefined();
    expect(typeof autoCompletePassedClasses).toBe('function');
  });

  it('autoCompletePassedClasses should transition past scheduled classes to completed', async () => {
    // If the function existed, calling it should complete classes
    // with classDate + 1h in the past and status 'scheduled'.
    // This test fails because the function doesn't exist.

    let autoCompletePassedClasses: (() => Promise<number>) | undefined;

    try {
      const module = await import('@/lib/queries/class-auto-completion');
      autoCompletePassedClasses = module.autoCompletePassedClasses;
    } catch {
      // Module doesn't exist - this is the bug
    }

    // Assert function exists and can be called
    expect(autoCompletePassedClasses).toBeDefined();

    if (autoCompletePassedClasses) {
      const count = await autoCompletePassedClasses();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============================================================
// Bug 3: Coupled Coach Actions (updateAttendanceAction changes class status)
// ============================================================

// Mock modules for Bug 3 tests
vi.mock('@/db', () => {
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

  // Mock select for autoCompletePassedClasses (returns chainable .from().where())
  const mockSelectWhere = vi.fn().mockResolvedValue([]);
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

  return {
    db: {
      query: {
        openClasses: { findFirst: vi.fn() },
      },
      update: mockUpdate,
      select: mockSelect,
    },
  };
});

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  }),
}));

describe('Bug 3: updateAttendanceAction Should NOT Change Class Status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateAttendanceAction should only update enrollment records without modifying class status', async () => {
    const { updateAttendanceAction } = await import('@/actions/coach');
    const { db } = await import('@/db');
    const { getSession } = await import('@/lib/auth/session');

    // Mock authenticated coach session
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      sub: 'coach-uuid-123',
      role: 'coach',
      email: 'coach@test.com',
    });

    // Mock the class lookup — class exists, belongs to coach, date in past
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1); // yesterday
    (db.query.openClasses.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'class-id-123',
      coachUserId: 'coach-uuid-123',
      classDate: pastDate,
      status: 'scheduled',
      capacity: 10,
    });

    // Track all db.update calls to see what gets modified
    const updateCalls: Array<{ table: unknown; setArgs: unknown }> = [];
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockImplementation((args: unknown) => {
      updateCalls.push({ table: (db.update as ReturnType<typeof vi.fn>).mock.calls[updateCalls.length]?.[0], setArgs: args });
      return { where: mockWhere };
    });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const result = await updateAttendanceAction('class-id-123', [
      { enrollmentId: 'enrollment-1', status: 'attended' },
    ]);

    expect(result.success).toBe(true);

    // The critical assertion: updateAttendanceAction should NOT set status to 'completed'
    // on the openClasses table. It should ONLY update enrollment records.
    // Bug 3: Current implementation always marks class as 'completed' (proves coupling)
    const statusUpdates = updateCalls.filter(
      (call) => call.setArgs && typeof call.setArgs === 'object' && 'status' in (call.setArgs as Record<string, unknown>) && (call.setArgs as Record<string, string>).status === 'completed'
    );

    // Expected: No status updates to 'completed' (attendance action shouldn't complete class)
    // Actual (buggy): One call sets { status: 'completed' }
    expect(statusUpdates.length).toBe(0);
  });
});
