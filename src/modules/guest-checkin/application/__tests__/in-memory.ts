import type { GuestCheckinCandidate } from '../../domain/guest-checkin';
import type {
  GuestCheckinDeps,
  GuestCheckinRepository,
  GuestQrRecord,
} from '../ports';

/** Fila en memoria: el invitado con su token y los campos de check-in. */
export interface GuestRow extends GuestCheckinCandidate {
  origin: 'user' | 'admin';
  checkinToken: string | null;
  checkedInAt: Date | null;
  checkedInById: string | null;
}

export const TOKEN = 'a'.repeat(64);
export const NOW = new Date('2026-11-20T08:55:00.000-06:00');

export function guestRow(overrides: Partial<GuestRow> = {}): GuestRow {
  return {
    guestEnrollmentId: 'guest-1',
    status: 'pending',
    guestName: 'María López',
    invitedByName: 'Admin Studio',
    classDate: new Date('2026-11-20T09:00:00.000-06:00'),
    classStatus: 'scheduled',
    coachUserId: 'coach-1',
    classType: 'mat_pilates',
    customName: null,
    origin: 'admin',
    checkinToken: TOKEN,
    checkedInAt: null,
    checkedInById: null,
    ...overrides,
  };
}

/** Dependencias en memoria. `markAttended` aplica las mismas guardas que el UPDATE real. */
export function inMemoryDeps(rows: GuestRow[], options: { windowOpen?: boolean } = {}) {
  const calls = { autoClose: [] as { from: Date; cutoff: Date }[], transactions: 0 };

  const repository: GuestCheckinRepository = {
    async findByTokenForUpdate(token) {
      const row = rows.find((r) => r.checkinToken === token);
      if (!row) return null;
      return {
        guestEnrollmentId: row.guestEnrollmentId,
        status: row.status,
        guestName: row.guestName,
        invitedByName: row.invitedByName,
        classDate: row.classDate,
        classStatus: row.classStatus,
        coachUserId: row.coachUserId,
        classType: row.classType,
        customName: row.customName,
      };
    },
    async markAttended({ guestEnrollmentId, token, actorId }) {
      const row = rows.find(
        (r) => r.guestEnrollmentId === guestEnrollmentId && r.status === 'pending' && r.checkinToken === token
      );
      if (!row) return null;
      row.status = 'attended';
      row.checkedInAt = NOW;
      row.checkedInById = actorId;
      row.checkinToken = null;
      return row.checkedInAt;
    },
  };

  const deps: GuestCheckinDeps = {
    uow: {
      async run(work) {
        calls.transactions += 1;
        return work(repository);
      },
    },
    qrReader: {
      async findById(id): Promise<GuestQrRecord | null> {
        const row = rows.find((r) => r.guestEnrollmentId === id);
        return row
          ? {
              guestEnrollmentId: row.guestEnrollmentId,
              guestName: row.guestName,
              origin: row.origin,
              status: row.status,
              checkinToken: row.checkinToken,
              classType: row.classType,
              customName: row.customName,
              classDate: row.classDate,
            }
          : null;
      },
    },
    autoClose: {
      async markUnattendedAbsent(range) {
        calls.autoClose.push(range);
        return 3;
      },
    },
    calendar: {
      isWindowOpen: () => options.windowOpen ?? true,
      dayStart: () => new Date('2026-11-20T00:00:00.000-06:00'),
    },
    qr: {
      urlFor: (token) => `https://app.test/check-in?token=${token}`,
      render: async (url) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(url)}`,
    },
    classNames: { displayName: (type, custom) => custom ?? (type === 'mat_pilates' ? 'Mat Pilates' : String(type)) },
    clock: { now: () => NOW },
    autoCloseFrom: new Date('2026-11-18T00:00:00.000-06:00'),
  };

  return { deps, rows, calls, repository };
}
