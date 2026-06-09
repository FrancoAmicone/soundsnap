// =====================================================================
// SoundSnap — Admin: edit challenge
// =====================================================================
// Server Component that fetches the challenge and passes the initial
// values to the client edit form.
// =====================================================================

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ChallengeEditForm from '@/components/admin/ChallengeEditForm'
import PlaylistValidator from '@/components/admin/PlaylistValidator'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditChallengePage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  interface ChallengeRow {
    id: string
    title: string
    description: string | null
    genre_tag: string | null
    decade_tag: string | null
    challenge_type: string
    deezer_playlist_id: string | null
    deezer_artist_id: string | null
    pinned_tracks: unknown[] | null
    excluded_track_ids: string[] | null
    is_guest_allowed: boolean
    is_active: boolean
    track_count_easy: number
    track_count_medium: number
    track_count_hard: number
    cover_image_url: string | null
  }

  const { data: raw, error } = await supabase
    .from('challenges')
    .select(
      'id, title, description, genre_tag, decade_tag, challenge_type, ' +
        'deezer_playlist_id, deezer_artist_id, pinned_tracks, excluded_track_ids, ' +
        'is_guest_allowed, is_active, ' +
        'track_count_easy, track_count_medium, track_count_hard, ' +
        'cover_image_url',
    )
    .eq('id', id)
    .single()

  if (error || !raw) notFound()
  const c = raw as unknown as ChallengeRow

  const initial = {
    title: c.title ?? '',
    description: c.description ?? '',
    genreTag: c.genre_tag ?? '',
    decadeTag: c.decade_tag ?? '',
    challengeType: (c.challenge_type as 'playlist' | 'manual' | 'artist') ?? 'playlist',
    deezerPlaylistId: c.deezer_playlist_id ?? '',
    deezerArtistId: c.deezer_artist_id ?? '',
    deezerArtistName: '',
    pinnedTracks: (c.pinned_tracks as never[]) ?? [],
    excludedTrackIds: (c.excluded_track_ids as string[]) ?? [],
    isGuestAllowed: c.is_guest_allowed ?? false,
    isActive: c.is_active ?? true,
    trackCountEasy: c.track_count_easy ?? 5,
    trackCountMedium: c.track_count_medium ?? 7,
    trackCountHard: c.track_count_hard ?? 10,
    coverImageUrl: c.cover_image_url ?? '',
  }

  const validatorType =
    c.challenge_type === 'artist' ? 'artist' as const : 'playlist' as const
  const validatorId =
    c.challenge_type === 'artist'
      ? (c.deezer_artist_id ?? '')
      : (c.deezer_playlist_id ?? '')

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Editar: {c.title}</h1>
          <p className="mt-1 text-xs text-white/30">{id}</p>
        </div>
        <Link
          href={`/admin/challenges/${id}/tracks`}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 transition-colors hover:border-white/20 hover:text-white"
        >
          ♫ Preview de tracks
        </Link>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[.02] p-6">
        <ChallengeEditForm challengeId={id} initial={initial} />
      </div>

      {/* Playlist / artist validation */}
      {validatorId && (
        <div className="rounded-xl border border-white/10 bg-white/[.02] p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/40">
            Validación de fuente
          </h2>
          <PlaylistValidator
            type={validatorType}
            sourceId={validatorId}
            autoValidate
          />
        </div>
      )}
    </div>
  )
}
