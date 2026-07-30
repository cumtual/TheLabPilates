'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { WeekClass } from './Schedule';

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

interface ScheduleClientProps {
  classes: WeekClass[];
  currentDayIndex: number;
}

export function ScheduleClient({ classes, currentDayIndex }: ScheduleClientProps) {
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
        <div className="text-center py-16">
          <span className="material-symbols-outlined text-primary text-[48px] mb-6 block opacity-60">
            event_busy
          </span>
          <p className="font-headline text-2xl text-soft-charcoal mb-3">
            Sin clases esta semana
          </p>
          <p className="text-[15px] text-on-surface-variant max-w-md mx-auto">
            Por el momento no hay clases programadas para esta semana. ¡Vuelve pronto para ver los próximos horarios!
          </p>
        </div>
      ) : (
        <>
          {/* Day Picker */}
          <div className="flex overflow-x-auto pb-6 mb-10 gap-3 no-scrollbar justify-start md:justify-center">
            {days.map((day, index) => {
              const hasClasses = classes.some((cls) => cls.dayIndex === index);
              return (
                <button
                  key={day}
                  onClick={() => setActiveDay(index)}
                  className={`px-5 py-2.5 rounded-full text-[11px] font-semibold tracking-widest transition-all shrink-0 ${
                    activeDay === index
                      ? 'bg-primary text-white shadow-md'
                      : hasClasses
                        ? 'border border-primary/40 text-primary hover:bg-primary/10'
                        : 'border border-surface-dim text-on-surface-variant/60'
                  }`}
                >
                  {day}
                  {hasClasses && activeDay !== index && (
                    <span className="inline-block w-1.5 h-1.5 bg-primary rounded-full ml-1.5 -mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Classes for selected day */}
          {dayClasses.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-outline text-[36px] mb-4 block opacity-50">
                event_available
              </span>
              <p className="text-[15px] text-on-surface-variant">
                No hay clases programadas para el {days[activeDay].toLowerCase()}.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {dayClasses.map((cls) => (
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
                  <Link
                    href="/login"
                    className="mt-2 py-2.5 px-4 border border-primary text-primary text-[10px] font-semibold tracking-widest hover:bg-primary hover:text-white transition-all uppercase inline-block text-center rounded-sm"
                  >
                    Reservar
                  </Link>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
