'use client'

// =====================================================================
// SoundSnap — Admin: create challenge
// =====================================================================
// Client page because ChallengeForm is a client component. On submit
// calls POST /api/admin/challenges and redirects to the edit page so
// the admin can see the result and do further edits.
// =====================================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ChallengeForm, {
  type ChallengeFormValues,
} from '@/components/admin/ChallengeForm'
import PlaylistValidator from '@/components/admin/PlaylistValidator'

export default function NewChallengePage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Track the current form state for PlaylistValidator
  const [formSnapshot, setFormSnapshot] = useState<Pick<
    ChallengeFormValues,
    'challengeType' | 'deezerPlaylistId' | 'deezerArtistId'
  > | null>(null)

  async function handleSubmit(values: ChallengeFormValues) {
    setSubmitting(true)
    setError(null)
    setFormSnapshot({
      challengeType: values.challengeType,
      deezerPlaylistId: values.deezerPlaylistId,
      deezerArtistId: values.deezerArtistId,
    })
    try {
      const res = await fetch('/api/admin/challenges', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: values.title,
          description: values.description,
          genreTag: values.genreTag,
          decadeTag: values.decadeTag,
          challengeType: values.challengeType,
          deezerPlaylistId: values.deezerPlaylistId,
          deezerArtistId: values.deezerArtistId,
          pinnedTracks: values.pinnedTracks,
          excludedTrackIds: values.excludedTrackIds,
          isGuestAllowed: values.isGuestAllowed,
          isActive: values.isActive,
          trackCountEasy: values.trackCountEasy,
          trackCountMedium: values.trackCountMedium,
          trackCountHard: values.trackCountHard,
          coverImageUrl: values.coverImageUrl,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      router.push(`/admin/challenges/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el challenge')
      setSubmitting(false)
    }
  }

  const validatorType =
    formSnapshot?.challengeType === 'artist' ? 'artist' : 'playlist'
  const validatorId =
    formSnapshot?.challengeType === 'artist'
      ? formSnapshot.deezerArtistId
      : formSnapshot?.deezerPlaylistId

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Nuevo challenge</h1>
        <p className="mt-1 text-sm text-white/40">
          Completá el formulario y guardá. El challenge se crea como activo por defecto.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/[.02] p-6">
        <ChallengeForm onSubmit={handleSubmit} submitting={submitting} />
      </div>

      {/* Show PlaylistValidator after first submit attempt */}
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
