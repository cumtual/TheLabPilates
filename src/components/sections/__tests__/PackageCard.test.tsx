import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import { PackageCard } from '../PackageCard';
import { getPricingGridClass } from '../pricing-grid';
import { toPackageCardView } from '@/lib/subscription/package-view';
import { LEGACY_PRICING, dbNameOf } from '@/db/__tests__/fixtures/pricing-legacy';

/**
 * La tarjeta conserva el diseño actual (SPEC-SPECIAL-PACKAGES §9): con los 5 paquetes de
 * hoy, el HTML es idéntico al que generaba `Pricing.tsx` antes de leer la BD, salvo las
 * protecciones contra desbordes (`line-clamp-2`, `truncate`, `min-w-0`, `title`).
 */

const SESSIONS: Record<string, number> = { 'Lab Pass': 1, 'Lab Entry': 4, 'Lab Practice': 8, 'Lab Progress': 12, 'Open Lab': 30 };

const legacyViews = LEGACY_PRICING.map((legacy, index) =>
  toPackageCardView({
    id: `p${index}`,
    name: dbNameOf(legacy.name),
    kind: 'standard',
    guest: legacy.premium,
    sessions: SESSIONS[dbNameOf(legacy.name)],
    price: Number(legacy.price.replace(',', '')),
    validityDays: null,
    guestCredits: 0,
    shortDescription: legacy.tagline,
    features: [...legacy.features],
    isFeatured: legacy.premium,
  })
);

/** Quita las protecciones nuevas para comparar con el HTML original. */
function withoutOverflowGuards(html: string): string {
  return html
    .replace(/ class="truncate min-w-0"/g, '')
    .replace(/ line-clamp-2(?=[ "])/g, '')
    .replace(/ title="[^"]*"/g, '');
}

function cardsOf(html: string): string {
  const start = html.indexOf('<div class="grid');
  return html.slice(start, html.lastIndexOf('</div></section>'));
}

describe('PackageCard', () => {
  it('con los 5 paquetes actuales reproduce exactamente las tarjetas de la landing', () => {
    const legacy = readFileSync(join(process.cwd(), 'src/components/sections/__tests__/fixtures/pricing-legacy.html'), 'utf8');
    const html = renderToStaticMarkup(
      <div className={getPricingGridClass(legacyViews.length)}>
        {legacyViews.map((view) => (
          <PackageCard key={view.id} pkg={view} />
        ))}
      </div>
    );
    expect(withoutOverflowGuards(html)).toBe(cardsOf(legacy));
  });

  it('destacado: fondo warm-wood, escala, badge PREMIUM e ícono all_inclusive; normal: check', () => {
    const html = renderToStaticMarkup(<PackageCard pkg={legacyViews[4]} />);
    expect(html).toContain('bg-warm-wood');
    expect(html).toContain('scale-105');
    expect(html).toContain('PREMIUM');
    expect(html).toContain('all_inclusive');
    expect(renderToStaticMarkup(<PackageCard pkg={legacyViews[0]} />)).toContain('>check<');
  });

  it('protege contra desbordes: descripción en 2 líneas y beneficios truncados con title', () => {
    render(<PackageCard pkg={{ ...legacyViews[1], shortDescription: 'x'.repeat(49), features: ['Beneficio largo de 24 ch'] }} />);
    expect(screen.getByText('x'.repeat(49)).className).toContain('line-clamp-2');
    const feature = screen.getByText('Beneficio largo de 24 ch');
    expect(feature.className).toContain('truncate');
    expect(feature.getAttribute('title')).toBe('Beneficio largo de 24 ch');
  });

  it('nunca muestra más de 4 beneficios', () => {
    render(<PackageCard pkg={{ ...legacyViews[1], features: ['a', 'b', 'c', 'd', 'e'] }} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('muestra el badge de invitados de un especial y permite reemplazar el botón', () => {
    render(<PackageCard pkg={{ ...legacyViews[1], guestBadge: '+2 Invitados' }} action={<button type="button">Comprar</button>} />);
    expect(screen.getByText('+2 Invitados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comprar' })).toBeInTheDocument();
    expect(screen.queryByText('ELEGIR')).not.toBeInTheDocument();
  });
});
