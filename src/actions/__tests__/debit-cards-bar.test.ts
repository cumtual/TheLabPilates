// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { calls, selectResult } = vi.hoisted(() => ({ calls: [] as { set: unknown }[], selectResult: { rows: [] as unknown[] } }));
vi.mock('@/db', () => {
  const update = () => ({ set: (patch: unknown) => ({ where: async () => void calls.push({ set: patch }) }) });
  return {
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => selectResult.rows }) }) }),
      transaction: async (fn: (tx: unknown) => Promise<void>) => fn({ update }),
      update,
    },
  };
});
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getSession } from '@/lib/auth/session';
import { setBarBankAccountAction, deleteDebitCardAction } from '../debit-cards';

const as = (role: 'admin' | 'barra') => ({ sub: 'x', role, email: 'x', iat: 0, exp: 0 });

/** setBarBankAccountAction (SPEC-CAFETERIA A6, TASK-CF-ADM-04). */
describe('setBarBankAccountAction', () => {
  beforeEach(() => {
    calls.length = 0;
    selectResult.rows = [{ id: 'c1' }];
  });

  it('solo admin', async () => {
    vi.mocked(getSession).mockResolvedValue(as('barra'));
    expect(await setBarBankAccountAction('c1')).toMatchObject({ success: false });
    expect(calls).toHaveLength(0);
  });

  it('quita la marca anterior y marca la nueva, sin tocar active', async () => {
    vi.mocked(getSession).mockResolvedValue(as('admin'));
    expect(await setBarBankAccountAction('c1')).toMatchObject({ success: true });
    expect(calls.map((c) => c.set)).toEqual([{ barActive: false }, { barActive: true }]);
  });

  it('una tarjeta eliminada no se puede marcar', async () => {
    vi.mocked(getSession).mockResolvedValue(as('admin'));
    selectResult.rows = [];
    expect(await setBarBankAccountAction('gone')).toEqual({ success: false, error: 'La tarjeta no existe o fue eliminada.' });
    expect(calls).toHaveLength(0);
  });

  it('eliminar una tarjeta le quita la marca de barra', async () => {
    vi.mocked(getSession).mockResolvedValue(as('admin'));
    await deleteDebitCardAction('c1');
    expect(calls[0].set).toMatchObject({ active: false, barActive: false });
  });
});
