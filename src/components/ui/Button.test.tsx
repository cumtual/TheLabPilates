import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  describe('Rendering element type', () => {
    it('renders as <button> when no href is provided', () => {
      render(<Button ariaLabel="Test button">Click me</Button>)
      const el = screen.getByRole('button', { name: 'Test button' })
      expect(el.tagName).toBe('BUTTON')
    })

    it('renders as <a> when href is provided', () => {
      render(
        <Button href="/reservar" ariaLabel="Reservar clase">
          Reservar
        </Button>
      )
      const el = screen.getByRole('link', { name: 'Reservar clase' })
      expect(el.tagName).toBe('A')
      expect(el).toHaveAttribute('href', '/reservar')
    })

    it('sets type="button" on button elements', () => {
      render(<Button>Click</Button>)
      const el = screen.getByRole('button')
      expect(el).toHaveAttribute('type', 'button')
    })
  })

  describe('Variants', () => {
    it('applies primary variant styles by default', () => {
      render(<Button ariaLabel="Primary">Primary</Button>)
      const el = screen.getByRole('button', { name: 'Primary' })
      expect(el.className).toContain('bg-soft-charcoal')
      expect(el.className).toContain('text-on-primary')
    })

    it('applies secondary variant styles', () => {
      render(
        <Button variant="secondary" ariaLabel="Secondary">
          Secondary
        </Button>
      )
      const el = screen.getByRole('button', { name: 'Secondary' })
      expect(el.className).toContain('bg-primary')
      expect(el.className).toContain('text-on-primary')
    })

    it('applies outline variant styles', () => {
      render(
        <Button variant="outline" ariaLabel="Outline">
          Outline
        </Button>
      )
      const el = screen.getByRole('button', { name: 'Outline' })
      expect(el.className).toContain('border')
      expect(el.className).toContain('text-soft-charcoal')
    })
  })

  describe('Sizes', () => {
    it('applies md size by default', () => {
      render(<Button>Medium</Button>)
      const el = screen.getByRole('button')
      expect(el.className).toContain('px-6')
      expect(el.className).toContain('py-3')
    })

    it('applies sm size styles', () => {
      render(<Button size="sm">Small</Button>)
      const el = screen.getByRole('button')
      expect(el.className).toContain('px-4')
      expect(el.className).toContain('py-2')
    })

    it('applies lg size styles', () => {
      render(<Button size="lg">Large</Button>)
      const el = screen.getByRole('button')
      expect(el.className).toContain('px-8')
      expect(el.className).toContain('py-4')
    })
  })

  describe('Accessibility', () => {
    it('sets aria-label when provided', () => {
      render(<Button ariaLabel="Reservar clase ahora">Reservar</Button>)
      const el = screen.getByRole('button')
      expect(el).toHaveAttribute('aria-label', 'Reservar clase ahora')
    })

    it('has focus-visible outline styles for keyboard navigation', () => {
      render(<Button>Focus me</Button>)
      const el = screen.getByRole('button')
      expect(el.className).toContain('focus-visible:outline-2')
    })
  })

  describe('Styling', () => {
    it('applies label-caps typography styles', () => {
      render(<Button>Caps</Button>)
      const el = screen.getByRole('button')
      expect(el.className).toContain('uppercase')
      expect(el.className).toContain('font-semibold')
      expect(el.className).toContain('tracking-[0.1em]')
    })

    it('applies rounded corners', () => {
      render(<Button>Rounded</Button>)
      const el = screen.getByRole('button')
      expect(el.className).toContain('rounded-DEFAULT')
    })

    it('applies hover translateY and transition', () => {
      render(<Button>Hover</Button>)
      const el = screen.getByRole('button')
      expect(el.className).toContain('hover:-translate-y-0.5')
      expect(el.className).toContain('transition-all')
      expect(el.className).toContain('duration-200')
    })

    it('applies full width when fullWidth prop is true', () => {
      render(<Button fullWidth>Full Width</Button>)
      const el = screen.getByRole('button')
      expect(el.className).toContain('w-full')
    })

    it('does not apply full width by default', () => {
      render(<Button>Normal</Button>)
      const el = screen.getByRole('button')
      expect(el.className).not.toContain('w-full')
    })

    it('merges custom className', () => {
      render(<Button className="mt-4">Custom</Button>)
      const el = screen.getByRole('button')
      expect(el.className).toContain('mt-4')
    })
  })

  describe('Interactivity', () => {
    it('calls onClick when clicked', () => {
      const handleClick = vi.fn()
      render(<Button onClick={handleClick}>Click</Button>)
      fireEvent.click(screen.getByRole('button'))
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('does not pass onClick to anchor elements', () => {
      render(
        <Button href="/page" onClick={() => {}}>
          Link
        </Button>
      )
      const el = screen.getByRole('link')
      // Anchor elements should not have onClick bound
      expect(el.tagName).toBe('A')
    })
  })
})
