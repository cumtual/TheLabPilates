import {
  getMexicoCityEndOfMonth,
  getMexicoCityRangeForDays,
  getMexicoCityYearMonth,
  getMexicoCityYmd,
  isValidYmd,
} from '@/lib/utils/date';
import type { Clock } from '../application/ports';

/** Reloj real con el calendario de America/Mexico_City (helpers de `date.ts`). */
export const systemClock: Clock = {
  now: () => new Date(),
  yearMonth: getMexicoCityYearMonth,
  endOfMonth: getMexicoCityEndOfMonth,
  ymd: getMexicoCityYmd,
  isValidYmd,
  dayRange: getMexicoCityRangeForDays,
};
