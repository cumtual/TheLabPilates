'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface GuestTooltipProps {
  /** Origin type of the guest enrollment */
  origin: 'user' | 'admin';
  /** Name of the person who registered the guest */
  registeredByName?: string;
  /** Email of the person who registered the guest (used for admin origin) */
  registeredByEmail?: string;
  /** Content to wrap (e.g., GuestBadge and name) */
  children: React.ReactNode;
}

function getInviterText(
  origin: 'user' | 'admin',
  registeredByName?: string,
  registeredByEmail?: string
): string {
  if (origin === 'admin') {
    const adminIdentifier = registeredByName || registeredByEmail;
    if (!adminIdentifier) {
      return 'Invitado por: Información no disponible';
    }
    return `Invitado por: Admin (${adminIdentifier})`;
  }

  if (!registeredByName) {
    return 'Invitado por: Información no disponible';
  }
  return `Invitado por: ${registeredByName}`;
}

export function GuestTooltip({
  origin,
  registeredByName,
  registeredByEmail,
  children,
}: GuestTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipId = useRef(`guest-tooltip-${Math.random().toString(36).slice(2, 9)}`).current;

  const inviterText = getInviterText(origin, registeredByName, registeredByEmail);

  const handleMouseEnter = useCallback(() => {
    setShowTooltip(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowTooltip(false);
  }, []);

  const handleClick = useCallback(() => {
    // On mobile, show modal instead of tooltip
    setShowModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    if (!showModal) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowModal(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [showModal]);

  return (
    <>
      {/* Desktop: tooltip on hover; Mobile: tap to open modal */}
      <div
        ref={containerRef}
        className="relative inline-flex items-center min-h-11 min-w-11 cursor-pointer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
        tabIndex={0}
        role="button"
        aria-describedby={showTooltip ? tooltipId : undefined}
        aria-label={inviterText}
      >
        {children}

        {/* Desktop tooltip (hidden on mobile via CSS) */}
        {showTooltip && (
          <div
            id={tooltipId}
            role="tooltip"
            className="hidden md:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 px-3 py-2 bg-soft-charcoal text-on-primary font-body text-sm rounded-DEFAULT shadow-lg whitespace-nowrap pointer-events-none animate-[fade-in_0.15s_ease-out]"
          >
            {inviterText}
            {/* Tooltip arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-soft-charcoal" />
          </div>
        )}
      </div>

      {/* Mobile modal (portal) */}
      {showModal &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-soft-charcoal/50 backdrop-blur-sm md:hidden"
            onClick={handleCloseModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="guest-tooltip-modal-title"
          >
            <div
              className="w-full max-w-sm bg-surface rounded-lg shadow-xl p-6 animate-[fade-in_0.2s_ease-out]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                id="guest-tooltip-modal-title"
                className="font-headline text-headline-lg-mobile text-on-surface mb-3"
              >
                Información del invitado
              </h3>
              <p className="font-body text-body-md text-on-surface-variant">
                {inviterText}
              </p>
              <button
                type="button"
                onClick={handleCloseModal}
                className="mt-4 w-full min-h-11 px-4 py-2.5 bg-primary text-on-primary font-body text-body-md font-semibold rounded-DEFAULT hover:bg-primary/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
