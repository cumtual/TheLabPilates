import { RegisterScreen } from '@/components/cafeteria/RegisterScreen';
import { loadRegisterData } from '@/modules/cafeteria/presentation/queries';

export const dynamic = 'force-dynamic';

/** La misma caja de la barra, operada por el admin (SPEC-CAFETERIA §8.2). */
export default async function AdminRegisterPage() {
  const data = await loadRegisterData();
  return (
    <div className="space-y-4">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface">Caja</h1>
      <RegisterScreen data={data} />
    </div>
  );
}
