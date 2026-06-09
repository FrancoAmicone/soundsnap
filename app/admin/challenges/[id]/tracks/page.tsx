// =====================================================================
// SoundSnap — Admin: track preview
// =====================================================================
// Server Component. Loads the challenge, fetches tracks from Deezer
// and renders them in a client TrackPreviewList for audio playback.
// =====================================================================

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPlaylistTracks, getArtistTracks } from '@/lib/deezer'
import TrackPreviewList from '@/components/admin/TrackPreviewList'
import type { DeezerTrack } from '@/types'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TracksPreviewPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  interface ChallengeRow {
    id: string
    title: string
    challenge_type: string
    deezer_playlist_id: string | null
    deezer_artist_id: string | null
    pinned_tracks: unknown[] | null
  }

  const { data: raw, error } = await supabase
    .from('challenges')
    .select(
      'id, title, challenge_type, deezer_playlist_id, deezer_artist_id, pinned_tracks',
    )
    .eq('id', id)
    .single()

  if (error || !raw) notFound()
  const c = raw as unknown as ChallengeRow

  // Fetch tracks from the appropriate source
  let tracks: DeezerTrack[] = []
  let fetchError: string | null = null

  try {
    if (c.challenge_type === 'manual') {
      tracks = (c.pinned_tracks as DeezerTrack[]) ?? []
    } else if (c.challenge_type === 'artist') {
      if (c.deezer_artist_id) {
        const result = await getArtistTracks(c.deezer_artist_id, 50)
        tracks = result.tracks
      }
    } else {
      // playlist (default)
      if (c.deezer_playlist_id) {
        const result = await getPlaylistTracks(c.deezer_playlist_id, 50)
        tracks = result.tracks
      }
    }

    // For playlist/artist types, merge pinned_tracks (extra additions)
    if (c.challenge_type !== 'manual' && c.pinned_tracks) {
      const pinnedExtra = (c.pinned_tracks as DeezerTrack[]).filter(
        (pt) => !tracks.some((t) => t.id === pt.id),
      )
      tracks = [...tracks, ...pinnedExtra]
    }
  } catch (err) {
    fetchError =
      err instanceof Error ? err.message : 'No se pudieron cargar los tracks'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            Preview: {c.title}
          </h1>
          <p className="mt-1 text-sm text-white/40">
            {tracks.length} tracks con preview · clip de 5s
          </p>
        </div>
        <Link
          href={`/admin/challenges/${id}`}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 transition-colors hover:border-white/20 hover:text-white"
        >
          ← Editar challenge
        </Link>
      </div>

      {fetchError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4">
          <p className="text-sm text-red-400">{fetchError}</p>
        </div>
      )}

      {!fetchError && tracks.length === 0 && (
        <div className="rounded-xl border border-white/10 px-6 py-12 text-center">
          <p className="text-white/30">
            No se encontraron tracks con preview para esta fuente.
          </p>
          <Link
            href={`/admin/challenges/${id}`}
            className="mt-4 inline-block text-sm text-indigo-400 hover:text-indigo-300"
          >
            Editar la fuente →
          </Link>
        </div>
      )}

      {tracks.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[.02] px-4 py-2">
          <TrackPreviewList tracks={tracks} />
        </div>
      )}
    </div>
  )
}
