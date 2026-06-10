// =====================================================================
// SoundSnap — Challenge detail page
// =====================================================================
// Server Component. Fetches challenge data from Supabase, determines
// if the viewer is a guest, then renders:
//   - Cover + metadata
//   - DifficultySelector (client island)
//   - LeaderboardTabs (client island)
// =====================================================================

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import DifficultySelector from '@/components/ui/DifficultySelector'
import LeaderboardTabs from '@/components/leaderboard/LeaderboardTabs'
import UserMenu from '@/components/ui/UserMenu'

interface PageProps {
  params: Promise<{ id: string }>
}

// ── Metadata ──────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('challenges')
    .select('title, description')
    .eq('id', id)
    .single()

  return {
    title: data ? `${data.title} — SoundSnap` : 'Challenge — SoundSnap',
    description: data?.description ?? undefined,
  }
}

// ── Page ──────────────────────────────────────────────────────────────

export default async function ChallengePage({ params }: PageProps) {
  const { id } = await params

  // Auth state (determines guest restrictions)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isGuest = !user

  // Challenge data via service client so we get ALL active challenges
  // (the public anon client can also read active challenges, but service
  //  client is simpler here since we already have it for the service layer)
  const service = createServiceClient()
  const { data: challenge, error } = await service
    .from('challenges')
    .select(
      'id, title, description, genre_tag, decade_tag, cover_image_url, is_guest_allowed, is_active',
    )
    .eq('id', id)
    .eq('is_active', true)
    .single()

  if (error || !challenge) {
    notFound()
  }

  // Guests can only access guest-allowed challenges → show login CTA
  if (isGuest && !challenge.is_guest_allowed) {
    return (
      <div className="flex min-h-screen flex-col bg-black text-white">
        <header className="border-b border-white/10">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link
              href="/"
              className="text-sm font-bold tracking-tight text-white"
            >
              Sound<span className="text-indigo-400">Snap</span>
            </Link>
            <UserMenu loginNext={`/challenge/${id}`} />
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-sm space-y-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-2xl">
              🔒
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">
                Challenge solo para usuarios registrados
              </h1>
              <p className="mt-2 text-sm text-white/50">
                Iniciá sesión con Google para acceder a este challenge y a todas
                las dificultades.
              </p>
            </div>
            <Link
              href={`/login?next=${encodeURIComponent(`/challenge/${id}`)}`}
              className="inline-block w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Entrar con Google
            </Link>
            <Link
              href="/"
              className="block text-xs text-white/30 hover:text-white/60"
            >
              ← Volver al inicio
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const GENRE_COLORS: Record<string, string> = {
    rock: 'bg-red-500/20 text-red-300',
    pop: 'bg-pink-500/20 text-pink-300',
    jazz: 'bg-amber-500/20 text-amber-300',
    electronic: 'bg-cyan-500/20 text-cyan-300',
    latin: 'bg-orange-500/20 text-orange-300',
    'hip-hop': 'bg-purple-500/20 text-purple-300',
    indie: 'bg-lime-500/20 text-lime-300',
  }
  const genreClass = challenge.genre_tag
    ? (GENRE_COLORS[challenge.genre_tag.toLowerCase()] ?? 'bg-white/10 text-white/50')
    : null

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="text-sm font-bold tracking-tight text-white">
            Sound<span className="text-indigo-400">Snap</span>
          </Link>
          <UserMenu loginNext={`/challenge/${id}`} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:gap-10">
          {/* ── Left column (leaderboard etc.) — comes second on mobile ── */}
          <div className="order-2 space-y-6 sm:space-y-8 lg:order-1">
            {/* Back */}
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 4L6 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Volver
            </Link>

            {/* Challenge header */}
            <div className="flex gap-4 sm:gap-6">
              {/* Cover */}
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-white/5 sm:h-36 sm:w-36">
                {challenge.cover_image_url ? (
                  <img
                    src={challenge.cover_image_url}
                    alt={challenge.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-5xl opacity-10">
                    ♪
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div className="flex min-w-0 flex-col justify-center gap-2">
                <h1 className="text-xl font-bold text-white sm:text-3xl">
                  {challenge.title}
                </h1>
                {challenge.description && (
                  <p className="text-sm text-white/50">{challenge.description}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {challenge.genre_tag && genreClass && (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${genreClass}`}
                    >
                      {challenge.genre_tag}
                    </span>
                  )}
                  {challenge.decade_tag && (
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-white/50">
                      {challenge.decade_tag}
                    </span>
                  )}
                  {challenge.is_guest_allowed && (
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-white/30">
                      Free
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Leaderboard */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Leaderboard</h2>
              <LeaderboardTabs challengeId={id} />
            </div>
          </div>

          {/* ── Right column (play) — comes first on mobile ─────────── */}
          <div className="order-1 lg:order-2 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-white/10 bg-white/[.03] p-6 space-y-5">
              <h2 className="text-lg font-semibold text-white">Jugar</h2>
              <DifficultySelector challengeId={id} isGuest={isGuest} />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
