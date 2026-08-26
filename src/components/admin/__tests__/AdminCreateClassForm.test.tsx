import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminCreateClassForm } from '../AdminCreateClassForm';

// Mock the server action
vi.mock('@/actions/admin', () => ({
  adminCreateClassAction: vi.fn(),
}));

// Mock next/link as a simple anchor passthrough
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const mockCoaches = [
  { id: 'coach-1', username: 'Ana Coach', email: 'ana@test.com' },
  { id: 'coach-2', username: 'Luis Coach', email: 'luis@test.com' },
];

/** Helper: fills the form and submits to open the confirmation modal */
function fillAndSubmit(options: {
  coachId?: string;
  date?: string;
  capacity?: string;
  classType: string;
  customName?: string;
}) {
  fireEvent.change(screen.getByLabelText(/coach/i), { target: { value: options.coachId ?? 'coach-1' } });
  fireEvent.change(screen.getByLabelText(/fecha y hora/i), { target: { value: options.date ?? '2099-12-25T10:00' } });
  fireEvent.change(screen.getByLabelText(/capacidad/i), { target: { value: options.capacity ?? '10' } });
  fireEvent.change(screen.getByLabelText(/tipo de clase/i), { target: { value: options.classType } });

  if (options.customName) {
    const customNameInput = screen.getByLabelText(/nombre de la clase/i);
    fireEvent.change(customNameInput, { target: { value: options.customName } });
  }

  // Submit via the submit button click (since form has no role="form")
  fireEvent.click(screen.getByRole('button', { name: /crear clase/i }));
}

describe('AdminCreateClassForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Campo condicional "Nombre de la clase" (Req 2.1, 2.2)', () => {
    it('muestra el campo cuando se selecciona "personalizada"', () => {
      render(<AdminCreateClassForm coaches={mockCoaches} />);

      const typeSelect = screen.getByLabelText(/tipo de clase/i);
      fireEvent.change(typeSelect, { target: { value: 'personalizada' } });

      const customNameInput = screen.getByLabelText(/nombre de la clase/i);
      expect(customNameInput).toBeInTheDocument();
      expect(customNameInput).toHaveAttribute('maxLength', '100');
      expect(customNameInput).toBeRequired();
    });

    it('oculta el campo cuando se selecciona "yoga"', () => {
      render(<AdminCreateClassForm coaches={mockCoaches} />);

      // First select personalizada to show the field
      const typeSelect = screen.getByLabelText(/tipo de clase/i);
      fireEvent.change(typeSelect, { target: { value: 'personalizada' } });
      expect(screen.getByLabelText(/nombre de la clase/i)).toBeInTheDocument();

      // Then select yoga — field should disappear
      fireEvent.change(typeSelect, { target: { value: 'yoga' } });
      expect(screen.queryByLabelText(/nombre de la clase/i)).not.toBeInTheDocument();
    });

    it('no muestra el campo inicialmente (ningún tipo seleccionado)', () => {
      render(<AdminCreateClassForm coaches={mockCoaches} />);

      expect(screen.queryByLabelText(/nombre de la clase/i)).not.toBeInTheDocument();
    });
  });

  describe('Limpieza de valor al cambiar tipo (Req 2.4)', () => {
    it('oculta campo y limpia valor al cambiar de "personalizada" a "barre"', () => {
      render(<AdminCreateClassForm coaches={mockCoaches} />);

      const typeSelect = screen.getByLabelText(/tipo de clase/i);

      // Select personalizada and type a custom name
      fireEvent.change(typeSelect, { target: { value: 'personalizada' } });
      const customNameInput = screen.getByLabelText(/nombre de la clase/i);
      fireEvent.change(customNameInput, { target: { value: 'Clase inauguración' } });
      expect(customNameInput).toHaveValue('Clase inauguración');

      // Switch to barre
      fireEvent.change(typeSelect, { target: { value: 'barre' } });

      // Field should be hidden
      expect(screen.queryByLabelText(/nombre de la clase/i)).not.toBeInTheDocument();

      // Switch back to personalizada — field should be empty
      fireEvent.change(typeSelect, { target: { value: 'personalizada' } });
      const newInput = screen.getByLabelText(/nombre de la clase/i);
      expect(newInput).toHaveValue('');
    });
  });

  describe('Modal muestra nombre personalizado (Req 6.1)', () => {
    it('muestra el nombre personalizado en el modal de confirmación', async () => {
      render(<AdminCreateClassForm coaches={mockCoaches} />);

      fillAndSubmit({ classType: 'personalizada', customName: 'Clase Especial Navidad' });

      // The modal should show the custom name in the "Tipo:" row
      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Clase Especial Navidad')).toBeInTheDocument();
      });
    });
  });

  describe('Modal muestra etiqueta mapeada para tipo predefinido (Req 6.2)', () => {
    it('muestra "Yoga" en el modal para tipo yoga', async () => {
      render(<AdminCreateClassForm coaches={mockCoaches} />);

      fillAndSubmit({ classType: 'yoga' });

      // Scope assertion to the modal dialog to avoid matching the select option
      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Yoga')).toBeInTheDocument();
      });
    });

    it('muestra "Mat Pilates" en el modal para tipo mat_pilates', async () => {
      render(<AdminCreateClassForm coaches={mockCoaches} />);

      fillAndSubmit({ classType: 'mat_pilates', coachId: 'coach-2' });

      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Mat Pilates')).toBeInTheDocument();
      });
    });

    it('muestra "Barre" en el modal para tipo barre', async () => {
      render(<AdminCreateClassForm coaches={mockCoaches} />);

      fillAndSubmit({ classType: 'barre' });

      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Barre')).toBeInTheDocument();
      });
    });
  });
});
