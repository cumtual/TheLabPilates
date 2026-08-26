import type { GuestOrigin } from '@/lib/types/guest';

export interface GuestBadgeProps {
  /** Guest's full name */
  guestName: string;
  /** How the guest was registered */
  origin: GuestOrigin;
  /** Additional CSS classes */
  className?: string;
}

const originStyles: Record<GuestOrigin, string> = {
  user: 'bg-primary/15 text-primary border-primary/30',
  admin: 'bg-warm-wood/15 text-secondary border-warm-wood/30',
};

/**
 * Badge displayed next to a guest's name in the coach attendance list.
 * Color-coded by origin: user-registered (primary/teal) vs admin-registered (warm-wood/amber).
 * Touch target: min 44x44px. Text: min 14px.
 */
export function GuestBadge({ guestName, origin, className = '' }: GuestBadgeProps) {
  return (
    <span
      role="status"
      aria-label={`${guestName} es invitado registrado por ${origin === 'user' ? 'usuario titular' : 'administrador'}`}
      className={[
        'inline-flex items-center',
        'min-h-[44px] min-w-[44px] px-3 py-2',
        'font-body text-[14px] font-semibold leading-none',
        'rounded-full border',
        'whitespace-nowrap',
        originStyles[origin],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      [Invitado]
    </span>
  );
}
