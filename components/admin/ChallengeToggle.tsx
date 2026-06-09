'use client'

// Small client component for the inline active/guest toggles on the
// admin challenge list. Calls PATCH and refreshes the router on success.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ChallengeToggleProps {
  challengeId: string
  field: 'isActive' | 'isGuestAllowed'
  value: boolean
  label: string
}

export default function ChallengeToggle({
  challengeId,
  field,
  value,
  label,
}: ChallengeToggleProps) {
  const router = useRouter()
  const [optimistic, setOptimistic] = useState(value)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    const next = !optimistic
    setOptimistic(next)
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/challenges?id=${challengeId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
      })
      if (!res.ok) {
        setOptimistic(optimistic)
      } else {
        router.refresh()
      }
    } catch {
      setOptimistic(optimistic)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      title={label}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed ${
        optimistic ? 'bg-indigo-600' : 'bg-white/10'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          optimistic ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
