/**
 * Copia literal de los paquetes que mostraba `src/components/sections/Pricing.tsx`
 * antes de leer el catálogo de la BD (SPEC-SPECIAL-PACKAGES D7). Es la fuente de
 * verdad de la carga 2026-10-07_002 y de la equivalencia visual de `PackageCard`.
 */
export const LEGACY_PRICING = [
  {
    name: 'Lab Pass',
    tagline: 'Todo comienza con un primer paso.',
    sessions: 'UNA SESIÓN',
    price: '95',
    features: ['Mat Pilates', 'Barre', 'Yoga'],
    premium: false,
  },
  {
    name: 'Lab Entry',
    tagline: 'Empieza a descubrir de lo que eres capaz.',
    sessions: '4 SESIONES',
    price: '360',
    features: ['Flexibilidad de horario'],
    premium: false,
  },
  {
    name: 'Lab Practice',
    tagline: 'La constancia construye resultados.',
    sessions: '8 SESIONES',
    price: '680',
    features: ['Flexibilidad de horario'],
    premium: false,
  },
  {
    name: 'Lab Progress',
    tagline: 'Cada movimiento te acerca a tu mejor versión.',
    sessions: '12 SESIONES',
    price: '960',
    features: ['-10%OFF Coffee Bar', 'Flexibilidad de horario'],
    premium: false,
  },
  {
    name: '∞ Open Lab',
    tagline: 'Haz del movimiento parte de tu vida.',
    sessions: 'ACCESO ILIMITADO',
    price: '1,850',
    features: ['-10%OFF Coffee Bar', '1 Invitado mensual', '1er Kit de regalo'],
    premium: true,
  },
] as const;

/** Nombre en la BD (sin el «∞ » que agrega la tarjeta a los ilimitados). */
export const dbNameOf = (name: string) => name.replace(/^∞\s*/, '');
