import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttendanceSheet } from '../AttendanceSheet';

vi.mock('@/actions/coach', () => ({
  updateAttendanceAction: vi.fn(),
  completeClassAction: vi.fn(),
}));

const enrollments = [
  {
    enrollmentId: 'enrollment-1',
    status: 'attended' as const,
    studentName: 'Ana Alumna',
    studentEmail: 'ana@test.com',
    userId: 'user-1',
  },
];

describe('AttendanceSheet — clase finalizada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows editing and saving attendance for a completed class within the day', () => {
    render(
      <AttendanceSheet
        classId="class-1"
        enrollments={enrollments}
        isCompleted={true}
        attendanceClosed={false}
      />
    );

    // Toggles remain enabled
    expect(screen.getByRole('button', { name: /como asistió/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /como ausente/i })).not.toBeDisabled();

    // Save button is available
    expect(screen.getByRole('button', { name: /guardar asistencia/i })).toBeInTheDocument();

    // The old blocking message is gone
    expect(screen.queryByText(/no puede modificarse/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/puedes modificar la asistencia y guardarla/i)
    ).toBeInTheDocument();

    // The finalize action stays hidden once completed
    expect(screen.queryByRole('button', { name: /finalizar clase/i })).not.toBeInTheDocument();
  });

  it('is read-only for a completed class after the day is closed', () => {
    render(
      <AttendanceSheet
        classId="class-1"
        enrollments={enrollments}
        isCompleted={true}
        attendanceClosed={true}
      />
    );

    expect(screen.getByRole('button', { name: /como asistió/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /como ausente/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /guardar asistencia/i })).not.toBeInTheDocument();
    expect(screen.getByText(/periodo para registrar asistencia/i)).toBeInTheDocument();
  });

  it('keeps the finalize button and save action for an open, not completed class', () => {
    render(
      <AttendanceSheet
        classId="class-1"
        enrollments={enrollments}
        isCompleted={false}
        attendanceClosed={false}
      />
    );

    expect(screen.getByRole('button', { name: /guardar asistencia/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /finalizar clase/i })).toBeInTheDocument();
  });
});
