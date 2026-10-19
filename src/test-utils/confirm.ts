import { expect } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Mock } from 'vitest';

interface ConfirmOptions {
  /** Abre el diálogo (p. ej. un clic en el botón de la acción). Se llama dos veces. */
  trigger: () => void;
  /** Mock de la acción crítica (Server Action o callback). */
  action: Mock;
  /** Texto del botón que confirma dentro del `Modal`. */
  confirmLabel: string | RegExp;
  cancelLabel?: string | RegExp;
}

/**
 * Regla D9 (SPEC-CAFETERIA §8.4): una acción crítica abre el `Modal` y no se ejecuta
 * hasta confirmar. Cancelar cierra el diálogo sin llamar a nada.
 */
export async function expectConfirmBeforeAction({
  trigger,
  action,
  confirmLabel,
  cancelLabel = 'Cancelar',
}: ConfirmOptions): Promise<void> {
  trigger();
  const first = await screen.findByRole('dialog');
  expect(action).not.toHaveBeenCalled();
  fireEvent.click(within(first).getByRole('button', { name: cancelLabel }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(action).not.toHaveBeenCalled();

  trigger();
  const second = await screen.findByRole('dialog');
  expect(action).not.toHaveBeenCalled();
  fireEvent.click(within(second).getByRole('button', { name: confirmLabel }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
}
