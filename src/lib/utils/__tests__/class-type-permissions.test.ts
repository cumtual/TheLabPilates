// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classTypeEnum } from '@/db/schema';
import { ALL_ROLES } from '@/lib/types/roles';
import {
  CLASS_TYPES,
  CUSTOM_CLASS_TYPE,
  canRoleCreateClassType,
  getClassDisplayName,
  getClassTypeOptions,
  getCreatableClassTypes,
} from '../class-type';

describe('Catálogo de tipos de clase', () => {
  it('el enum de Drizzle usa exactamente CLASS_TYPES, en el mismo orden que PostgreSQL', () => {
    expect(classTypeEnum.enumValues).toEqual([...CLASS_TYPES]);
    expect(CLASS_TYPES.at(-1)).toBe('sculpt');
  });

  it('muestra «Sculpt» como nombre de la clase', () => {
    expect(getClassDisplayName('sculpt')).toBe('Sculpt');
    expect(getClassDisplayName('sculpt', 'Ignorado')).toBe('Sculpt');
  });
});

describe('Permisos de creación por rol', () => {
  it('admin puede abrir todos los tipos, incluidos personalizada y sculpt', () => {
    expect(getCreatableClassTypes('admin')).toEqual(CLASS_TYPES);
  });

  it('coach puede abrir sculpt y los tipos existentes, nunca personalizada', () => {
    expect(getCreatableClassTypes('coach')).toEqual(['yoga', 'mat_pilates', 'barre', 'sculpt']);
    expect(canRoleCreateClassType('coach', 'sculpt')).toBe(true);
    expect(canRoleCreateClassType('coach', CUSTOM_CLASS_TYPE)).toBe(false);
  });

  it('client no puede abrir ningún tipo', () => {
    expect(getCreatableClassTypes('client')).toEqual([]);
  });

  it('ningún rol acepta valores fuera del catálogo (propiedad)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_ROLES),
        fc.oneof(fc.string(), fc.constant(null), fc.integer(), fc.constant('Sculpt'), fc.constant('SCULPT')),
        (role, value) => {
          fc.pre(!(CLASS_TYPES as readonly unknown[]).includes(value));
          expect(canRoleCreateClassType(role, value)).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('las opciones del selector coinciden con los permisos del rol', () => {
    for (const role of ALL_ROLES) {
      expect(getClassTypeOptions(role).map((o) => o.value)).toEqual(getCreatableClassTypes(role));
    }
    expect(getClassTypeOptions('coach').map((o) => o.label)).toEqual(['Yoga', 'Mat Pilates', 'Barre', 'Sculpt']);
  });
});

describe('sql/manual/2026-10-06_001_class_type_sculpt.sql', () => {
  const script = readFileSync(join(process.cwd(), 'sql/manual/2026-10-06_001_class_type_sculpt.sql'), 'utf8');
  const statements = script
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  it('agrega sculpt al enum de forma idempotente y transaccional', () => {
    expect(statements).toMatch(/ALTER TYPE public\.class_type ADD VALUE IF NOT EXISTS 'sculpt'/);
    expect(statements).toMatch(/BEGIN;[\s\S]*SET LOCAL lock_timeout[\s\S]*COMMIT;/);
  });

  it('no contiene operaciones destructivas', () => {
    expect(statements).not.toMatch(/\b(DROP|TRUNCATE|DELETE|RENAME|UPDATE|INSERT)\b/i);
  });
});
