import { CourtesyGrantList } from '@/components/cafeteria/CourtesyGrantList';
import { GrantCourtesyForm } from '@/components/cafeteria/GrantCourtesyForm';
import { getMexicoCityYmd } from '@/lib/utils/date';
import { loadAdminMenu, loadCourtesyGrants } from '@/modules/cafeteria/presentation/queries';

export const dynamic = 'force-dynamic';

/** Regalar cortesías a usuarios (SPEC-CAFETERIA D11, §8.2). Solo admin (layout). */
export default async function AdminCourtesyGrantsPage() {
  const [menu, grants] = await Promise.all([loadAdminMenu(), loadCourtesyGrants()]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-headline text-headline-lg-mobile text-on-surface">Regalar cortesías</h1>
        <p className="mt-1 font-body text-body-md text-on-surface-variant">
          El usuario las ve en su panel y las pide en la barra. El cupo mensual de coaches es aparte.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <GrantCourtesyForm menu={menu} today={getMexicoCityYmd(new Date())} />
        <CourtesyGrantList grants={grants} />
      </div>
    </div>
  );
}
