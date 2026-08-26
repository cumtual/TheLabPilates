const CLASS_TYPE_LABELS: Record<string, string> = {
  yoga: 'Yoga',
  mat_pilates: 'Mat Pilates',
  barre: 'Barre',
};

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
  if (classType === 'personalizada' && customName) {
    return customName;
  }
  if (classType && classType in CLASS_TYPE_LABELS) {
    return CLASS_TYPE_LABELS[classType];
  }
  return classType ?? 'Clase';
}

export { CLASS_TYPE_LABELS };
