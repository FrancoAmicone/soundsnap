'use client'

// =====================================================================
// SoundSnap — GameSession
// =====================================================================
// Client-side game orchestrator. Manages the full session lifecycle:
//
//   loading  → call /api/session/start (if no initialTracks)
//   playing  → AudioPlayer + Timer + difficulty-specific question
//   feedback → ScoreFeedback between questions
//   complete → summary screen
//   error    → error screen
//
// The component accepts two modes:
//   1. Challenge mode: receives challengeId + difficulty, starts the
//      session on mount.
//   2. Artist mode: receives artistId + artistName + difficulty, starts
//      an ephemeral session on mount (no challenge row in DB).
// =====================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type {
  ClientTrack,
  Difficulty,
  AnswerResponse,
  SessionCompleteResponse,
  SessionStartResponse,
} from '@/types'
import AudioPlayer from './AudioPlayer'
import Timer from './Timer'
import EasyQuestion from './EasyQuestion'
import IntermediateQuestion from './IntermediateQuestion'
import HardQuestion from './HardQuestion'
import ScoreFeedback from './ScoreFeedback'

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

interface GameSessionProps {
  difficulty: Difficulty
  /** Challenge-mode: ID of the challenge to play. */
  challengeId?: string
  /** Artist-mode: Deezer artist ID for an ephemeral session. */
  artistId?: string
  /** Human-readable artist name shown in the summary. */
  artistName?: string
  /** Whether the viewer is logged in. Summary uses this for CTA. */
  isLoggedIn?: boolean
  /**
   * When set, the player already knows the artist (artist-type challenge).
   * Hard mode hides the artist field; Intermediate shows it immediately.
   */
  knownArtist?: string
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'playing'; trackIndex: number; startedAt: number }
  | { kind: 'feedback'; trackIndex: number; answer: AnswerResponse }
  | { kind: 'complete'; result: SessionCompleteResponse }
  | { kind: 'error'; message: string }

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  intermediate: 'Intermediate',
  hard: 'Hard',
}

const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  easy: 'text-emerald-400',
  intermediate: 'text-amber-400',
  hard: 'text-red-400',
}

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------

export default function GameSession({
  difficulty,
  challengeId,
  artistId,
  artistName,
  isLoggedIn = false,
  knownArtist,
}: GameSessionProps) {
  const router = useRouter()

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [tracks, setTracks] = useState<ClientTrack[]>([])
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [artistRevealed, setArtistRevealed] = useState(false)
  // Guard against React StrictMode double-invoking the effect in dev
  const sessionStarted = useRef(false)

  // ── Start session on mount ──────────────────────────────────────────
  useEffect(() => {
    if (sessionStarted.current) return
    sessionStarted.current = true

    async function startSession() {
      if (!challengeId && !artistId) {
        setPhase({ kind: 'error', message: 'Falta el ID del challenge o artista.' })
        return
      }
      try {
        const body = artistId
          ? { artistId, artistName: artistName ?? '', difficulty }
          : { challengeId, difficulty }

        const res = await fetch('/api/session/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data: SessionStartResponse & { error?: string } = await res.json()
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

        setSessionId(data.sessionId)
        setTracks(data.tracks)
        setTotalQuestions(data.totalQuestions)
        setPhase({ kind: 'playing', trackIndex: 0, startedAt: Date.now() })
      } catch (err) {
        setPhase({
          kind: 'error',
          message:
            err instanceof Error ? err.message : 'No se pudo iniciar la sesión.',
        })
      }
    }

    startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Reset artist reveal on each new track ───────────────────────────
  useEffect(() => {
    if (phase.kind === 'playing') {
      setArtistRevealed(false)
    }
  }, [phase])

  // ── Submit answer to server ─────────────────────────────────────────
  const submitAnswer = useCallback(
    async (
      trackId: string,
      payload: Record<string, unknown>,
      trackIndex: number,
    ) => {
      if (!sessionId || submitting) return
      setSubmitting(true)

      try {
        const res = await fetch('/api/session/answer', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, difficulty, trackId, ...payload }),
        })
        const data: AnswerResponse & { error?: string } = await res.json()
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

        setPhase({ kind: 'feedback', trackIndex, answer: data })
      } catch (err) {
        // On network error: still move forward so the game doesn't freeze
        console.error('answer error:', err)
        setPhase({
          kind: 'feedback',
          trackIndex,
          answer: {
            isCorrect: false,
            pointsEarned: 0,
            correctTitle: '(error al obtener respuesta)',
            correctArtist: '',
          },
        })
      } finally {
        setSubmitting(false)
      }
    },
    [sessionId, difficulty, submitting],
  )

  // ── Easy: user clicked an MC option ────────────────────────────────
  function handleEasyAnswer(mcAnswerIndex: number, timeTakenMs: number) {
    if (phase.kind !== 'playing') return
    const track = tracks[phase.trackIndex]
    submitAnswer(track.trackId, { mcAnswerIndex, timeTakenMs }, phase.trackIndex)
  }

  // ── Intermediate: user submitted title ──────────────────────────────
  function handleIntermediateAnswer(
    userTitle: string,
    timeTakenMs: number,
    revealed: boolean,
  ) {
    if (phase.kind !== 'playing') return
    const track = tracks[phase.trackIndex]
    submitAnswer(
      track.trackId,
      { userTitle, timeTakenMs, artistRevealed: revealed },
      phase.trackIndex,
    )
  }

  // ── Hard: user submitted title (artist auto-filled if known) ────────
  function handleHardAnswer(
    userArtist: string,
    userTitle: string,
    timeTakenMs: number,
  ) {
    if (phase.kind !== 'playing') return
    const track = tracks[phase.trackIndex]
    // If artist is pre-known, always send it; component already pre-fills it.
    const resolvedArtist = knownArtist ?? userArtist
    submitAnswer(
      track.trackId,
      { userArtist: resolvedArtist, userTitle, timeTakenMs },
      phase.trackIndex,
    )
  }

  // ── Timer ran out ───────────────────────────────────────────────────
  const handleTimeout = useCallback(() => {
    if (phase.kind !== 'playing' || submitting) return
    const { trackIndex } = phase
    const track = tracks[trackIndex]

    setSubmitting(true)

    let payload: Record<string, unknown>
    if (difficulty === 'easy') {
      payload = { mcAnswerIndex: -1, timeTakenMs: 30000 }
    } else if (difficulty === 'intermediate') {
      payload = { userTitle: '', timeTakenMs: 30000, artistRevealed: true }
    } else {
      // Hard: if artist is pre-known, send it automatically so the server
      // can still match correctly (only the title will be empty → 0 pts)
      payload = { userArtist: knownArtist ?? '', userTitle: '', timeTakenMs: 30000 }
    }

    fetch('/api/session/answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        difficulty,
        trackId: track.trackId,
        ...payload,
      }),
    })
      .then((r) => r.json())
      .then((data: AnswerResponse) => {
        setPhase({ kind: 'feedback', trackIndex, answer: data })
      })
      .catch(() => {
        setPhase({
          kind: 'feedback',
          trackIndex,
          answer: { isCorrect: false, pointsEarned: 0, correctTitle: '—', correctArtist: '—' },
        })
      })
      .finally(() => setSubmitting(false))
  }, [phase, tracks, sessionId, difficulty, submitting])

  // ── Advance to next question or complete ────────────────────────────
  function handleNext(trackIndex: number) {
    const nextIndex = trackIndex + 1
    if (nextIndex >= totalQuestions) {
      completeSession()
    } else {
      setPhase({ kind: 'playing', trackIndex: nextIndex, startedAt: Date.now() })
    }
  }

  async function completeSession() {
    if (!sessionId) return
    try {
      const res = await fetch('/api/session/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data: SessionCompleteResponse & { error?: string } = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setPhase({ kind: 'complete', result: data })
    } catch {
      setPhase({
        kind: 'error',
        message: 'No se pudo completar la sesión. Recargá la página.',
      })
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

  if (phase.kind === 'loading') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-indigo-400" />
        <p className="text-sm text-white/40">Preparando la sesión…</p>
      </div>
    )
  }

  if (phase.kind === 'error') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="text-4xl">⚠</div>
        <p className="text-white">{phase.message}</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white"
        >
          ← Volver
        </button>
      </div>
    )
  }

  if (phase.kind === 'complete') {
    return (
      <SummaryScreen
        result={phase.result}
        challengeId={challengeId}
        artistName={artistName}
        isLoggedIn={isLoggedIn}
      />
    )
  }

  if (phase.kind === 'feedback') {
    return (
      <div className="mx-auto max-w-md px-4">
        <ScoreFeedback
          isCorrect={phase.answer.isCorrect}
          pointsEarned={phase.answer.pointsEarned}
          correctTitle={phase.answer.correctTitle}
          correctArtist={phase.answer.correctArtist}
          artistOk={phase.answer.artistOk}
          titleOk={phase.answer.titleOk}
          trackIndex={phase.trackIndex}
          totalQuestions={totalQuestions}
          difficulty={difficulty}
          onNext={() => handleNext(phase.trackIndex)}
        />
      </div>
    )
  }

  // ── Playing ─────────────────────────────────────────────────────────
  if (phase.kind === 'playing') {
    const { trackIndex, startedAt } = phase
    const track = tracks[trackIndex]

    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-4 sm:gap-6 sm:py-8">
        {/* Header: progress + difficulty + timer */}
        <div className="flex w-full items-center justify-between">
          <div>
            <p className="text-xs text-white/30">
              Pregunta{' '}
              <span className="font-semibold text-white">
                {trackIndex + 1}
              </span>{' '}
              de {totalQuestions}
            </p>
            <p className={`text-xs font-semibold ${DIFFICULTY_COLOR[difficulty]}`}>
              {DIFFICULTY_LABEL[difficulty]}
            </p>
          </div>

          {/* Pill progress bar */}
          <div className="mx-4 flex flex-1 gap-1">
            {Array.from({ length: totalQuestions }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i < trackIndex
                    ? 'bg-indigo-500'
                    : i === trackIndex
                      ? 'bg-white/40'
                      : 'bg-white/10'
                }`}
              />
            ))}
          </div>

          <Timer
            key={trackIndex}
            duration={30}
            onTimeout={handleTimeout}
            onReveal={() => setArtistRevealed(true)}
          />
        </div>

        {/* Audio player */}
        <AudioPlayer previewUrl={track.previewUrl} disabled={submitting} />

        {/* Question UI */}
        {difficulty === 'easy' && (
          <EasyQuestion
            track={track}
            startedAt={startedAt}
            onAnswer={handleEasyAnswer}
            disabled={submitting}
          />
        )}

        {difficulty === 'intermediate' && (
          <IntermediateQuestion
            track={track}
            startedAt={startedAt}
            artistRevealed={artistRevealed}
            onAnswer={handleIntermediateAnswer}
            disabled={submitting}
            knownArtist={knownArtist}
          />
        )}

        {difficulty === 'hard' && (
          <HardQuestion
            trackId={track.trackId}
            startedAt={startedAt}
            onAnswer={handleHardAnswer}
            disabled={submitting}
            knownArtist={knownArtist}
          />
        )}

        {/* Skip button */}
        <button
          type="button"
          onClick={handleTimeout}
          disabled={submitting}
          className="text-xs text-white/20 transition-colors hover:text-white/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Saltar canción →
        </button>
      </div>
    )
  }

  return null
}

// -----------------------------------------------------------------------
// Summary screen
// -----------------------------------------------------------------------

function SummaryScreen({
  result,
  challengeId,
  artistName,
  isLoggedIn,
}: {
  result: SessionCompleteResponse
  challengeId?: string
  artistName?: string
  isLoggedIn: boolean
}) {
  const router = useRouter()
  const pct = Math.round((result.correctAnswers / result.totalQuestions) * 100)

  const multiplierLabel: Record<Difficulty, string> = {
    easy: '×1.0',
    intermediate: '×1.3',
    hard: '×1.7',
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-8 sm:py-12">
      <div className="space-y-6">
        {/* Title */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Resultado final</h1>
          {artistName && (
            <p className="mt-1 text-sm text-white/40">
              {result.artistName ?? artistName}
            </p>
          )}
        </div>

        {/* Score */}
        <div className="rounded-2xl border border-white/10 bg-white/[.04] px-6 py-8 text-center">
          <p className="text-sm text-white/40">Puntuación final</p>
          <p className="mt-2 text-6xl font-bold tracking-tight text-white">
            {result.finalScore.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-white/30">
            {result.rawPoints} pts × {multiplierLabel[result.difficulty]}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatBox
            label="Correctas"
            value={`${result.correctAnswers}/${result.totalQuestions}`}
          />
          <StatBox label="Acierto" value={`${pct}%`} />
          <StatBox
            label="Tiempo"
            value={`${Math.round(result.durationMs / 1000)}s`}
          />
        </div>

        {/* Guest CTA */}
        {!isLoggedIn && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-4 text-center">
            <p className="text-sm font-medium text-amber-300">
              Tu puntaje no fue guardado
            </p>
            <p className="mt-1 text-xs text-white/40">
              Iniciá sesión para guardar tu score y desbloquear todas las
              dificultades.
            </p>
            <a
              href="/login"
              className="mt-3 inline-block rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-black hover:bg-amber-400"
            >
              Entrar con Google
            </a>
          </div>
        )}

        {!result.saved && isLoggedIn && (
          <p className="text-center text-xs text-white/30">
            Score guardado en el leaderboard.
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {challengeId && (
            <button
              type="button"
              onClick={() => router.push(`/challenge/${challengeId}`)}
              className="flex-1 rounded-xl border border-white/10 py-3 text-sm font-semibold text-white/70 hover:border-white/20 hover:text-white"
            >
              Ver leaderboard
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Inicio
          </button>
        </div>
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-3 text-center">
      <p className="text-xs text-white/30">{label}</p>
      <p className="mt-1 text-lg font-bold text-white">{value}</p>
    </div>
  )
}
