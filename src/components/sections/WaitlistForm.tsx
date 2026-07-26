'use client'

import { useState } from 'react'

export default function WaitlistForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Error al enviar')
      }

      setStatus('success')
      setName('')
      setEmail('')
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Error al enviar. Intenta de nuevo.')
    }
  }

  if (status === 'success') {
    return (
      <div className="space-y-4 max-w-md">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">check_circle</span>
          <p className="font-headline text-xl text-soft-charcoal">¡Te registraste!</p>
        </div>
        <p className="text-[16px] text-on-surface-variant">
          Te notificaremos cuando abramos. Gracias por tu interés.
        </p>
      </div>
    )
  }

  return (
    <form className="space-y-6 max-w-md" onSubmit={handleSubmit}>
      <div>
        <label className="text-[10px] font-semibold text-on-surface-variant mb-2 block tracking-widest uppercase">
          Nombre Completo
        </label>
        <input
          className="w-full bg-transparent border-b border-primary py-3 focus:outline-none focus:border-warm-wood transition-colors"
          placeholder="Tu nombre..."
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-on-surface-variant mb-2 block tracking-widest uppercase">
          Email
        </label>
        <input
          className="w-full bg-transparent border-b border-primary py-3 focus:outline-none focus:border-warm-wood transition-colors"
          placeholder="correo@ejemplo.com"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      {status === 'error' && (
        <p className="text-sm text-error">{errorMessage}</p>
      )}

      <button
        className="bg-soft-charcoal text-plaster-white px-10 py-4 text-[12px] font-semibold tracking-widest hover:bg-primary transition-colors mt-4 uppercase cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        type="submit"
        disabled={status === 'loading'}
      >
        {status === 'loading' ? 'ENVIANDO...' : 'LISTA DE ESPERA'}
      </button>
    </form>
  )
}
