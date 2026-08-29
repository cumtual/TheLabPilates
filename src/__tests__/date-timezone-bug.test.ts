/**
 * Bug Condition Exploration Test - Timezone-Normalized Rendering
 *
 * Property 1: For any valid date input formatted in a browser whose timezone
 * is NOT America/Mexico_City, the formatting functions SHALL produce output
 * reflecting the date and time as they would appear in America/Mexico_City.
 *
 * These tests run with TZ=America/New_York to simulate a user in a different
 * timezone. They assert Mexico City timezone output, which should FAIL on
 * unfixed code (proving the bug exists).
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
 */
import { describe, it, expect, beforeAll, vi, afterAll } from 'vitest';
import * as fc from 'fast-check';
import {
  formatFriendlyDate,
  formatShortDate,
  formatShortDateTime,
  formatRelativeDate,
} from '@/lib/utils/date';

// Set timezone to New York to trigger the bug condition
beforeAll(() => {
  process.env.TZ = 'America/New_York';
});

afterAll(() => {
  delete process.env.TZ;
});

describe('Bug Condition: Timezone-Normalized Rendering (Property 1)', () => {
  /**
   * Test formatFriendlyDate() with a date at 23:30 Mexico City time.
   * Mexico City is UTC-6 year-round (no DST since 2022).
   * New York in July (EDT) is UTC-4.
   * So 23:30 CST (UTC-6) = 2025-07-29T05:30:00Z = 01:30 EDT July 29.
   * The output should show Mexico City's day (July 28) and "23:30".
   */
  it('formatFriendlyDate shows Mexico City time, not Eastern time', () => {
    // 2025-07-28 23:30 Mexico City (CST, UTC-6)
    const dateInMexCity = '2025-07-28T23:30:00-06:00';

    const result = formatFriendlyDate(dateInMexCity);

    // Should show "11:30 P.M." (Mexico City time in 12h format),
    // not "01:30" (Eastern time next day)
    expect(result).toContain('11:30 P.M.');
    // Should show Monday (lunes) July 28, not Tuesday July 29
    expect(result.toLowerCase()).toContain('lunes');
  });

  /**
   * Test formatShortDate() with a date near midnight crossing.
   * 2025-07-28 23:30 Mexico City (CST, UTC-6) = 2025-07-29 01:30 EDT
   * Calendar day in Mexico City: July 28. In New York: July 29.
   */
  it('formatShortDate shows Mexico City calendar day at midnight boundary', () => {
    const dateInMexCity = '2025-07-28T23:30:00-06:00';

    const result = formatShortDate(dateInMexCity);

    // Should show 28/07/2025 (Mexico City date), not 29/07/2025 (Eastern date)
    expect(result).toBe('28/07/2025');
  });

  /**
   * Test formatShortDateTime() — assert Mexico City time appears.
   * A class at 09:00 Mexico City (CST, UTC-6) = 11:00 Eastern (EDT, UTC-4).
   */
  it('formatShortDateTime shows Mexico City time, not Eastern time', () => {
    // 09:00 Mexico City on July 28, 2025 (UTC-6)
    const dateInMexCity = '2025-07-28T09:00:00-06:00';

    const result = formatShortDateTime(dateInMexCity);

    // Should contain "09:00 A.M." (Mexico City), not "11:00" (Eastern).
    // Time is rendered in 12h format with explicit meridiem.
    expect(result).toContain('09:00 A.M.');
    expect(result).toBe('28/07/2025 — 09:00 A.M.');
  });

  /**
   * Test formatRelativeDate() at day boundary.
   * Mock "now" to be 2025-07-29 01:00 EDT (= 2025-07-28 23:00 Mexico City).
   * Target: 2025-07-29 10:00 Mexico City.
   * In Mexico City calendar: now=July 28, target=July 29 → "Mañana".
   * But using Eastern calendar: now=July 29, target=July 29 → "Hoy" (wrong!).
   */
  it('formatRelativeDate computes relative days in Mexico City timezone', () => {
    // "now" = 2025-07-29 01:00 EDT = 2025-07-28 23:00 Mexico City
    vi.setSystemTime(new Date('2025-07-29T01:00:00-04:00'));

    // Target: 2025-07-29 10:00 Mexico City (CST, UTC-6)
    const target = '2025-07-29T10:00:00-06:00';

    const result = formatRelativeDate(target);

    // In Mexico City: now is July 28, target is July 29 → "Mañana"
    expect(result).toBe('Mañana');

    vi.useRealTimers();
  });

  /**
   * Property-based test: for any valid date, formatShortDateTime output
   * should reflect Mexico City time, not Eastern time.
   * We generate dates with explicit UTC-6 offset and verify the hour matches.
   */
  it('formatShortDateTime always shows Mexico City hour (property-based)', () => {
    fc.assert(
      fc.property(
        // Generate dates in 2025 with various hours, using Mexico City offset (UTC-6)
        fc.integer({ min: 0, max: 23 }).chain((hour) =>
          fc.integer({ min: 0, max: 59 }).map((minute) => {
            // Convert 24h hour to expected 12h format with explicit meridiem
            const meridiem = hour < 12 ? 'A.M.' : 'P.M.';
            const hour12 = hour % 12 === 0 ? 12 : hour % 12;
            return {
              // Mexico City is UTC-6 year-round
              isoString: `2025-07-15T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00-06:00`,
              expectedTime: `${hour12.toString().padStart(2, '0')}:${minute
                .toString()
                .padStart(2, '0')} ${meridiem}`,
            };
          })
        ),
        ({ isoString, expectedTime }) => {
          const result = formatShortDateTime(isoString);
          // The output should contain the Mexico City time in 12h meridiem format
          expect(result).toContain(expectedTime);
        }
      ),
      { numRuns: 50 }
    );
  });
});
