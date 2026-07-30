'use client'

import { useState } from 'react'
import Link from 'next/link'

const COMING_SOON = true // Cambiar a false cuando las clases estén disponibles

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']

const classes = [
  { time: '07:00 AM - 08:00 AM', name: 'Lab Flow', instructor: 'Ana G.' },
  { time: '09:30 AM - 10:30 AM', name: 'Foundation', instructor: 'Carlos R.' },
  { time: '06:00 PM - 07:00 PM', name: 'Core Lab', instructor: 'Elena M.' },
]

export default function Schedule() {
  const [activeDay, setActiveDay] = useState(0)

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
      </div>

      {COMING_SOON ? (
        <div className="text-center py-20">
          <span className="material-symbols-outlined text-primary text-[48px] mb-6 block opacity-60">
            schedule
          </span>
          <p className="font-headline text-2xl md:text-3xl text-soft-charcoal mb-4">
            Próximamente
          </p>
          <p className="text-[16px] text-on-surface-variant max-w-md mx-auto">
            Estamos preparando los horarios para ti. Muy pronto podrás reservar tu clase.
          </p>
        </div>
      ) : (
        <>
          {/* Day Picker */}
          <div className="flex overflow-x-auto pb-6 mb-10 gap-4 no-scrollbar justify-center">
            {days.map((day, index) => (
              <button
                key={day}
                onClick={() => setActiveDay(index)}
                className={`px-6 py-2 rounded-full text-[12px] font-semibold tracking-widest transition-all cursor-pointer ${
                  activeDay === index
                    ? 'bg-primary text-white'
                    : 'border border-surface-dim text-on-surface-variant hover:border-primary'
                }`}
              >
                {day}
              </button>
            ))}
          </div>

          {/* Class Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classes.map((cls) => (
              <div
                key={cls.name}
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
                  <h4 className="font-headline text-xl mb-1">{cls.name}</h4>
                  <p className="text-sm text-on-surface-variant/80">
                    Instructor: {cls.instructor}
                  </p>
                </div>
                <Link href="/login" className="mt-2 py-2 px-4 border border-primary text-primary text-[10px] font-semibold tracking-widest hover:bg-primary hover:text-white transition-all uppercase cursor-pointer inline-block">
                  Reservar
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
