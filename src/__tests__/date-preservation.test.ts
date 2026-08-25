/**
 * Preservation Property Tests - Format Structure and Fallback Consistency
 *
 * Property 2: For any input (including null, invalid, or valid dates), the
 * formatting functions SHALL produce output with the same format structure
 * and fallback strings as the original functions.
 *
 * These tests run with TZ=America/Mexico_City to match the baseline behavior.
 * They must PASS on UNFIXED code (capturing the preservation contract).
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import {
  formatFriendlyDate,
  formatShortDate,
  formatShortDateTime,
  formatRelativeDate,
} from '@/lib/utils/date';

// Run in Mexico City timezone to match baseline (unchanged behavior for local users)
beforeAll(() => {
  process.env.TZ = 'America/Mexico_City';
});

afterAll(() => {
  delete process.env.TZ;
});

describe('Preservation: Format Structure and Fallback Consistency (Property 2)', () => {
  // --- Null Input Preservation ---

  describe('Null/undefined input fallbacks', () => {
    it('formatFriendlyDate(null) returns "Sin fecha"', () => {
      expect(formatFriendlyDate(null)).toBe('Sin fecha');
    });

    it('formatShortDate(null) returns "--/--/----"', () => {
      expect(formatShortDate(null)).toBe('--/--/----');
    });

    it('formatShortDateTime(null) returns "--/--/---- — --:--"', () => {
      expect(formatShortDateTime(null)).toBe('--/--/---- — --:--');
    });

    it('formatRelativeDate(null) returns ""', () => {
      expect(formatRelativeDate(null)).toBe('');
    });
  });

  // --- Invalid Date Preservation ---

  describe('Invalid date input fallbacks', () => {
    it('formatFriendlyDate(invalid) returns "Fecha inválida"', () => {
      expect(formatFriendlyDate('not-a-date')).toBe('Fecha inválida');
      expect(formatFriendlyDate(new Date('invalid'))).toBe('Fecha inválida');
    });

    it('formatShortDate(invalid) returns "--/--/----"', () => {
      expect(formatShortDate('not-a-date')).toBe('--/--/----');
      expect(formatShortDate(new Date('invalid'))).toBe('--/--/----');
    });

    it('formatShortDateTime(invalid) returns "--/--/---- — --:--"', () => {
      expect(formatShortDateTime('not-a-date')).toBe('--/--/---- — --:--');
      expect(formatShortDateTime(new Date('invalid'))).toBe('--/--/---- — --:--');
    });

    it('formatRelativeDate(invalid) returns ""', () => {
      expect(formatRelativeDate('not-a-date')).toBe('');
      expect(formatRelativeDate(new Date('invalid'))).toBe('');
    });
  });

  // --- Format Structure Preservation (Property-Based) ---

  describe('Format structure preservation (property-based)', () => {
    // Arbitrary for valid dates (years 2020-2030) using timestamps
    const validDateArb = fc
      .integer({
        min: new Date('2020-01-01T00:00:00Z').getTime(),
        max: new Date('2030-12-31T23:59:59Z').getTime(),
      })
      .map((ts) => new Date(ts).toISOString());

    /**
     * formatFriendlyDate output structure: starts with uppercase letter,
     * contains " — " separator, ends with HH:MM pattern.
     * Pattern: ^[A-ZÁÉÍÓÚÑ].+ — \d{2}:\d{2}$
     */
    it('formatFriendlyDate always matches capitalized weekday + " — " + HH:MM structure', () => {
      fc.assert(
        fc.property(validDateArb, (dateStr) => {
          const result = formatFriendlyDate(dateStr);
          // Starts with uppercase letter (Spanish characters included)
          expect(result).toMatch(/^[A-ZÁÉÍÓÚÑ]/);
          // Contains the separator
          expect(result).toContain(' — ');
          // Ends with HH:MM
          expect(result).toMatch(/\d{2}:\d{2}$/);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * formatShortDate always returns DD/MM/YYYY format.
     * Pattern: ^\d{2}/\d{2}/\d{4}$
     */
    it('formatShortDate always matches DD/MM/YYYY pattern', () => {
      fc.assert(
        fc.property(validDateArb, (dateStr) => {
          const result = formatShortDate(dateStr);
          expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * formatShortDateTime always returns DD/MM/YYYY — HH:MM format.
     * Pattern: ^\d{2}/\d{2}/\d{4} — \d{2}:\d{2}$
     */
    it('formatShortDateTime always matches DD/MM/YYYY — HH:MM pattern', () => {
      fc.assert(
        fc.property(validDateArb, (dateStr) => {
          const result = formatShortDateTime(dateStr);
          expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} — \d{2}:\d{2}$/);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * formatRelativeDate returns empty string for dates outside ±7 day range.
     */
    it('formatRelativeDate returns "" for dates more than 7 days away', () => {
      // Generate dates that are more than 8 days in the past or future from "now"
      const farDateArb = fc
        .integer({ min: 8, max: 365 })
        .chain((dayOffset) =>
          fc.boolean().map((isFuture) => {
            const now = new Date();
            const offset = isFuture ? dayOffset : -dayOffset;
            const target = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
            return target.toISOString();
          })
        );

      fc.assert(
        fc.property(farDateArb, (dateStr) => {
          const result = formatRelativeDate(dateStr);
          expect(result).toBe('');
        }),
        { numRuns: 50 }
      );
    });

    /**
     * Property: null/invalid inputs always produce the defined fallback strings.
     * This uses arbitrary generation of invalid date strings.
     */
    it('invalid date strings always produce fallback values', () => {
      const invalidDateArb = fc.constantFrom(
        'not-a-date',
        'abc',
        '99/99/9999',
        'undefined',
        '',
        'null',
        '2025-13-45', // invalid month/day
        'xyz123'
      );

      fc.assert(
        fc.property(invalidDateArb, (invalidStr) => {
          // formatFriendlyDate: 'Fecha inválida' for invalid, but empty string '' gets 'Sin fecha'
          const friendly = formatFriendlyDate(invalidStr);
          if (invalidStr === '') {
            expect(friendly).toBe('Sin fecha'); // falsy → null path
          } else {
            expect(friendly).toBe('Fecha inválida');
          }

          const short = formatShortDate(invalidStr);
          if (invalidStr === '') {
            expect(short).toBe('--/--/----'); // falsy → null path
          } else {
            expect(short).toBe('--/--/----');
          }

          const shortDt = formatShortDateTime(invalidStr);
          if (invalidStr === '') {
            expect(shortDt).toBe('--/--/---- — --:--');
          } else {
            expect(shortDt).toBe('--/--/---- — --:--');
          }

          const relative = formatRelativeDate(invalidStr);
          expect(relative).toBe('');
        }),
        { numRuns: 20 }
      );
    });
  });
});
