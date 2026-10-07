import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useState } from 'react';
import { PackageRulesBuilder, emptyRule, type RuleDraft } from '../PackageRulesBuilder';

/** Constructor de reglas de un paquete especial (SPEC-SPECIAL-PACKAGES §7.3). */

function Harness({ initial = [emptyRule()], onChange = vi.fn() }: { initial?: RuleDraft[]; onChange?: (r: RuleDraft[]) => void }) {
  const [rules, setRules] = useState(initial);
  return (
    <PackageRulesBuilder
      rules={rules}
      errors={{ 'rules.0.allowedClassTypes': 'Elige al menos una disciplina.' }}
      onChange={(next) => {
        setRules(next);
        onChange(next);
      }}
    />
  );
}

describe('PackageRulesBuilder', () => {
  it('las disciplinas salen de CLASS_TYPES (incluye Sculpt) y se marcan por grupo', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const group = within(screen.getByRole('group', { name: 'Grupo 1' }));
    for (const label of ['Yoga', 'Mat Pilates', 'Barre', 'Personalizada', 'Sculpt']) expect(group.getByLabelText(label)).toBeInTheDocument();

    fireEvent.click(group.getByLabelText('Mat Pilates'));
    fireEvent.click(group.getByLabelText('Barre'));
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ allowedClassTypes: ['mat_pilates', 'barre'] })]);
    expect(group.getByText('Elige al menos una disciplina.')).toBeInTheDocument();
  });

  it('«Limitar horario» muestra y oculta las horas', () => {
    render(<Harness />);
    expect(screen.queryByLabelText('Desde')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Limitar horario'));
    expect(screen.getByLabelText('Desde')).toHaveAttribute('type', 'time');
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('type', 'time');
    fireEvent.click(screen.getByLabelText('Limitar horario'));
    expect(screen.queryByLabelText('Desde')).not.toBeInTheDocument();
  });

  it('agrega y quita grupos entre 1 y 6, y suma las sesiones', () => {
    render(<Harness />);
    const add = screen.getByRole('button', { name: /Agregar grupo/ });
    expect(screen.queryByRole('button', { name: /Quitar grupo/ })).not.toBeInTheDocument();
    for (let i = 0; i < 5; i++) fireEvent.click(add);
    expect(screen.getAllByRole('group', { name: /^Grupo \d$/ })).toHaveLength(6);
    expect(add).toBeDisabled();

    fireEvent.change(screen.getAllByLabelText('Créditos')[0], { target: { value: '3' } });
    expect(screen.getByText('Sesiones del paquete: 8')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Quitar grupo/ })[0]);
    expect(screen.getAllByRole('group', { name: /^Grupo \d$/ })).toHaveLength(5);
  });
});
