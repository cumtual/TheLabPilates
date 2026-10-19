import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { buildMenuTree } from '@/modules/cafeteria/domain/category-tree';
import { sampleCategories, sampleProducts } from '@/modules/cafeteria/domain/__tests__/fixtures';
import { PublicMenu } from '../PublicMenu';

/** Menú público (SPEC-CAFETERIA §7, §8.3, TASK-CF-MENU-01). */

const sections = buildMenuTree(
  sampleCategories.map((c) => (c.id === 'sandwiches' ? { ...c, isActive: false } : c)),
  sampleProducts.map((p) => (p.id === 'brownie' ? { ...p, isAvailable: false } : p))
);

describe('PublicMenu', () => {
  it('padre › subcategoría › productos en orden; ramas inactivas no aparecen', () => {
    render(<PublicMenu sections={sections} />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Bebidas', 'Comida']);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Café', 'Frappés', 'Postres']);
    expect(screen.queryByText('Panini')).not.toBeInTheDocument();
  });

  it('bebidas separan Frías y Calientes; comida es una lista simple', () => {
    render(<PublicMenu sections={sections} />);
    const cafe = screen.getByRole('heading', { name: 'Café' }).parentElement!;
    expect(within(cafe).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['Frías', 'Calientes']);
    const postres = screen.getByRole('heading', { name: 'Postres' }).parentElement!;
    expect(within(postres).queryByRole('heading', { level: 4 })).toBeNull();
  });

  it('precio $42.50; agotado atenuado; sin cortesías', () => {
    const { container } = render(<PublicMenu sections={sections} />);
    expect(screen.getByText('Americano').parentElement).toHaveTextContent('$42.50');
    const brownie = screen.getByText('Brownie').parentElement!;
    expect(brownie).toHaveTextContent('Agotado');
    expect(brownie.className).toContain('opacity-50');
    expect(container.textContent).not.toMatch(/cortes/i);
  });
});
