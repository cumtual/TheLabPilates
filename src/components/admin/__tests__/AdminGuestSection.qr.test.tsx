import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/components/admin/AdminAddGuestForm', () => ({ AdminAddGuestForm: () => null }));
vi.mock('@/components/admin/AdminRemoveGuestButton', () => ({ AdminRemoveGuestButton: () => null }));
vi.mock('@/components/admin/GuestQrButton', () => ({
  GuestQrButton: ({ guestName }: { guestName: string }) => <button type="button">QR {guestName}</button>,
}));

import { AdminGuestSection, type AdminGuestData } from '@/components/admin/AdminGuestSection';

function guest(overrides: Partial<AdminGuestData>): AdminGuestData {
  return {
    id: 'g',
    guestName: 'Invitado',
    origin: 'admin',
    status: 'pending',
    registeredById: 'admin-1',
    registeredByName: 'Admin Studio',
    ...overrides,
  };
}

describe('AdminGuestSection — botón "Ver QR" (SPEC-GUEST-QR-CHECKIN D1)', () => {
  it('solo aparece en invitados agregados por admin que siguen pendientes', () => {
    render(
      <AdminGuestSection
        classId="class-1"
        guests={[
          guest({ id: 'g1', guestName: 'Admin pendiente' }),
          guest({ id: 'g2', guestName: 'Admin asistió', status: 'attended' }),
          guest({ id: 'g3', guestName: 'De cliente', origin: 'user' }),
          guest({ id: 'g4', guestName: 'Admin ausente', status: 'absent' }),
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'QR Admin pendiente' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'QR Admin asistió' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'QR De cliente' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'QR Admin ausente' })).toBeNull();
  });
});
