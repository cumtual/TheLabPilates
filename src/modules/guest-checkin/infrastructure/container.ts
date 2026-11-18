import type { GuestCheckinDeps } from '../application/ports';
import { cdmxAttendanceCalendar, checkinQrEncoder, classNamer, systemClock } from './adapters';
import { GUEST_ATTENDANCE_AUTO_CLOSE_FROM } from './config';
import {
  drizzleGuestAutoClose,
  drizzleGuestCheckinUnitOfWork,
  drizzleGuestQrReader,
} from './drizzle-guest-checkin-repository';

/** Dependencias reales de los casos de uso. La capa presentation las inyecta. */
export function guestCheckinDeps(): GuestCheckinDeps {
  return {
    uow: drizzleGuestCheckinUnitOfWork,
    qrReader: drizzleGuestQrReader,
    autoClose: drizzleGuestAutoClose,
    calendar: cdmxAttendanceCalendar,
    qr: checkinQrEncoder,
    classNames: classNamer,
    clock: systemClock,
    autoCloseFrom: GUEST_ATTENDANCE_AUTO_CLOSE_FROM,
  };
}
