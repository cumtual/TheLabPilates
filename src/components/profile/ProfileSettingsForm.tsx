'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { updateNameAction, changePasswordAction } from '@/actions/profile';

interface ProfileSettingsFormProps {
  initialName: string;
}

interface FieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export function ProfileSettingsForm({ initialName }: ProfileSettingsFormProps) {
  return (
    <div className="space-y-6">
      <NameSection initialName={initialName} />
      <PasswordSection />
    </div>
  );
}

function NameSection({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | undefined>(undefined);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    setSuccess(null);
    setLoading(true);

    try {
      const result = await updateNameAction(name);
      if (result.success) {
        setSuccess(result.message ?? 'Nombre actualizado correctamente.');
      } else {
        setError(result.error);
      }
    } catch {
      setError('Error del servidor. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="font-headline text-xl text-on-surface mb-4">
        Información Personal
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          id="profile-name"
          label="Nombre"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={error}
          maxLength={100}
          required
        />
        {success && (
          <p role="status" className="font-body text-[13px] text-primary">
            {success}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center min-h-11 px-5 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {loading ? 'Guardando…' : 'Guardar Nombre'}
        </button>
      </form>
    </Card>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const result = await changePasswordAction({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      if (result.success) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setSuccess(
          result.message ?? 'Contraseña actualizada correctamente.'
        );
      } else {
        const field = result.field;
        if (
          field === 'currentPassword' ||
          field === 'newPassword' ||
          field === 'confirmPassword'
        ) {
          setFieldErrors({ [field]: result.error });
        } else {
          setError(result.error);
        }
      }
    } catch {
      setError('Error del servidor. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="font-headline text-xl text-on-surface mb-4">Seguridad</h2>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          id="current-password"
          type="password"
          label="Contraseña actual"
          name="currentPassword"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          error={fieldErrors.currentPassword}
          autoComplete="current-password"
          required
        />
        <Input
          id="new-password"
          type="password"
          label="Nueva contraseña"
          name="newPassword"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          error={fieldErrors.newPassword}
          autoComplete="new-password"
          required
        />
        <Input
          id="confirm-password"
          type="password"
          label="Confirmar contraseña"
          name="confirmPassword"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={fieldErrors.confirmPassword}
          autoComplete="new-password"
          required
        />

        {error && (
          <p role="alert" className="font-body text-[13px] text-error">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="font-body text-[13px] text-primary">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center min-h-11 px-5 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {loading ? 'Actualizando…' : 'Actualizar Contraseña'}
        </button>
      </form>
    </Card>
  );
}
