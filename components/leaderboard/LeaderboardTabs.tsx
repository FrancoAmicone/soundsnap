'use client'

// =====================================================================
// SoundSnap — LeaderboardTabs
// =====================================================================
// Client Component. Three tabs (Easy | Intermediate | Hard) each
// rendering its own Leaderboard server component via a dynamic import.
// The active tab is driven by URL search params so it's bookmarkable.
// =====================================================================

import { useState } from 'react'
import type { Difficulty } from '@/types'
import LeaderboardContent from './LeaderboardContent'

interface LeaderboardTabsProps {
  challengeId: string
  initialDifficulty?: Difficulty
}

const TABS: { value: Difficulty; label: string; color: string; activeClass: string }[] = [
  {
    value: 'easy',
    label: 'Easy',
    color: 'text-emerald-400',
    activeClass: 'border-emerald-500 text-emerald-400',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    color: 'text-amber-400',
    activeClass: 'border-amber-500 text-amber-400',
  },
  {
    value: 'hard',
    label: 'Hard',
    color: 'text-red-400',
    activeClass: 'border-red-500 text-red-400',
  },
]

export default function LeaderboardTabs({
  challengeId,
  initialDifficulty = 'easy',
}: LeaderboardTabsProps) {
  const [active, setActive] = useState<Difficulty>(initialDifficulty)

  return (
    <div className="space-y-4">
      {/* Tab strip — flex-1 so all tabs share width equally on any screen */}
      <div className="flex border-b border-white/10">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActive(tab.value)}
            className={`flex-1 border-b-2 -mb-px py-2 text-center text-xs font-semibold transition-colors focus:outline-none sm:text-sm ${
              active === tab.value
                ? tab.activeClass
                : 'border-transparent text-white/30 hover:text-white/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <LeaderboardContent challengeId={challengeId} difficulty={active} />
    </div>
  )
}
