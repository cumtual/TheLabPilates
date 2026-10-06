import type { UserRole } from '@/lib/types/roles';

/**
 * Catálogo único de tipos de clase. `src/db/schema.ts` construye el enum
 * `class_type` a partir de esta lista, así que el orden debe coincidir con el
 * de PostgreSQL (los valores nuevos se agregan al final; ver sql/manual).
 */
export const CLASS_TYPES = ['yoga', 'mat_pilates', 'barre', 'personalizada', 'sculpt'] as const;

export type ClassType = (typeof CLASS_TYPES)[number];

/** Tipo con nombre libre (`custom_name`). Solo admin puede crearlo. */
export const CUSTOM_CLASS_TYPE = 'personalizada' satisfies ClassType;

const CLASS_TYPE_LABELS: Record<string, string> = {
  yoga: 'Yoga',
  mat_pilates: 'Mat Pilates',
  barre: 'Barre',
  sculpt: 'Sculpt',
};

/** Etiqueta del tipo en selectores y filtros (incluye «Personalizada»). */
const CLASS_TYPE_OPTION_LABELS: Record<ClassType, string> = {
  yoga: 'Yoga',
  mat_pilates: 'Mat Pilates',
  barre: 'Barre',
  personalizada: 'Personalizada',
  sculpt: 'Sculpt',
};

export function isClassType(value: unknown): value is ClassType {
  return typeof value === 'string' && (CLASS_TYPES as readonly string[]).includes(value);
}

/**
 * Tipos de clase que cada rol puede abrir. Admin: todos. Coach: todos excepto
 * `personalizada`. Client: ninguno.
 */
export function getCreatableClassTypes(role: UserRole): readonly ClassType[] {
  if (role === 'admin') return CLASS_TYPES;
  if (role === 'coach') return CLASS_TYPES.filter((type) => type !== CUSTOM_CLASS_TYPE);
  return [];
}

export function canRoleCreateClassType(role: UserRole, classType: unknown): classType is ClassType {
  return isClassType(classType) && getCreatableClassTypes(role).includes(classType);
}

/** Opciones `{ value, label }` del selector de tipo de clase para un rol. */
export function getClassTypeOptions(role: UserRole): { value: ClassType; label: string }[] {
  return getCreatableClassTypes(role).map((value) => ({ value, label: CLASS_TYPE_OPTION_LABELS[value] }));
}

/**
 * Resuelve el nombre a mostrar para una clase.
 * Si el tipo es 'personalizada' y existe custom_name, devuelve custom_name.
 * Si el tipo es predefinido, devuelve la etiqueta mapeada.
 * Fallback: el valor del tipo tal cual, o 'Clase'.
 */
export function getClassDisplayName(
  classType: string | null,
  customName?: string | null
): string {
  if (classType === CUSTOM_CLASS_TYPE && customName) {
    return customName;
  }
  if (classType && classType in CLASS_TYPE_LABELS) {
    return CLASS_TYPE_LABELS[classType];
  }
  return classType ?? 'Clase';
}

export { CLASS_TYPE_LABELS, CLASS_TYPE_OPTION_LABELS };
