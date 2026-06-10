'use client'

// =====================================================================
// SoundSnap — ChallengeGrid
// =====================================================================
// Unified search: one bar filters challenges AND (when no challenge
// matches) searches Deezer artists so the user can jump straight into
// an artist session.
// =====================================================================

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ChallengeCard from '@/components/ui/ChallengeCard'
import type { ArtistSearchResult, Difficulty } from '@/types'

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
  isGuest?: boolean
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

const ARTIST_DIFFICULTIES: { value: Difficulty; label: string; desc: string }[] = [
  { value: 'easy',         label: 'Easy',         desc: '5 preguntas · Portada + MC · ×1.0' },
  { value: 'intermediate', label: 'Intermediate', desc: '7 preguntas · Sin portada · ×1.3' },
  { value: 'hard',         label: 'Hard',         desc: '10 preguntas · Artista + título · ×1.7' },
]

function genreColors(genre: string, active: boolean) {
  const entry = GENRE_COLORS[genre.toLowerCase()]
  if (!entry) return active ? 'bg-indigo-500 text-white' : 'bg-white/8 text-white/50 hover:bg-white/12'
  return active ? entry.active : entry.inactive
}

export default function ChallengeGrid({ challenges, isGuest = false }: ChallengeGridProps) {
  const router = useRouter()

  // ── Challenge filters ────────────────────────────────────────────────
  const [typeFilter, setTypeFilter] = useState<FilterType>('all')
  const [genreFilter, setGenreFilter] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('recent')
  const [search, setSearch] = useState('')

  // ── Artist search state ──────────────────────────────────────────────
  const [artistResults, setArtistResults] = useState<ArtistSearchResult[]>([])
  const [artistLoading, setArtistLoading] = useState(false)
  const [selectedArtist, setSelectedArtist] = useState<ArtistSearchResult | null>(null)
  const [artistDifficulty, setArtistDifficulty] = useState<Difficulty>('easy')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Unique genres (lowercase dedup)
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
      .sort((a, b) =>
        sortKey === 'popular' ? (b.play_count ?? 0) - (a.play_count ?? 0) : 0
      )
  }, [challenges, typeFilter, genreFilter, search, sortKey])

  // ── Artist search: fires when query ≥ 2 chars and no challenges match ─
  const searchArtists = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setArtistResults([]); return }
    setArtistLoading(true)
    try {
      const res = await fetch(`/api/search/artist?q=${encodeURIComponent(q)}&limit=6`)
      if (!res.ok) throw new Error()
      const data: { artists: ArtistSearchResult[] } = await res.json()
      setArtistResults(data.artists)
    } catch {
      setArtistResults([])
    } finally {
      setArtistLoading(false)
    }
  }, [])

  const showArtistSearch = search.trim().length >= 2 && filtered.length === 0 && !selectedArtist

  useEffect(() => {
    if (!showArtistSearch) {
      setArtistResults([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchArtists(search), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, showArtistSearch, searchArtists])

  // Clear artist selection when search changes
  useEffect(() => {
    setSelectedArtist(null)
    setArtistResults([])
  }, [search])

  function handleSelectArtist(artist: ArtistSearchResult) {
    setSelectedArtist(artist)
    setArtistResults([])
  }

  function handlePlayArtist() {
    if (!selectedArtist) return
    router.push(
      `/play?artistId=${encodeURIComponent(selectedArtist.id)}` +
      `&artistName=${encodeURIComponent(selectedArtist.name)}` +
      `&difficulty=${artistDifficulty}`,
    )
  }

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
          placeholder="Buscar challenge o artista…"
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
      <div className="mb-6 space-y-2">
        {/* Row 1: type pills + sort pills always on the same line */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'artist', 'playlist'] as FilterType[]).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  typeFilter === t ? 'bg-indigo-500 text-white' : 'bg-white/8 text-white/50 hover:bg-white/12'
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {(['recent', 'popular'] as SortKey[]).map((s) => (
              <button
                key={s}
                onClick={() => setSortKey(s)}
                className={`rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors ${
                  sortKey === s ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                }`}
              >
                {SORT_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: genre pills (only if any) */}
        {genres.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {genres.map((g) => (
              <button
                key={g}
                onClick={() => setGenreFilter(genreFilter === g ? null : g)}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${genreColors(g, genreFilter === g)}`}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Challenge grid ──────────────────────────────────────────── */}
      {filtered.length > 0 && (
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

      {/* ── Artist search results (shown when no challenges match) ───── */}
      {showArtistSearch && (
        <div className="space-y-3">
          {artistLoading && (
            <p className="py-4 text-center text-sm text-white/30">Buscando artistas…</p>
          )}

          {!artistLoading && artistResults.length > 0 && (
            <>
              <p className="text-xs text-white/30">
                No hay challenges con ese nombre — ¿querés jugar con el artista?
              </p>
              <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-neutral-900 shadow-xl">
                {artistResults.map((artist) => (
                  <li key={artist.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectArtist(artist)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
                    >
                      {artist.picture ? (
                        <img src={artist.picture} alt={artist.name} className="h-10 w-10 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="h-10 w-10 shrink-0 rounded-full bg-white/10" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-white">{artist.name}</p>
                        <p className="text-xs text-white/40">{artist.nbFan.toLocaleString()} fans</p>
                      </div>
                      <svg className="h-4 w-4 shrink-0 text-white/20" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
                        <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!artistLoading && artistResults.length === 0 && search.trim().length >= 2 && (
            <p className="py-8 text-center text-sm text-white/30">
              Sin resultados para &ldquo;{search}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* ── Artist selected: difficulty + play ──────────────────────── */}
      {selectedArtist && filtered.length === 0 && (
        <div className="space-y-4 rounded-xl border border-white/10 bg-white/[.03] p-5">
          {/* Artist banner */}
          <div className="flex items-center gap-3">
            {selectedArtist.picture ? (
              <img src={selectedArtist.picture} alt={selectedArtist.name} className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-white/10" />
            )}
            <div className="flex-1 min-w-0">
              <p className="truncate font-semibold text-white">{selectedArtist.name}</p>
              <p className="text-xs text-white/40">{selectedArtist.nbFan.toLocaleString()} fans</p>
            </div>
            <button
              onClick={() => { setSelectedArtist(null); setSearch('') }}
              className="text-white/30 hover:text-white/60 transition-colors"
              aria-label="Cambiar artista"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Difficulty pills */}
          <div className="flex gap-2">
            {ARTIST_DIFFICULTIES.map((d) => {
              const locked = isGuest && d.value !== 'easy'
              return (
                <button
                  key={d.value}
                  type="button"
                  disabled={locked}
                  onClick={() => setArtistDifficulty(d.value)}
                  title={locked ? 'Iniciá sesión para desbloquear' : d.desc}
                  className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors ${
                    locked
                      ? 'cursor-not-allowed border-white/5 text-white/20 opacity-40'
                      : artistDifficulty === d.value
                        ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                        : 'border-white/10 text-white/50 hover:border-white/20 hover:text-white'
                  }`}
                >
                  {d.label}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={handlePlayArtist}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            Jugar con {selectedArtist.name}
          </button>
        </div>
      )}

      {/* Empty state for challenge filters (when not in artist-search mode) */}
      {filtered.length === 0 && !showArtistSearch && !selectedArtist && search.trim().length === 0 && (
        <p className="py-10 text-center text-sm text-white/30">No hay challenges con ese filtro.</p>
      )}
    </div>
  )
}
