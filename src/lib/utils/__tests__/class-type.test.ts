// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getClassDisplayName, CLASS_TYPE_LABELS } from '../class-type';

/**
 * Property-Based Tests + Unit Tests for getClassDisplayName
 *
 * Property 5: Display name resolution
 * - customName when classType === 'personalizada' and customName is non-null/non-empty
 * - The mapped label ('Yoga', 'Mat Pilates', 'Barre') when classType is a predefined type
 * - The raw classType value or 'Clase' as fallback otherwise
 *
 * Validates: Requirements 5.1, 5.2
 */

const PREDEFINED_TYPES = ['yoga', 'mat_pilates', 'barre'] as const;
const EXPECTED_LABELS: Record<string, string> = {
  yoga: 'Yoga',
  mat_pilates: 'Mat Pilates',
  barre: 'Barre',
};

describe('getClassDisplayName', () => {
  // ─── Property-Based Tests ─────────────────────────────────────────────────────

  describe('Property 5: Display name resolution', () => {
    it('returns customName when classType is "personalizada" and customName is non-null/non-empty', () => {
      /**
       * **Validates: Requirements 5.1**
       *
       * For any non-empty string as customName, when classType is 'personalizada',
       * the function SHALL return exactly that customName.
       */
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          (customName) => {
            const result = getClassDisplayName('personalizada', customName);
            expect(result).toBe(customName);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns the mapped label for predefined types regardless of customName', () => {
      /**
       * **Validates: Requirements 5.2**
       *
       * For any predefined type and any arbitrary customName value,
       * the function SHALL return the mapped label for that type.
       */
      fc.assert(
        fc.property(
          fc.constantFrom(...PREDEFINED_TYPES),
          fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
          (classType, customName) => {
            const result = getClassDisplayName(classType, customName);
            expect(result).toBe(EXPECTED_LABELS[classType]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns raw classType for unknown types that are non-null', () => {
      /**
       * **Validates: Requirements 5.1, 5.2**
       *
       * For any string that is NOT a predefined type and NOT 'personalizada'
       * (and not an Object.prototype property name, since the implementation uses `in`),
       * the function SHALL return the raw classType value as fallback.
       */
      const knownTypes = new Set([...PREDEFINED_TYPES, 'personalizada']);
      const protoKeys = new Set(Object.getOwnPropertyNames(Object.prototype));

      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter(
            (s) => !knownTypes.has(s) && !protoKeys.has(s)
          ),
          (classType) => {
            const result = getClassDisplayName(classType, null);
            expect(result).toBe(classType);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns "Clase" when classType is null', () => {
      /**
       * **Validates: Requirements 5.1, 5.2**
       *
       * For any customName value, when classType is null,
       * the function SHALL return 'Clase' as the final fallback.
       */
      fc.assert(
        fc.property(
          fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
          (customName) => {
            const result = getClassDisplayName(null, customName);
            expect(result).toBe('Clase');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns "personalizada" as fallback when classType is "personalizada" but customName is null/empty', () => {
      /**
       * **Validates: Requirements 5.1, 5.2**
       *
       * When classType is 'personalizada' but customName is falsy (null, undefined, or empty string),
       * the function SHALL fall through to the fallback and return the raw classType value.
       */
      fc.assert(
        fc.property(
          fc.constantFrom(null, undefined, ''),
          (customName) => {
            const result = getClassDisplayName('personalizada', customName);
            expect(result).toBe('personalizada');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ─── Unit Tests ────────────────────────────────────────────────────────────────

  describe('Unit tests: specific examples and edge cases', () => {
    it('returns "Inauguración" for personalizada with custom name', () => {
      expect(getClassDisplayName('personalizada', 'Inauguración')).toBe('Inauguración');
    });

    it('returns "Yoga" for yoga type with null customName', () => {
      expect(getClassDisplayName('yoga', null)).toBe('Yoga');
    });

    it('returns "personalizada" as fallback when type is personalizada but no custom name', () => {
      expect(getClassDisplayName('personalizada', null)).toBe('personalizada');
    });

    it('returns "Clase" when classType is null and customName is null', () => {
      expect(getClassDisplayName(null, null)).toBe('Clase');
    });

    it('returns "Mat Pilates" for mat_pilates type', () => {
      expect(getClassDisplayName('mat_pilates', null)).toBe('Mat Pilates');
    });

    it('returns "Barre" for barre type', () => {
      expect(getClassDisplayName('barre', null)).toBe('Barre');
    });

    it('returns customName for personalizada even when customName has surrounding spaces', () => {
      // Note: the function returns the value as-is; trimming is the server action's responsibility
      expect(getClassDisplayName('personalizada', '  Mi Clase  ')).toBe('  Mi Clase  ');
    });

    it('returns raw classType for unknown type values', () => {
      expect(getClassDisplayName('zumba', null)).toBe('zumba');
    });

    it('ignores customName for predefined types', () => {
      expect(getClassDisplayName('yoga', 'Ignored Name')).toBe('Yoga');
      expect(getClassDisplayName('mat_pilates', 'Another Name')).toBe('Mat Pilates');
      expect(getClassDisplayName('barre', 'Barre Custom')).toBe('Barre');
    });
  });

  // ─── CLASS_TYPE_LABELS export test ─────────────────────────────────────────────

  describe('CLASS_TYPE_LABELS export', () => {
    it('contains all predefined types with correct labels', () => {
      expect(CLASS_TYPE_LABELS).toEqual({
        yoga: 'Yoga',
        mat_pilates: 'Mat Pilates',
        barre: 'Barre',
      });
    });
  });
});
