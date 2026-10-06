// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Guarda estructural (SPEC-CANCELLATION-AUDIT-AND-TERMS §3.1): TODA transición de
 * class_enrolleds / guest_enrollments a cancelado debe pasar por
 * build{Enrollment,Guest}CancellationPatch, que fija cancelled_at = now().
 * Un `.set({ status: 'cancelled' })` literal dejaría la cancelación sin auditoría.
 */

const ROOT = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const UPDATE_CHAIN = /\.update\((classEnrollments|guestEnrollments)\)\s*\.set\(([^)]*)\)/g;

const writers = sourceFiles(ROOT).flatMap((file) => {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(UPDATE_CHAIN)].map((match) => ({
    file: relative(process.cwd(), file),
    table: match[1],
    patch: match[2].replace(/\s+/g, ' ').trim(),
  }));
});

describe('escrituras de cancelación auditadas', () => {
  it('encuentra las escrituras a las tablas de inscripciones (sanidad del escáner)', () => {
    expect(writers.length).toBeGreaterThan(5);
  });

  it('ningún UPDATE fija status cancelado de forma literal', () => {
    const literal = writers.filter((w) => /status:\s*'(cancelled|late_cancelled)'/.test(w.patch));
    expect(literal).toEqual([]);
  });

  it('class_enrolleds usa el patch de inscripción y guest_enrollments el de invitado', () => {
    for (const w of writers) {
      if (w.patch.includes('buildEnrollmentCancellationPatch')) expect(w.table).toBe('classEnrollments');
      if (w.patch.includes('buildGuestCancellationPatch')) expect(w.table).toBe('guestEnrollments');
    }
  });
});
