import { z } from 'zod';
import { CLASS_TYPES } from '@/lib/utils/class-type';

/**
 * Esquema único del paquete (SPEC-SPECIAL-PACKAGES §4.1). Lo usan el formulario
 * del admin (validación inmediata) y las Server Actions (validación definitiva).
 */

export const NAME_MAX = 60;
/** «Menos de 50 caracteres». */
export const DESCRIPTION_MAX = 49;
export const FEATURES_MAX = 4;
export const FEATURE_MAX_LENGTH = 24;
export const RULES_MAX = 6;
export const RULE_LABEL_MAX = 60;
export const GUEST_CREDITS_MAX = 10;
export const VALIDITY_DAYS_MAX = 365;
export const DEFAULT_VALIDITY_DAYS = 30;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa el formato HH:MM.');

export const timeWindowSchema = z
  .object({ start: hhmm, end: hhmm })
  .refine((w) => w.start < w.end, { message: 'La hora final debe ser posterior a la inicial.', path: ['end'] });

export const packageRuleSchema = z.object({
  label: z
    .string()
    .trim()
    .max(RULE_LABEL_MAX, `Máximo ${RULE_LABEL_MAX} caracteres.`)
    .nullish()
    .transform((value) => value || null),
  credits: z
    .number('Indica los créditos.')
    .int()
    .min(1, 'Mínimo 1 crédito.')
    .max(100, 'Máximo 100 créditos.'),
  allowedClassTypes: z
    .array(z.enum(CLASS_TYPES, 'Disciplina no válida.'))
    .min(1, 'Elige al menos una disciplina.')
    .refine((types) => new Set(types).size === types.length, 'No repitas disciplinas.'),
  timeWindow: timeWindowSchema.nullish().transform((value) => value ?? null),
});

const validitySchema = z
  .object({
    amount: z.number('Indica la vigencia.').int().min(1, 'La vigencia mínima es 1.'),
    unit: z.enum(['days', 'weeks']),
  })
  .transform(({ amount, unit }) => (unit === 'weeks' ? amount * 7 : amount))
  .pipe(z.number().max(VALIDITY_DAYS_MAX, `La vigencia máxima es de ${VALIDITY_DAYS_MAX} días.`));

const baseFields = {
  name: z.string().trim().min(1, 'El nombre es obligatorio.').max(NAME_MAX, `Máximo ${NAME_MAX} caracteres.`),
  shortDescription: z
    .string()
    .trim()
    .min(1, 'La descripción es obligatoria.')
    .max(DESCRIPTION_MAX, 'La descripción debe tener menos de 50 caracteres.'),
  features: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'El beneficio no puede ir vacío.')
        .max(FEATURE_MAX_LENGTH, `Máximo ${FEATURE_MAX_LENGTH} caracteres por beneficio.`)
    )
    .max(FEATURES_MAX, `Máximo ${FEATURES_MAX} beneficios.`)
    .refine((items) => new Set(items.map((i) => i.toLowerCase())).size === items.length, 'No repitas beneficios.'),
  price: z
    .number('Indica el precio.')
    .int('El precio debe ser un número entero.')
    .min(1, 'El precio mínimo es $1.')
    .max(100_000, 'El precio máximo es $100,000.'),
  validity: validitySchema,
  displayOrder: z.number().int().min(0).max(999).default(0),
  isFeatured: z.boolean().default(false),
};

export const packageInputSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('standard'),
      ...baseFields,
      sessions: z.number('Indica las sesiones.').int().min(1, 'Mínimo 1 sesión.').max(100, 'Máximo 100 sesiones.'),
    }),
    z.object({
      kind: z.literal('special'),
      ...baseFields,
      guestCredits: z
        .number()
        .int()
        .min(0, 'Mínimo 0 pases.')
        .max(GUEST_CREDITS_MAX, `Máximo ${GUEST_CREDITS_MAX} pases de invitado.`)
        .default(0),
      rules: z.array(packageRuleSchema).min(1, 'Agrega al menos una regla.').max(RULES_MAX, `Máximo ${RULES_MAX} reglas.`),
    }),
  ])
  .transform(({ validity, ...rest }) => ({ ...rest, validityDays: validity }));

/** Lo que envía el formulario. */
export type PackageInput = z.input<typeof packageInputSchema>;
/** Lo que persiste el servidor. */
export type PackageData = z.output<typeof packageInputSchema>;
export type PackageRuleInput = z.input<typeof packageRuleSchema>;

/** Errores de Zod por ruta (`rules.1.timeWindow.end`); solo el primero de cada ruta. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/** Σ de créditos de las reglas (INV-2: `sessions` de un especial). */
export function totalRuleCredits(rules: readonly { credits: number }[]): number {
  return rules.reduce((sum, rule) => sum + rule.credits, 0);
}
