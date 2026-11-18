import type { GuestCheckinCandidate } from '../../domain/guest-checkin';
import type { Actor, GuestEnrollmentStatus, GuestOrigin } from '../../domain/types';

/**
 * Puertos del módulo (SPEC-GUEST-QR-CHECKIN §5). La infraestructura los implementa
 * con Drizzle, `qrcode` y los helpers de fecha CDMX; los tests, en memoria.
 */

export type { Actor };

/** Acceso transaccional del check-in. */
export interface GuestCheckinRepository {
  /** Busca al invitado por token y bloquea su fila hasta el fin de la transacción. */
  findByTokenForUpdate(token: string): Promise<GuestCheckinCandidate | null>;
  /**
   * Marca `attended`, fija `checked_in_at = now()` y `checked_in_by`, y anula el token,
   * solo si sigue `pending` con ese token. Devuelve `checked_in_at` o `null`.
   */
  markAttended(input: { guestEnrollmentId: string; token: string; actorId: string }): Promise<Date | null>;
}

export interface GuestCheckinUnitOfWork {
  run<T>(work: (repository: GuestCheckinRepository) => Promise<T>): Promise<T>;
}

/** Invitado con lo necesario para mostrar su QR. */
export interface GuestQrRecord {
  guestEnrollmentId: string;
  guestName: string;
  origin: GuestOrigin;
  status: GuestEnrollmentStatus | null;
  checkinToken: string | null;
  classType: string | null;
  customName: string | null;
  classDate: Date | null;
}

export interface GuestQrReader {
  findById(guestEnrollmentId: string): Promise<GuestQrRecord | null>;
}

export interface GuestAutoCloseRepository {
  /** Invitados `pending` de clases con `from ≤ class_date < cutoff` → `absent`. Devuelve el conteo. */
  markUnattendedAbsent(range: { from: Date; cutoff: Date }): Promise<number>;
}

/** Calendario de asistencia en America/Mexico_City. */
export interface AttendanceCalendar {
  isWindowOpen(classDate: Date | null, now: Date): boolean;
  /** 00:00:00 CDMX del día de `now`. */
  dayStart(now: Date): Date;
}

export interface CheckinQrEncoder {
  urlFor(token: string): string;
  render(url: string): Promise<string>;
}

export interface ClassNamer {
  displayName(classType: string | null, customName: string | null): string;
}

export interface Clock {
  now(): Date;
}

export interface GuestCheckinDeps {
  uow: GuestCheckinUnitOfWork;
  qrReader: GuestQrReader;
  autoClose: GuestAutoCloseRepository;
  calendar: AttendanceCalendar;
  qr: CheckinQrEncoder;
  classNames: ClassNamer;
  clock: Clock;
  /** D5: el cierre automático no reescribe invitados anteriores al deploy. */
  autoCloseFrom: Date;
}
