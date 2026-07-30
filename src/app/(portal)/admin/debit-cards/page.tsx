import { redirect } from 'next/navigation';
import { isNull } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { debitCards } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { DebitCardManagement } from '@/components/admin/DebitCardManagement';

export default async function AdminDebitCardsPage() {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/login');

  const cards = await db
    .select()
    .from(debitCards)
    .where(isNull(debitCards.deletedAt))
    .orderBy(desc(debitCards.createdAt));

  const serializedCards = cards.map((card) => ({
    id: card.id,
    cardName: card.cardName,
    cardNumber: card.cardNumber,
    cardBank: card.cardBank,
    active: card.active ?? false,
  }));

  return (
    <div className="space-y-6">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface py-6">
        Tarjetas de Débito
      </h1>
      <p className="font-body text-sm text-on-surface-variant">
        Administra las tarjetas a las que tus clientes pueden transferir. Solo una puede estar activa a la vez.
      </p>
      <DebitCardManagement cards={serializedCards} />
    </div>
  );
}
