'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      suppressHydrationWarning
      className={`fixed top-0 left-0 right-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white shadow-sm py-4'
          : 'bg-transparent py-6'
      }`}
    >
      <div className="flex justify-between items-center px-6 md:px-[24px] max-w-[1280px] mx-auto">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Image
            alt="The Lab Pilates Logo"
            className="h-8 md:h-10 w-auto object-contain"
            src="/images/TheLabLogo.png"
            width={80}
            height={60}
          />
        </div>

        <nav className="hidden md:flex items-center gap-10">
          <a
            className="font-body text-label-caps font-semibold uppercase tracking-[0.1em] text-on-surface-variant hover:text-primary transition-colors duration-300"
            href="#filosofia"
          >
            Filosofia
          </a>
          <a
            className="font-body text-label-caps font-semibold uppercase tracking-[0.1em] text-on-surface-variant hover:text-primary transition-colors duration-300"
            href="#paquetes"
          >
            Membresias
          </a>
          <a
            className="font-body text-label-caps font-semibold uppercase tracking-[0.1em] text-on-surface-variant hover:text-primary transition-colors duration-300"
            href="#ubicacion"
          >
            Ubicación
          </a>
        </nav>

        <Link href="/soon" className="bg-soft-charcoal text-plaster-white px-6 py-3 font-body text-label-caps font-semibold uppercase tracking-[0.1em] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm hover:shadow-md cursor-pointer">
          ACCESO
        </Link>
      </div>
    </header>
  )
}
