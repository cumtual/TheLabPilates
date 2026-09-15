import Link from 'next/link';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '@/db';
import { specialEvents, openClasses, users } from '@/db/schema';
import { getEventClassAvailable } from '@/lib/events/capacity';
import { TIMEZONE, formatFullDateTime, formatTimeWithMeridiem } from '@/lib/utils/date';
import { getClassDisplayName } from '@/lib/utils/class-type';

function formatClassTimeRange(classStart: Date): string {
  const classEnd = new Date(classStart.getTime() + 60 * 60 * 1000);
  return `${formatTimeWithMeridiem(classStart)} - ${formatTimeWithMeridiem(classEnd)}`;
}

/** Etiqueta de fecha (sin hora) en calendario America/Mexico_City. */
function toMexicoCityDateLabel(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/**
 * Rango de fecha del evento en formato CDMX 12h (A.M./P.M.).
 * Si inicio y fin caen el mismo día, muestra la fecha una sola vez con el rango de horas.
 */
function formatEventDateRange(start: Date, end: Date): string {
  const startLabel = toMexicoCityDateLabel(start);
  const endLabel = toMexicoCityDateLabel(end);
  if (startLabel === endLabel) {
    return `${startLabel}, ${formatTimeWithMeridiem(start)} — ${formatTimeWithMeridiem(end)}`;
  }
  return `${formatFullDateTime(start)} — ${formatFullDateTime(end)}`;
}

/**
 * Landing section: renders the single active special event.
 * Returns null when there is no active event (or it's hidden), leaving NO DOM node.
 */
export default async function SpecialEvent() {
  // Defensive: the landing is prerendered at build time. If the special_events
  // table is not yet available (migration pending) or a transient DB error
  // occurs, the section simply renders nothing instead of breaking the page.
  let event: Awaited<ReturnType<typeof db.query.specialEvents.findFirst>>;
  try {
    event = await db.query.specialEvents.findFirst({
      where: and(eq(specialEvents.status, 'active'), eq(specialEvents.showOnLanding, true)),
      orderBy: (table, { asc: ascFn }) => [ascFn(table.startDate)],
    });
  } catch {
    return null;
  }

  if (!event) return null;

  const classes = await db
    .select({
      id: openClasses.id,
      classType: openClasses.classType,
      customName: openClasses.customName,
      classDate: openClasses.classDate,
      coachName: users.username,
    })
    .from(openClasses)
    .leftJoin(users, eq(openClasses.coachUserId, users.id))
    .where(and(eq(openClasses.specialEventId, event.id), eq(openClasses.status, 'scheduled')))
    .orderBy(asc(openClasses.classDate));

  const classesWithAvailability = await Promise.all(
    classes.map(async (cls) => ({
      ...cls,
      spotsLeft: await getEventClassAvailable(cls.id),
    }))
  );

  const startDate = event.startDate ? new Date(event.startDate) : null;
  const endDate = event.endDate ? new Date(event.endDate) : null;

  return (
    <section className="py-section-gap bg-surface-cream" id="evento-especial">
      <div className="max-w-7xl mx-auto px-[24px]">
        {/* Header */}
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 mb-6 rounded-full bg-warm-wood/15 text-warm-wood text-[11px] font-semibold tracking-widest uppercase">
            Evento Especial
          </span>
          <h2 className="font-headline text-3xl md:text-[48px] mb-6">{event.title}</h2>
          <p className="text-[16px] text-on-surface-variant max-w-2xl mx-auto">
            {event.shortDescription}
          </p>
          {startDate && endDate && (
            <p className="text-[14px] font-semibold text-primary mt-4 uppercase tracking-widest">
              {formatEventDateRange(startDate, endDate)}
            </p>
          )}
          <p className="font-headline text-[32px] mt-6">
            <span className="font-body">$</span>
            {event.price} MXN
          </p>
        </div>

        {/* Classes */}
        {classesWithAvailability.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {classesWithAvailability.map((cls) => {
              const isSoldOut = cls.spotsLeft <= 0;
              const date = cls.classDate ? new Date(cls.classDate) : null;

              return (
                <div
                  key={cls.id}
                  className="bg-surface-container-low p-6 rounded-xl border border-surface-dim/50 flex flex-col gap-4 hover:shadow-md transition-all"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      {date && (
                        <span className="block text-[10px] font-semibold tracking-widest text-on-surface-variant uppercase mb-1">
                          {toMexicoCityDateLabel(date)}
                        </span>
                      )}
                      <span className="text-[11px] font-semibold tracking-widest text-primary uppercase">
                        {date ? formatClassTimeRange(date) : 'Horario por confirmar'}
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-primary text-sm">schedule</span>
                  </div>

                  <div>
                    <h4 className="font-headline text-xl mb-1">
                      {getClassDisplayName(cls.classType, cls.customName)}
                    </h4>
                    {cls.coachName && (
                      <p className="text-sm text-on-surface-variant/80">Coach: {cls.coachName}</p>
                    )}
                  </div>

                  {isSoldOut ? (
                    <span className="inline-flex items-center self-start px-2.5 py-1 rounded-sm bg-error/10 text-error text-[10px] font-semibold tracking-widest uppercase">
                      Sold out
                    </span>
                  ) : (
                    <p className="text-[12px] font-semibold text-on-surface-variant">
                      {cls.spotsLeft}{' '}
                      {cls.spotsLeft === 1 ? 'lugar disponible' : 'lugares disponibles'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/login"
            className="inline-block py-4 px-10 bg-soft-charcoal text-white text-[12px] font-semibold tracking-widest uppercase transition-all hover:bg-primary hover:-translate-y-0.5 hover:shadow-lg"
          >
            Reservar lugar
          </Link>
        </div>
      </div>
    </section>
  );
}
