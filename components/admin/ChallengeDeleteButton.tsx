'use client'

// Hard-delete button with confirmation for the admin challenge list.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ChallengeDeleteButtonProps {
  challengeId: string
  challengeTitle: string
}

export default function ChallengeDeleteButton({
  challengeId,
  challengeTitle,
}: ChallengeDeleteButtonProps) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/challenges?id=${challengeId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al borrar')
      setConfirming(false)
    } finally {
      setLoading(false)
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-2">
        <span className="text-xs text-red-400">
          ¿Borrar &ldquo;{challengeTitle}&rdquo;? Esto elimina todos los scores.
        </span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="rounded px-2 py-0.5 text-xs font-medium text-red-400 ring-1 ring-red-400/40 hover:bg-red-500/10 disabled:opacity-50"
        >
          {loading ? 'Borrando…' : 'Confirmar'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs text-white/40 hover:text-white"
        >
          Cancelar
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded p-1 text-white/20 transition-colors hover:text-red-400"
      title="Eliminar challenge"
    >
      🗑
    </button>
  )
}
