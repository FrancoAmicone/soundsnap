'use client'

// =====================================================================
// SoundSnap — ChallengeGrid
// =====================================================================
// Client component. Receives the full challenge list server-side, then
// filters/sorts it in the browser. No re-fetch needed.
// =====================================================================

import { useState, useMemo } from 'react'
import ChallengeCard from '@/components/ui/ChallengeCard'

export interface ChallengeItem {
  id: string
  title: string
  description: string | null
  genre_tag: string | null
  decade_tag: string | null
  cover_image_url: string | null
  is_guest_allowed: boolean
  challenge_type: string
  play_count?: number
}

interface ChallengeGridProps {
  challenges: ChallengeItem[]
}

type FilterType = 'all' | 'artist' | 'playlist'
type SortKey = 'recent' | 'popular'

const TYPE_LABELS: Record<FilterType, string> = {
  all: 'Todos',
  artist: 'Artistas',
  playlist: 'Playlists',
}

const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Recientes',
  popular: 'Más jugados',
}

const GENRE_COLORS: Record<string, { active: string; inactive: string }> = {
  rock:       { active: 'bg-red-500 text-white',     inactive: 'bg-red-500/10 text-red-400 hover:bg-red-500/20' },
  pop:        { active: 'bg-pink-500 text-white',    inactive: 'bg-pink-500/10 text-pink-400 hover:bg-pink-500/20' },
  jazz:       { active: 'bg-amber-500 text-white',   inactive: 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' },
  electronic: { active: 'bg-cyan-500 text-white',    inactive: 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20' },
  latin:      { active: 'bg-orange-500 text-white',  inactive: 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20' },
  'hip-hop':  { active: 'bg-purple-500 text-white',  inactive: 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20' },
  indie:      { active: 'bg-lime-500 text-black',    inactive: 'bg-lime-500/10 text-lime-400 hover:bg-lime-500/20' },
  metal:      { active: 'bg-zinc-400 text-black',    inactive: 'bg-zinc-400/10 text-zinc-400 hover:bg-zinc-400/20' },
}

function genreColors(genre: string, active: boolean) {
  const entry = GENRE_COLORS[genre.toLowerCase()]
  if (!entry) return active ? 'bg-indigo-500 text-white' : 'bg-white/8 text-white/50 hover:bg-white/12'
  return active ? entry.active : entry.inactive
}

export default function ChallengeGrid({ challenges }: ChallengeGridProps) {
  const [typeFilter, setTypeFilter] = useState<FilterType>('all')
  const [genreFilter, setGenreFilter] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('recent')
  const [search, setSearch] = useState('')

  // Unique genres — normalized to lowercase to avoid duplicates
  const genres = useMemo(() => {
    const set = new Set<string>()
    for (const c of challenges) {
      if (c.genre_tag) set.add(c.genre_tag.toLowerCase())
    }
    return [...set].sort()
  }, [challenges])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return challenges
      .filter((c) => {
        if (typeFilter === 'artist' && c.challenge_type !== 'artist') return false
        if (typeFilter === 'playlist' && c.challenge_type === 'artist') return false
        if (genreFilter && c.genre_tag?.toLowerCase() !== genreFilter) return false
        if (q && !c.title.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        if (sortKey === 'popular') {
          return (b.play_count ?? 0) - (a.play_count ?? 0)
        }
        return 0 // server already sorted by created_at desc
      })
  }, [challenges, typeFilter, genreFilter, search, sortKey])

  if (challenges.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-16 text-center">
        <p className="text-4xl opacity-10">♪</p>
        <p className="mt-4 text-sm text-white/30">No hay challenges disponibles aún.</p>
      </div>
    )
  }

  return (
    <div>
      {/* ── Search bar ──────────────────────────────────────────────── */}
      <div className="mb-4 relative">
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
          <svg className="h-4 w-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar challenge…"
          className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-4 text-sm text-white placeholder-white/30 outline-none transition focus:border-indigo-500/60 focus:bg-white/8 focus:ring-1 focus:ring-indigo-500/40"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute inset-y-0 right-3 flex items-center text-white/30 hover:text-white/60 transition-colors"
            aria-label="Limpiar búsqueda"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {/* Type pills */}
        {(['all', 'artist', 'playlist'] as FilterType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              typeFilter === t
                ? 'bg-indigo-500 text-white'
                : 'bg-white/8 text-white/50 hover:bg-white/12'
            }`}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}

        {/* Separator */}
        {genres.length > 0 && <span className="h-4 w-px bg-white/10" aria-hidden />}

        {/* Genre pills */}
        {genres.map((g) => (
          <button
            key={g}
            onClick={() => setGenreFilter(genreFilter === g ? null : g)}
            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${genreColors(g, genreFilter === g)}`}
          >
            {g}
          </button>
        ))}

        {/* Spacer + sort pills */}
        <span className="ml-auto flex items-center gap-1.5">
          {(['recent', 'popular'] as SortKey[]).map((s) => (
            <button
              key={s}
              onClick={() => setSortKey(s)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                sortKey === s
                  ? 'bg-white/15 text-white'
                  : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
              }`}
            >
              {SORT_LABELS[s]}
            </button>
          ))}
        </span>
      </div>

      {/* ── Grid ────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-white/30">
          No hay challenges con ese filtro.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((c) => (
            <ChallengeCard
              key={c.id}
              id={c.id}
              title={c.title}
              description={c.description}
              genreTag={c.genre_tag}
              decadeTag={c.decade_tag}
              coverImageUrl={c.cover_image_url}
              isGuestAllowed={c.is_guest_allowed}
              challengeType={c.challenge_type}
              playCount={c.play_count}
            />
          ))}
        </div>
      )}
    </div>
  )
}
