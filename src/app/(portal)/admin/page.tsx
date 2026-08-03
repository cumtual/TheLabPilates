import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { payments, openClasses, users } from '@/db/schema';
import { eq, count, gte, and } from 'drizzle-orm';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';

async function getDashboardMetrics() {
  const now = new Date();

  const [pendingPayments] = await db
    .select({ value: count() })
    .from(payments)
    .where(eq(payments.confirmed, false));

  const [upcomingClasses] = await db
    .select({ value: count() })
    .from(openClasses)
    .where(
      and(
        eq(openClasses.status, 'scheduled'),
        gte(openClasses.classDate, now)
      )
    );

  const [totalUsers] = await db
    .select({ value: count() })
    .from(users);

  return {
    pendingPayments: pendingPayments?.value ?? 0,
    upcomingClasses: upcomingClasses?.value ?? 0,
    totalUsers: totalUsers?.value ?? 0,
  };
}

export default async function AdminDashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/login');

  const metrics = await getDashboardMetrics();

  return (
    <div className="space-y-6">
      <h1 className="font-headline text-headline-lg-mobile md:text-headline-lg text-on-surface py-6">
        Panel de Administración
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/admin/payments" className="block">
          <Card className="hover:shadow-md transition-shadow">
            <div className="space-y-2">
              <p className="font-body text-sm text-outline">Pagos Pendientes</p>
              <p className="font-body text-3xl font-bold text-primary">
                {metrics.pendingPayments}
              </p>
              <p className="font-body text-xs text-on-surface-variant">
                Por confirmar
              </p>
            </div>
          </Card>
        </Link>

        <Link href="/admin/classes" className="block">
          <Card className="hover:shadow-md transition-shadow">
            <div className="space-y-2">
              <p className="font-body text-sm text-outline">Clases Próximas</p>
              <p className="font-body text-3xl font-bold text-primary">
                {metrics.upcomingClasses}
              </p>
              <p className="font-body text-xs text-on-surface-variant">
                Programadas
              </p>
            </div>
          </Card>
        </Link>

        <Link href="/admin/users" className="block">
          <Card className="hover:shadow-md transition-shadow">
            <div className="space-y-2">
              <p className="font-body text-sm text-outline">Usuarios Registrados</p>
              <p className="font-body text-3xl font-bold text-primary">
                {metrics.totalUsers}
              </p>
              <p className="font-body text-xs text-on-surface-variant">
                Total en el sistema
              </p>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
