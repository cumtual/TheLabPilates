/**
 * Clases de la cuadrícula de paquetes según cuántos hay (SPEC-SPECIAL-PACKAGES §9).
 * Clases literales para que Tailwind las detecte. Con 5 es la cuadrícula de siempre.
 */
const GRID_BY_COUNT: Record<number, string> = {
  1: 'grid grid-cols-1 gap-6 max-w-sm mx-auto',
  2: 'grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto',
  3: 'grid grid-cols-1 md:grid-cols-3 gap-6',
  4: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6',
  5: 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6',
  6: 'grid grid-cols-1 md:grid-cols-3 gap-6',
};

export function getPricingGridClass(count: number): string {
  return GRID_BY_COUNT[count] ?? 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6';
}
