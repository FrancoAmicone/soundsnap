'use client'

// =====================================================================
// SoundSnap — ChallengeEditForm
// =====================================================================
// Client wrapper around ChallengeForm for the edit page.
// Calls PATCH /api/admin/challenges?id=... on submit.
// =====================================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ChallengeForm, {
  type ChallengeFormValues,
} from '@/components/admin/ChallengeForm'

interface ChallengeEditFormProps {
  challengeId: string
  initial: Partial<ChallengeFormValues>
}

export default function ChallengeEditForm({
  challengeId,
  initial,
}: ChallengeEditFormProps) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(values: ChallengeFormValues) {
    setSubmitting(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/admin/challenges?id=${challengeId}`, {
        method: 'PATCH',
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
      setSaved(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {saved && !submitting && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
          <p className="text-sm text-green-400">✓ Challenge guardado correctamente.</p>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
      <ChallengeForm
        initial={initial}
        onSubmit={handleSubmit}
        submitting={submitting}
      />
    </div>
  )
}
