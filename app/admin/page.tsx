// =====================================================================
// SoundSnap — Admin: challenge list
// =====================================================================
// Server Component. Fetches all challenges (including inactive) using
// the admin's Supabase session (RLS permits admins to see everything).
// =====================================================================

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ChallengeToggle from '@/components/admin/ChallengeToggle'
import ChallengeDeleteButton from '@/components/admin/ChallengeDeleteButton'

const TYPE_LABEL: Record<string, string> = {
  playlist: 'Playlist',
  manual: 'Manual',
  artist: 'Artista',
}

const TYPE_COLOR: Record<string, string> = {
  playlist: 'bg-blue-500/10 text-blue-400',
  manual: 'bg-purple-500/10 text-purple-400',
  artist: 'bg-pink-500/10 text-pink-400',
}

export default async function AdminPage() {
  const supabase = await createClient()

  interface ChallengeListRow {
    id: string
    title: string
    description: string | null
    genre_tag: string | null
    decade_tag: string | null
    challenge_type: string
    is_active: boolean
    is_guest_allowed: boolean
    track_count_easy: number
    track_count_medium: number
    track_count_hard: number
    cover_image_url: string | null
    created_at: string
  }

  const { data: raw, error } = await supabase
    .from('challenges')
    .select(
      'id, title, description, genre_tag, decade_tag, challenge_type, ' +
        'is_active, is_guest_allowed, ' +
        'track_count_easy, track_count_medium, track_count_hard, ' +
        'cover_image_url, created_at',
    )
    .order('created_at', { ascending: false })

  const challenges = raw as unknown as ChallengeListRow[] | null

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4">
        <p className="text-sm text-red-400">Error al cargar challenges: {error.message}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Challenges</h1>
          <p className="mt-0.5 text-sm text-white/40">
            {challenges?.length ?? 0} challenges en total
          </p>
        </div>
        <Link
          href="/admin/challenges/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
        >
          + Nuevo challenge
        </Link>
      </div>

      {/* Empty state */}
      {(!challenges || challenges.length === 0) && (
        <div className="rounded-xl border border-white/10 px-6 py-16 text-center">
          <p className="text-white/30">No hay challenges todavía.</p>
          <Link
            href="/admin/challenges/new"
            className="mt-4 inline-block text-sm text-indigo-400 hover:text-indigo-300"
          >
            Crear el primero →
          </Link>
        </div>
      )}

      {/* Challenge list */}
      {challenges && challenges.length > 0 && (
        <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[.02]">
          {challenges.map((c) => (
            <div
              key={c.id}
              className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[.03] ${
                !c.is_active ? 'opacity-50' : ''
              }`}
            >
              {/* Cover */}
              {c.cover_image_url ? (
                <img
                  src={c.cover_image_url}
                  alt={c.title}
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded-lg bg-white/5" />
              )}

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{c.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      TYPE_COLOR[c.challenge_type] ?? 'bg-white/10 text-white/50'
                    }`}
                  >
                    {TYPE_LABEL[c.challenge_type] ?? c.challenge_type}
                  </span>
                  {c.genre_tag && (
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/40">
                      {c.genre_tag}
                    </span>
                  )}
                  {c.decade_tag && (
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/40">
                      {c.decade_tag}
                    </span>
                  )}
                </div>
                {c.description && (
                  <p className="mt-0.5 truncate text-sm text-white/40">
                    {c.description}
                  </p>
                )}
                <p className="mt-1 text-xs text-white/20">
                  Easy {c.track_count_easy} · Intermediate {c.track_count_medium} · Hard {c.track_count_hard}
                </p>
              </div>

              {/* Toggles */}
              <div className="flex shrink-0 items-center gap-5">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <ChallengeToggle
                    challengeId={c.id}
                    field="isActive"
                    value={c.is_active}
                    label={c.is_active ? 'Desactivar' : 'Activar'}
                  />
                  <span className="text-xs text-white/30">Activo</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <ChallengeToggle
                    challengeId={c.id}
                    field="isGuestAllowed"
                    value={c.is_guest_allowed}
                    label={c.is_guest_allowed ? 'Deshabilitar guests' : 'Habilitar guests'}
                  />
                  <span className="text-xs text-white/30">Guests</span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/admin/challenges/${c.id}/tracks`}
                  className="rounded p-1 text-sm text-white/30 transition-colors hover:text-white/70"
                  title="Preview de tracks"
                >
                  ♫
                </Link>
                <Link
                  href={`/admin/challenges/${c.id}`}
                  className="rounded px-2 py-1 text-xs text-indigo-400 transition-colors hover:text-indigo-300"
                >
                  Editar
                </Link>
                <ChallengeDeleteButton
                  challengeId={c.id}
                  challengeTitle={c.title}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
