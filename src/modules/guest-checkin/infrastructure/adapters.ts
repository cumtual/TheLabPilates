import { buildCheckinQrDataUrl } from '@/lib/checkin/qr';
import { buildCheckinUrl, generateCheckinToken } from '@/lib/checkin/token';
import { getClassDisplayName } from '@/lib/utils/class-type';
import { getMexicoCityDayBounds, isAttendanceWindowOpen } from '@/lib/utils/date';
import type { AttendanceCalendar, CheckinQrEncoder, ClassNamer, Clock } from '../application/ports';

/**
 * Adaptadores sobre las utilidades existentes del check-in del titular. Se reutilizan
 * sin modificarlas, así el QR del invitado tiene el mismo formato y la misma URL.
 */

export const cdmxAttendanceCalendar: AttendanceCalendar = {
  isWindowOpen: (classDate, now) => isAttendanceWindowOpen(classDate, now),
  dayStart: (now) => getMexicoCityDayBounds(now).start,
};

export const checkinQrEncoder: CheckinQrEncoder = {
  urlFor: (token) => buildCheckinUrl(token),
  render: (url) => buildCheckinQrDataUrl(url),
};

export const classNamer: ClassNamer = {
  displayName: (classType, customName) => getClassDisplayName(classType, customName),
};

export const systemClock: Clock = { now: () => new Date() };

/** Token de un solo uso de 256 bits, el mismo generador que el del titular. */
export const generateGuestCheckinToken = generateCheckinToken;
