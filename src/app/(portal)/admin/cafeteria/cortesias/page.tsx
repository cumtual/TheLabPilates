import { CourtesyRules } from '@/components/cafeteria/CourtesyRules';
import { loadCourtesyRules } from '@/modules/cafeteria/presentation/queries';

export const dynamic = 'force-dynamic';

/** Reglas del cupo mensual de coaches y correos del corte (SPEC-CAFETERIA D3, §8.2). */
export default async function AdminCourtesyRulesPage() {
  const rules = await loadCourtesyRules();
  return (
    <div className="space-y-4">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface">Cortesías de coaches</h1>
      <CourtesyRules rules={rules} />
    </div>
  );
}
