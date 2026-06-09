'use client'

// =====================================================================
// SoundSnap — LoginForm
// =====================================================================
// Client island for the login page. Triggers Supabase signInWithOAuth
// (Google provider only in MVP). On success the provider redirects to
// /auth/callback?code=...&next=... which exchanges the code and
// finally redirects to `next`.
// =====================================================================

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface LoginFormProps {
  next?: string
}

export default function LoginForm({ next }: LoginFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGoogle() {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      // Build redirect URL with optional `next` forwarded
      const safeNext = next && next.startsWith('/') ? next : '/'
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`

      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      if (signInError) throw signInError
      // On success the browser is redirected to Google, then back to
      // /auth/callback. We never reach a "logged in" state in this
      // component, so no need to clear `loading`.
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo iniciar sesión.',
      )
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
        ) : (
          <GoogleIcon />
        )}
        {loading ? 'Conectando…' : 'Continuar con Google'}
      </button>

      {error && (
        <p className="text-center text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96L3.97 7.3C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}
