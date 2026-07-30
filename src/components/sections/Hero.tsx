'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function Hero() {
  const heroBgRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)

    const handleScroll = () => {
      if (!heroBgRef.current) return
      const scrolled = window.pageYOffset
      heroBgRef.current.style.transform = `translateY(${scrolled * 0.3}px) scale(${1 + scrolled * 0.0002})`
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <section className="relative h-screen min-h-[700px] w-full flex items-center justify-center overflow-hidden pt-20">
      {/* Background Image with Parallax */}
      <div
        ref={heroBgRef}
        className="absolute inset-0 z-0 scale-105 transition-transform duration-[2s]"
      >
        <Image
          src="/images/hero-studio.png"
          alt="The Lab Studio Interior"
          fill
          priority
          quality={90}
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent" />
      </div>

      {/* Hero Content */}
      <div className="relative z-10 text-center max-w-4xl px-[24px]">
        <h1 className="font-headline text-[40px] md:text-[80px] text-soft-charcoal mb-10 leading-[1.1] tracking-tighter">
          Un espacio para <br />
          <span className="italic font-normal">conectar</span> contigo
        </h1>
        <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
          <Link href="/login" className="bg-soft-charcoal text-plaster-white px-10 py-5 text-[12px] font-semibold tracking-[0.2em] hover:bg-primary transition-colors uppercase cursor-pointer">
            RESERVAR LAB PASS
          </Link>
          <a
            className="text-[12px] font-semibold tracking-widest text-soft-charcoal border-b border-soft-charcoal pb-1 hover:text-primary hover:border-primary transition-all uppercase"
            href="#filosofia"
          >
            EXPLORAR EL MÉTODO
          </a>
        </div>
      </div>

      {/* Scroll Indicator */}
      {mounted && (
        <div className="absolute bottom-10 left-0 right-0 mx-auto w-fit animate-bounce flex flex-col items-center gap-2">
          <span className="text-[10px] tracking-widest opacity-60 uppercase font-semibold">
            SCROLL
          </span>
          <span className="material-symbols-outlined text-[18px]">expand_more</span>
        </div>
      )}
    </section>
  )
}
