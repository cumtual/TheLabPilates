// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { packageInputSchema, toFieldErrors, type PackageInput } from '../package-schema';

/** SPEC-SPECIAL-PACKAGES §4.1: límites con su caso válido y el inválido justo afuera. */

const standard: PackageInput = {
  kind: 'standard',
  name: 'Lab Entry',
  shortDescription: 'Empieza a descubrir de lo que eres capaz.',
  features: ['Flexibilidad de horario'],
  price: 360,
  validity: { amount: 30, unit: 'days' },
  sessions: 4,
};

const special: PackageInput = {
  kind: 'special',
  name: 'Reset Pass',
  shortDescription: 'Un respiro para tu semana.',
  features: [],
  price: 179,
  validity: { amount: 2, unit: 'weeks' },
  guestCredits: 0,
  rules: [
    { credits: 1, allowedClassTypes: ['yoga'] },
    { credits: 1, allowedClassTypes: ['mat_pilates', 'barre'] },
  ],
};

function errorsOf(input: unknown) {
  const result = packageInputSchema.safeParse(input);
  expect(result.success).toBe(false);
  return result.success ? {} : toFieldErrors(result.error);
}

describe('packageInputSchema', () => {
  it('acepta un estándar y un especial válidos, con defaults', () => {
    const parsed = packageInputSchema.parse(special);
    expect(parsed).toMatchObject({ validityDays: 14, displayOrder: 0, isFeatured: false });
    expect(parsed.kind === 'special' && parsed.rules[0]).toEqual({ credits: 1, allowedClassTypes: ['yoga'], label: null, timeWindow: null });
    expect(packageInputSchema.parse(standard)).toMatchObject({ validityDays: 30, sessions: 4 });
  });

  it('descripción: 49 caracteres sí; 50 no; vacía no', () => {
    expect(packageInputSchema.safeParse({ ...standard, shortDescription: 'x'.repeat(49) }).success).toBe(true);
    expect(errorsOf({ ...standard, shortDescription: 'x'.repeat(50) })).toEqual({
      shortDescription: 'La descripción debe tener menos de 50 caracteres.',
    });
    expect(errorsOf({ ...standard, shortDescription: '   ' }).shortDescription).toBe('La descripción es obligatoria.');
  });

  it('beneficios: 4 sí; 5 no; uno de 25 caracteres no; duplicados no', () => {
    const four = ['A', 'B', 'C', 'D'];
    expect(packageInputSchema.safeParse({ ...standard, features: four }).success).toBe(true);
    expect(errorsOf({ ...standard, features: [...four, 'E'] }).features).toBe('Máximo 4 beneficios.');
    expect(errorsOf({ ...standard, features: ['x'.repeat(25)] })['features.0']).toBe('Máximo 24 caracteres por beneficio.');
    expect(packageInputSchema.safeParse({ ...standard, features: ['x'.repeat(24)] }).success).toBe(true);
    expect(errorsOf({ ...standard, features: ['Yoga', 'yoga'] }).features).toBe('No repitas beneficios.');
    expect(errorsOf({ ...standard, features: [' '] })['features.0']).toBe('El beneficio no puede ir vacío.');
  });

  it('vigencia: semanas se convierten a días; máximo 365', () => {
    expect(packageInputSchema.parse({ ...standard, validity: { amount: 52, unit: 'weeks' } }).validityDays).toBe(364);
    expect(packageInputSchema.parse({ ...standard, validity: { amount: 365, unit: 'days' } }).validityDays).toBe(365);
    expect(errorsOf({ ...standard, validity: { amount: 53, unit: 'weeks' } }).validity).toBe('La vigencia máxima es de 365 días.');
    expect(errorsOf({ ...standard, validity: { amount: 0, unit: 'days' } })['validity.amount']).toBeDefined();
  });

  it('reglas: al menos 1, máximo 6, sin disciplinas repetidas ni desconocidas', () => {
    expect(errorsOf({ ...special, rules: [] }).rules).toBe('Agrega al menos una regla.');
    const rule = { credits: 1, allowedClassTypes: ['yoga'] };
    expect(errorsOf({ ...special, rules: Array(7).fill(rule) }).rules).toBe('Máximo 6 reglas.');
    expect(errorsOf({ ...special, rules: [{ credits: 1, allowedClassTypes: ['yoga', 'yoga'] }] })['rules.0.allowedClassTypes']).toBe('No repitas disciplinas.');
    expect(errorsOf({ ...special, rules: [{ credits: 1, allowedClassTypes: [] }] })['rules.0.allowedClassTypes']).toBe('Elige al menos una disciplina.');
    expect(errorsOf({ ...special, rules: [{ credits: 1, allowedClassTypes: ['spinning'] }] })['rules.0.allowedClassTypes.0']).toBeDefined();
    expect(errorsOf({ ...special, rules: [{ credits: 0, allowedClassTypes: ['yoga'] }] })['rules.0.credits']).toBeDefined();
  });

  it('franja: fin posterior al inicio y formato HH:MM', () => {
    const withWindow = (start: string, end: string) => ({ ...special, rules: [{ credits: 1, allowedClassTypes: ['yoga'], timeWindow: { start, end } }] });
    expect(packageInputSchema.safeParse(withWindow('07:00', '11:00')).success).toBe(true);
    expect(errorsOf(withWindow('11:00', '07:00'))['rules.0.timeWindow.end']).toBe('La hora final debe ser posterior a la inicial.');
    expect(errorsOf(withWindow('7:00', '11:00'))['rules.0.timeWindow.start']).toBe('Usa el formato HH:MM.');
  });

  it('pases de invitado: 0 a 10', () => {
    expect(packageInputSchema.safeParse({ ...special, guestCredits: 10 }).success).toBe(true);
    expect(errorsOf({ ...special, guestCredits: 11 }).guestCredits).toBeDefined();
  });

  it('estándar exige sesiones; especial no las acepta como entrada', () => {
    const withoutSessions: Record<string, unknown> = { ...standard };
    delete withoutSessions.sessions;
    expect(errorsOf(withoutSessions).sessions).toBeDefined();
    const parsed = packageInputSchema.parse({ ...special, sessions: 99 });
    expect('sessions' in parsed).toBe(false);
  });

  it('toFieldErrors conserva solo el primer mensaje de cada ruta', () => {
    const errors = errorsOf({ ...standard, name: '', shortDescription: '' });
    expect(Object.keys(errors).sort()).toEqual(['name', 'shortDescription']);
  });
});
