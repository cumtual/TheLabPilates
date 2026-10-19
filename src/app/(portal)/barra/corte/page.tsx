import { ClosingForm } from '@/components/cafeteria/ClosingForm';
import { loadOpenShift } from '@/modules/cafeteria/presentation/queries';

export const dynamic = 'force-dynamic';

/** Corte de caja de la barra (SPEC-CAFETERIA D6, §8.1). */
export default async function BarraClosingPage() {
  const shift = await loadOpenShift();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-headline text-headline-lg-mobile text-on-surface">Corte de caja</h1>
        <p className="mt-1 font-body text-body-md text-on-surface-variant">
          Pedidos cobrados desde el último corte. El admin confirma que recibió el efectivo.
        </p>
      </div>
      <ClosingForm shift={shift} />
    </div>
  );
}
