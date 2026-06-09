// =====================================================================
// SoundSnap — Login page
// =====================================================================
// Server Component that:
//   - Redirects already-authenticated users back home (or to ?next=)
//   - Reads ?next= and ?error= search params
//   - Renders the LoginForm client island (Google OAuth button)
// =====================================================================

import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import LoginForm from './LoginForm'

export const metadata: Metadata = {
  title: 'Entrar — SoundSnap',
}

interface PageProps {
  searchParams: Promise<{ next?: string; error?: string }>
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { next, error } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Already logged in — redirect away
  if (user) {
    const safeNext = next && next.startsWith('/') ? next : '/'
    redirect(safeNext)
  }

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      {/* ── Top nav ────────────────────────────────────────────────── */}
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
          <Link
            href="/"
            className="text-sm font-bold tracking-tight text-white"
          >
            Sound<span className="text-indigo-400">Snap</span>
          </Link>
        </div>
      </header>

      {/* ── Centered login card ───────────────────────────────────── */}
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-8">
          {/* Title */}
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Entrar
            </h1>
            <p className="mt-2 text-sm text-white/50">
              Guardá tu score y desbloqueá Intermediate y Hard.
            </p>
          </div>

          {/* Error from OAuth callback */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-center text-sm text-red-300">
              {decodeURIComponent(error)}
            </div>
          )}

          <Suspense
            fallback={
              <div className="h-12 animate-pulse rounded-xl bg-white/5" />
            }
          >
            <LoginForm next={next} />
          </Suspense>

          {/* Continue as guest */}
          <div className="text-center">
            <Link
              href="/"
              className="text-xs text-white/30 transition-colors hover:text-white/60"
            >
              ← Continuar sin cuenta
            </Link>
          </div>

          {/* Benefits */}
          <ul className="space-y-2 rounded-xl border border-white/10 bg-white/[.03] px-5 py-4 text-xs text-white/50">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Guardá tu puntaje en el leaderboard global</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Jugá las dificultades Intermediate y Hard</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Accedé a todos los challenges</span>
            </li>
          </ul>
        </div>
      </main>
    </div>
  )
}
