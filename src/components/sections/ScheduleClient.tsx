'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { WeekClass } from './Schedule';
import type { ScheduleDay } from './schedule-utils';

interface ScheduleClientProps {
  classes: WeekClass[];
  days: ScheduleDay[];
  currentDayIndex: number;
}

export function ScheduleClient({ classes, days, currentDayIndex }: ScheduleClientProps) {
  const [activeDay, setActiveDay] = useState(currentDayIndex);

  const dayClasses = classes.filter((cls) => cls.dayIndex === activeDay);

  return (
    <section className="py-section-gap px-[24px] max-w-7xl mx-auto" id="horarios">
      {/* Header */}
      <div className="text-center mb-12">
        <p className="text-[12px] font-semibold text-primary mb-4 uppercase tracking-widest">
          Tu Tiempo
        </p>
        <h2 className="font-headline text-3xl md:text-[54px] leading-tight">
          Horarios de Clase
        </h2>
        <p className="text-[14px] text-on-surface-variant mt-4 max-w-md mx-auto">
          Clases programadas para esta semana
        </p>
      </div>

      {classes.length === 0 ? (
        <div className="min-h-[280px] flex flex-col items-center justify-center text-center py-16">
          <span className="material-symbols-outlined text-primary text-[48px] mb-6 block opacity-60">
            event_busy
          </span>
          <p className="font-headline text-2xl text-soft-charcoal mb-3">
            Sin clases esta semana
          </p>
          <p className="text-[15px] text-on-surface-variant max-w-md mx-auto">
            Por el momento no hay clases programadas. ¡Vuelve pronto para ver los próximos horarios!
          </p>
        </div>
      ) : (
        <>
          {/* Day Picker (rolling 7 days, swipeable) */}
          <div className="flex overflow-x-auto snap-x snap-mandatory pb-6 mb-10 gap-3 no-scrollbar justify-start md:justify-center">
            {days.map((day, index) => {
              const hasClasses = classes.some((cls) => cls.dayIndex === index);
              const isActive = activeDay === index;

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setActiveDay(index)}
                  aria-pressed={isActive}
                  className={`relative snap-start shrink-0 min-h-11 min-w-11 px-5 py-2 rounded-full flex flex-col items-center justify-center transition-all ${
                    isActive
                      ? 'bg-primary text-white shadow-md'
                      : hasClasses
                        ? 'border border-primary/40 text-primary hover:bg-primary/10'
                        : 'border border-surface-dim text-on-surface-variant/60'
                  }`}
                >
                  <span className="text-[10px] font-semibold tracking-widest uppercase">
                    {day.label}
                  </span>
                  <span className="text-[13px] font-semibold leading-tight">{day.sub}</span>
                  {hasClasses && !isActive && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Classes for selected day */}
          {dayClasses.length === 0 ? (
            <div className="min-h-[280px] flex flex-col items-center justify-center text-center py-12">
              <span className="material-symbols-outlined text-outline text-[36px] mb-4 block opacity-50">
                event_available
              </span>
              <p className="text-[15px] text-on-surface-variant">
                Aún no hay clases disponibles para este día.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {dayClasses.map((cls) => {
                const isSoldOut = cls.spotsLeft <= 0;

                return (
                  <div
                    key={cls.id}
                    className="bg-surface-container-low p-6 rounded-xl border border-surface-dim/50 flex flex-col gap-4 hover:shadow-md transition-all"
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-[11px] font-semibold tracking-widest text-primary uppercase">
                        {cls.time}
                      </span>
                      <span className="material-symbols-outlined text-primary text-sm">
                        schedule
                      </span>
                    </div>

                    <div>
                      <h4 className="font-headline text-xl mb-1">{cls.classType}</h4>
                      <p className="text-sm text-on-surface-variant/80">
                        Coach: {cls.coachName}
                      </p>
                    </div>

                    {isSoldOut ? (
                      <span className="inline-flex items-center self-start px-2.5 py-1 rounded-sm bg-error/10 text-error text-[10px] font-semibold tracking-widest uppercase">
                        Sold out
                      </span>
                    ) : (
                      <p className="text-[12px] font-semibold text-on-surface-variant">
                        {cls.spotsLeft} {cls.spotsLeft === 1 ? 'lugar disponible' : 'lugares disponibles'}
                      </p>
                    )}

                    <Link
                      href="/login"
                      aria-disabled={isSoldOut}
                      tabIndex={isSoldOut ? -1 : undefined}
                      className={`mt-2 py-2.5 px-4 border text-[10px] font-semibold tracking-widest uppercase inline-block text-center rounded-sm transition-all ${
                        isSoldOut
                          ? 'border-outline-variant text-outline pointer-events-none opacity-50'
                          : 'border-primary text-primary hover:bg-primary hover:text-white'
                      }`}
                    >
                      Reservar
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
