'use client'

// =====================================================================
// SoundSnap — ChallengeForm
// =====================================================================
// Admin form for creating and editing challenges.
// Supports three source types:
//   'playlist' — admin pastes a Deezer playlist ID. Can also pin extra
//                tracks and exclude individual ones (hybrid mode).
//   'manual'   — admin builds the track list by searching Deezer.
//                No playlist ID required.
//   'artist'   — admin searches for a Deezer artist and pins them.
//                Tracks are fetched dynamically at session-start.
//
// On submit the form calls the parent-provided `onSubmit` handler
// with the serialised challenge data. The parent is responsible for
// calling the API (POST/PATCH /api/admin/challenges).
// =====================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import type { ChallengeType, DeezerTrack, ArtistSearchResult } from '@/types'
import TrackSearchPanel from '@/components/admin/TrackSearchPanel'

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export interface ChallengeFormValues {
  title: string
  description: string
  genreTag: string
  decadeTag: string
  challengeType: ChallengeType
  // playlist type
  deezerPlaylistId: string
  // artist type
  deezerArtistId: string
  deezerArtistName: string
  // manual / hybrid
  pinnedTracks: DeezerTrack[]
  excludedTrackIds: string[]
  // access
  isGuestAllowed: boolean
  isActive: boolean
  // counts
  trackCountEasy: number
  trackCountMedium: number
  trackCountHard: number
  coverImageUrl: string
}

interface ChallengeFormProps {
  initial?: Partial<ChallengeFormValues>
  onSubmit: (values: ChallengeFormValues) => Promise<void>
  submitting?: boolean
}

// -------------------------------------------------------------------------
// Static options
// -------------------------------------------------------------------------

const GENRES = [
  'rock', 'pop', 'jazz', 'electronic', 'latin', 'hip-hop',
  'r&b', 'classical', 'metal', 'country', 'reggae', 'folk',
]

const DECADES = ['60s', '70s', '80s', '90s', '00s', '10s', '20s']

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function cls(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cls(
        'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-indigo-600 text-white'
          : 'text-white/50 hover:bg-white/5 hover:text-white',
      )}
    >
      {children}
    </button>
  )
}

function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-white/70">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

// -------------------------------------------------------------------------
// Artist picker sub-component
// -------------------------------------------------------------------------

function ArtistPicker({
  selectedId,
  selectedName,
  onSelect,
}: {
  selectedId: string
  selectedName: string
  onSelect: (id: string, name: string) => void
}) {
  const [query, setQuery] = useState(selectedName)
  const [results, setResults] = useState<ArtistSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/search/artist?q=${encodeURIComponent(q)}&limit=10`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { artists: ArtistSearchResult[] } = await res.json()
      setResults(data.artists)
    } catch {
      setError('Error al buscar artistas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search])

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Buscar artista en Deezer…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={inputCls}
      />
      {loading && <p className="text-xs text-white/40">Buscando…</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {selectedId && (
        <p className="text-sm font-medium text-indigo-400">
          Artista seleccionado: {selectedName}
        </p>
      )}
      {results.length > 0 && (
        <ul className="divide-y divide-white/5 rounded-lg border border-white/10 bg-white/5">
          {results.map((artist) => (
            <li key={artist.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(artist.id, artist.name)
                  setQuery(artist.name)
                  setResults([])
                }}
                className={cls(
                  'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5',
                  selectedId === artist.id && 'bg-indigo-600/10',
                )}
              >
                {artist.picture ? (
                  <img
                    src={artist.picture}
                    alt={artist.name}
                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-9 w-9 shrink-0 rounded-full bg-white/10" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {artist.name}
                  </p>
                  <p className="text-xs text-white/40">
                    {artist.nbFan.toLocaleString()} fans
                  </p>
                </div>
                {selectedId === artist.id && (
                  <span className="ml-auto text-indigo-400">✓</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// -------------------------------------------------------------------------
// Main form
// -------------------------------------------------------------------------

const defaultValues: ChallengeFormValues = {
  title: '',
  description: '',
  genreTag: '',
  decadeTag: '',
  challengeType: 'playlist',
  deezerPlaylistId: '',
  deezerArtistId: '',
  deezerArtistName: '',
  pinnedTracks: [],
  excludedTrackIds: [],
  isGuestAllowed: false,
  isActive: true,
  trackCountEasy: 5,
  trackCountMedium: 7,
  trackCountHard: 10,
  coverImageUrl: '',
}

export default function ChallengeForm({
  initial = {},
  onSubmit,
  submitting = false,
}: ChallengeFormProps) {
  const [values, setValues] = useState<ChallengeFormValues>({
    ...defaultValues,
    ...initial,
  })

  function set<K extends keyof ChallengeFormValues>(
    key: K,
    value: ChallengeFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(values)
  }

  // Validation helpers
  const missingPlaylist =
    values.challengeType === 'playlist' && !values.deezerPlaylistId.trim()
  const missingArtist =
    values.challengeType === 'artist' && !values.deezerArtistId
  const missingManualTracks =
    values.challengeType === 'manual' && values.pinnedTracks.length === 0
  const invalid =
    !values.title.trim() || missingPlaylist || missingArtist || missingManualTracks

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* ------------------------------------------------------------------ */}
      {/* Basic info */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40">
          Información general
        </h2>

        <Field label="Título *">
          <input
            type="text"
            value={values.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Ej. Rock 90s"
            required
            className={inputCls}
          />
        </Field>

        <Field label="Descripción">
          <textarea
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            rows={2}
            placeholder="Subtítulo corto visible en la tarjeta"
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Género">
            <select
              value={values.genreTag}
              onChange={(e) => set('genreTag', e.target.value)}
              className={inputCls}
            >
              <option value="">— Sin género —</option>
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Década">
            <select
              value={values.decadeTag}
              onChange={(e) => set('decadeTag', e.target.value)}
              className={inputCls}
            >
              <option value="">— Sin década —</option>
              {DECADES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="URL de portada"
          hint="URL pública de la imagen que se muestra en la tarjeta de challenge."
        >
          <input
            type="url"
            value={values.coverImageUrl}
            onChange={(e) => set('coverImageUrl', e.target.value)}
            placeholder="https://…"
            className={inputCls}
          />
        </Field>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Source type selector */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40">
          Fuente de canciones
        </h2>

        <div className="flex gap-2 rounded-lg border border-white/10 bg-white/5 p-1">
          <TabButton
            active={values.challengeType === 'playlist'}
            onClick={() => set('challengeType', 'playlist')}
          >
            Playlist Deezer
          </TabButton>
          <TabButton
            active={values.challengeType === 'manual'}
            onClick={() => set('challengeType', 'manual')}
          >
            Manual
          </TabButton>
          <TabButton
            active={values.challengeType === 'artist'}
            onClick={() => set('challengeType', 'artist')}
          >
            Por artista
          </TabButton>
        </div>

        {/* Playlist type */}
        {values.challengeType === 'playlist' && (
          <div className="space-y-4">
            <Field
              label="ID de Playlist Deezer *"
              hint="El número al final de deezer.com/playlist/<ID>. Solo playlists públicos."
            >
              <input
                type="text"
                value={values.deezerPlaylistId}
                onChange={(e) => set('deezerPlaylistId', e.target.value.trim())}
                placeholder="Ej. 1313621735"
                className={inputCls}
              />
            </Field>

            <div>
              <p className="mb-3 text-sm font-medium text-white/70">
                Agregar canciones extra (opcional)
              </p>
              <TrackSearchPanel
                pinnedTracks={values.pinnedTracks}
                onAdd={(track) =>
                  set('pinnedTracks', [...values.pinnedTracks, track])
                }
                onRemove={(id) =>
                  set(
                    'pinnedTracks',
                    values.pinnedTracks.filter((t) => t.id !== id),
                  )
                }
              />
            </div>
          </div>
        )}

        {/* Manual type */}
        {values.challengeType === 'manual' && (
          <div className="space-y-2">
            <p className="text-sm text-white/60">
              Armá la lista buscando canciones una por una.
            </p>
            {missingManualTracks && (
              <p className="text-xs text-amber-400">
                Agregá al menos una canción para poder guardar.
              </p>
            )}
            <TrackSearchPanel
              pinnedTracks={values.pinnedTracks}
              onAdd={(track) =>
                set('pinnedTracks', [...values.pinnedTracks, track])
              }
              onRemove={(id) =>
                set(
                  'pinnedTracks',
                  values.pinnedTracks.filter((t) => t.id !== id),
                )
              }
            />
          </div>
        )}

        {/* Artist type */}
        {values.challengeType === 'artist' && (
          <div className="space-y-4">
            <p className="text-sm text-white/60">
              Las canciones se obtienen dinámicamente de los tops del artista
              en Deezer cada vez que alguien juega.
            </p>
            {missingArtist && (
              <p className="text-xs text-amber-400">
                Seleccioná un artista para poder guardar.
              </p>
            )}
            <ArtistPicker
              selectedId={values.deezerArtistId}
              selectedName={values.deezerArtistName}
              onSelect={(id, name) => {
                set('deezerArtistId', id)
                set('deezerArtistName', name)
              }}
            />
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Track counts */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40">
          Cantidad de preguntas
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Easy">
            <input
              type="number"
              min={3}
              max={20}
              value={values.trackCountEasy}
              onChange={(e) =>
                set('trackCountEasy', Math.min(20, Math.max(3, parseInt(e.target.value) || 3)))
              }
              className={inputCls}
            />
          </Field>
          <Field label="Intermediate">
            <input
              type="number"
              min={3}
              max={20}
              value={values.trackCountMedium}
              onChange={(e) =>
                set('trackCountMedium', Math.min(20, Math.max(3, parseInt(e.target.value) || 3)))
              }
              className={inputCls}
            />
          </Field>
          <Field label="Hard">
            <input
              type="number"
              min={3}
              max={20}
              value={values.trackCountHard}
              onChange={(e) =>
                set('trackCountHard', Math.min(20, Math.max(3, parseInt(e.target.value) || 3)))
              }
              className={inputCls}
            />
          </Field>
        </div>
        <p className="text-xs text-white/40">Rango permitido: 3–20 preguntas por dificultad.</p>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Access toggles */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40">
          Acceso
        </h2>

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/5 accent-indigo-500"
          />
          <span className="text-sm text-white">Activo (visible en la home)</span>
        </label>

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={values.isGuestAllowed}
            onChange={(e) => set('isGuestAllowed', e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/5 accent-indigo-500"
          />
          <span className="text-sm text-white">
            Permitir guests (solo dificultad Easy)
          </span>
        </label>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Submit */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={invalid || submitting}
          className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? 'Guardando…' : 'Guardar challenge'}
        </button>
      </div>
    </form>
  )
}
