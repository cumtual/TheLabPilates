import type { MenuItem, MenuSection } from '@/modules/cafeteria/domain/category-tree';
import { formatPesos } from '@/modules/cafeteria/domain/money';

/**
 * Menú público (SPEC-CAFETERIA §7, §8.3): padre › subcategoría › productos.
 * Solo nombre, precio y disponibilidad; nada de cortesías.
 */

function Item({ item }: { item: MenuItem }) {
  return (
    <li className={`flex items-baseline gap-2 py-1.5 ${item.isAvailable ? '' : 'opacity-50'}`}>
      <span className="font-body text-[15px] text-soft-charcoal">{item.name}</span>
      {!item.isAvailable && <span className="text-[11px] font-semibold uppercase tracking-widest text-outline">Agotado</span>}
      <span className="flex-1 border-b border-dotted border-outline-variant/70 translate-y-[-4px]" aria-hidden="true" />
      <span className="font-body text-[15px] text-soft-charcoal whitespace-nowrap">{formatPesos(item.priceCents)}</span>
    </li>
  );
}

/** En bebidas, columnas Frío / Caliente (una debajo de otra en móvil); en comida, lista simple. */
function ItemList({ items, usesTemperature }: { items: MenuItem[]; usesTemperature: boolean }) {
  if (!usesTemperature) {
    return (
      <ul>
        {items.map((item) => (
          <Item key={item.id} item={item} />
        ))}
      </ul>
    );
  }
  const groups = [
    ['cold', 'Frío'],
    ['hot', 'Caliente'],
  ] as const;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {groups.map(([temperature, label]) => {
        const group = items.filter((i) => i.temperature === temperature);
        return group.length === 0 ? null : (
          <div key={temperature}>
            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">{label}</h4>
            <ul>
              {group.map((item) => (
                <Item key={item.id} item={item} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function PublicMenu({ sections }: { sections: MenuSection[] }) {
  if (sections.length === 0) {
    return <p className="text-[15px] text-on-surface-variant">Muy pronto publicaremos nuestro menú.</p>;
  }
  return (
    <div className="space-y-12">
      {sections.map((section) => (
        <section key={section.id} aria-labelledby={`menu-${section.id}`}>
          <h2 id={`menu-${section.id}`} className="font-headline text-3xl text-soft-charcoal mb-4">
            {section.name}
          </h2>
          {section.items.length > 0 && (
            <div className="mb-6 rounded-xl bg-surface p-5 shadow-sm">
              <ItemList items={section.items} usesTemperature={section.usesTemperature} />
            </div>
          )}
          <div className="grid gap-6 md:grid-cols-2">
            {section.subcategories.map((sub) => (
              <div key={sub.id} className="rounded-xl bg-surface p-5 shadow-sm">
                <h3 className="font-headline text-xl text-soft-charcoal mb-2">{sub.name}</h3>
                <ItemList items={sub.items} usesTemperature={section.usesTemperature} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
