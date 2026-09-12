import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  },
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/auth/password', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock('@/lib/email/service', () => ({
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { db } from '@/db';
import { getSession } from '@/lib/auth/session';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { sendPasswordChangedEmail } from '@/lib/email/service';
import { updateNameAction, changePasswordAction } from '../profile';

function mockSession() {
  (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    sub: 'user-uuid',
    role: 'client',
    email: 'user@test.com',
  });
}

function mockUpdateChain() {
  const setArgs: unknown[] = [];
  (db.update as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    set: (args: unknown) => {
      setArgs.push(args);
      return { where: vi.fn() };
    },
  }));
  return setArgs;
}

function mockUser() {
  (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'user-uuid',
    email: 'user@test.com',
    username: 'Ana',
    password: 'stored-hash',
  });
}

describe('updateNameAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates the trimmed name for the authenticated user', async () => {
    mockSession();
    const setArgs = mockUpdateChain();

    const result = await updateNameAction('  Ana López  ');

    expect(result.success).toBe(true);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(setArgs[0]).toEqual({ username: 'Ana López' });
  });

  it('rejects names shorter than 2 characters without updating', async () => {
    mockSession();
    const setArgs = mockUpdateChain();

    const result = await updateNameAction('A');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.field).toBe('name');
    expect(db.update).not.toHaveBeenCalled();
    expect(setArgs).toHaveLength(0);
  });

  it('rejects names longer than 100 characters without updating', async () => {
    mockSession();
    mockUpdateChain();

    const result = await updateNameAction('x'.repeat(101));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.field).toBe('name');
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('changePasswordAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hashes and stores the new password and sends the notification email', async () => {
    mockSession();
    mockUser();
    (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    (hashPassword as ReturnType<typeof vi.fn>).mockResolvedValueOnce('new-hash');
    const setArgs = mockUpdateChain();

    const result = await changePasswordAction({
      currentPassword: 'oldpass123',
      newPassword: 'newpass123',
      confirmPassword: 'newpass123',
    });

    expect(result.success).toBe(true);
    expect(verifyPassword).toHaveBeenCalledWith('oldpass123', 'stored-hash');
    expect(hashPassword).toHaveBeenCalledWith('newpass123');
    expect(setArgs[0]).toEqual({ password: 'new-hash' });
    expect(sendPasswordChangedEmail).toHaveBeenCalledWith('user@test.com', 'Ana');
  });

  it('rejects a wrong current password without updating', async () => {
    mockSession();
    mockUser();
    (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const setArgs = mockUpdateChain();

    const result = await changePasswordAction({
      currentPassword: 'wrong',
      newPassword: 'newpass123',
      confirmPassword: 'newpass123',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.field).toBe('currentPassword');
      expect(result.error).toBe('La contraseña actual es incorrecta.');
    }
    expect(db.update).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
    expect(setArgs).toHaveLength(0);
  });

  it('rejects a new password shorter than 8 characters without updating', async () => {
    mockSession();
    mockUser();
    (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    const setArgs = mockUpdateChain();

    const result = await changePasswordAction({
      currentPassword: 'oldpass123',
      newPassword: 'short',
      confirmPassword: 'short',
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.field).toBe('newPassword');
    expect(db.update).not.toHaveBeenCalled();
    expect(setArgs).toHaveLength(0);
  });

  it('rejects mismatched confirmation without updating', async () => {
    mockSession();
    mockUser();
    (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    const setArgs = mockUpdateChain();

    const result = await changePasswordAction({
      currentPassword: 'oldpass123',
      newPassword: 'newpass123',
      confirmPassword: 'different123',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.field).toBe('confirmPassword');
      expect(result.error).toBe('Las contraseñas no coinciden.');
    }
    expect(db.update).not.toHaveBeenCalled();
    expect(setArgs).toHaveLength(0);
  });
});
