import { RegisterScreen } from '@/components/cafeteria/RegisterScreen';
import { loadRegisterData } from '@/modules/cafeteria/presentation/queries';

export const dynamic = 'force-dynamic';

/** Caja de la barra (SPEC-CAFETERIA §8.1). El layout ya exige el rol `barra`. */
export default async function BarraRegisterPage() {
  const data = await loadRegisterData();
  return (
    <div className="space-y-4">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface">Caja</h1>
      <RegisterScreen data={data} />
    </div>
  );
}
