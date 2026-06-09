'use client'

// =====================================================================
// SoundSnap — AudioPlayer
// =====================================================================
// Plays up to 5 seconds of a Deezer preview URL. Replays are unlimited.
// Auto-plays as soon as each track is ready — the game already started
// with a user gesture so browsers allow it.
// =====================================================================

import { useState, useRef, useEffect } from 'react'

interface AudioPlayerProps {
  previewUrl: string
  /** When true the play button is disabled (e.g. while submitting). */
  disabled?: boolean
}

const CLIP_DURATION = 5 // seconds

export default function AudioPlayer({ previewUrl, disabled = false }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const shouldAutoPlay = useRef(true)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0) // 0–1
  const [canPlay, setCanPlay] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [replays, setReplays] = useState(0)

  // Reset and auto-play whenever the track changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    shouldAutoPlay.current = true
    audio.src = previewUrl
    audio.load()
    setPlaying(false)
    setProgress(0)
    setCanPlay(false)
    setLoadError(false)
    setReplays(0)
  }, [previewUrl])

  function handleToggle() {
    const audio = audioRef.current
    if (!audio || disabled || !canPlay) return

    if (playing) {
      audio.pause()
    } else {
      // Restart from beginning if clip already ended
      if (audio.currentTime >= CLIP_DURATION) {
        audio.currentTime = 0
      }
      audio.play().catch(() => setLoadError(true))
      setReplays((r) => r + 1)
    }
  }

  function handleTimeUpdate() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.currentTime >= CLIP_DURATION) {
      audio.pause()
      audio.currentTime = CLIP_DURATION
      setPlaying(false)
    }
    setProgress(Math.min(audio.currentTime / CLIP_DURATION, 1))
  }

  const progressDeg = progress * 360

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Circular play button with progress ring */}
      <div className="relative">
        {/* SVG progress ring */}
        <svg
          className="absolute inset-0 -rotate-90"
          width="88"
          height="88"
          viewBox="0 0 88 88"
        >
          {/* Track */}
          <circle
            cx="44"
            cy="44"
            r="38"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="4"
          />
          {/* Progress */}
          <circle
            cx="44"
            cy="44"
            r="38"
            fill="none"
            stroke={playing ? '#6366f1' : 'rgba(255,255,255,0.3)'}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 38}`}
            strokeDashoffset={`${2 * Math.PI * 38 * (1 - progress)}`}
            style={{ transition: playing ? 'stroke-dashoffset 0.1s linear' : 'none' }}
          />
        </svg>

        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled || !canPlay || loadError}
          aria-label={playing ? 'Pausar' : 'Reproducir'}
          className={`relative flex h-[88px] w-[88px] items-center justify-center rounded-full border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
            !canPlay || loadError
              ? 'cursor-not-allowed border-white/10 bg-white/5 text-white/20'
              : playing
                ? 'cursor-pointer border-indigo-500/60 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30'
                : 'cursor-pointer border-white/20 bg-white/[.06] text-white hover:bg-white/10'
          }`}
        >
          {loadError ? (
            <span className="text-xl">⚠</span>
          ) : !canPlay ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          ) : playing ? (
            // Pause icon
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <rect x="4" y="3" width="4" height="14" rx="1" />
              <rect x="12" y="3" width="4" height="14" rx="1" />
            </svg>
          ) : (
            // Play icon
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6 4l12 6-12 6V4z" />
            </svg>
          )}
        </button>
      </div>

      {/* Replay count + instructions */}
      <div className="flex flex-col items-center gap-0.5">
        <p className="text-xs text-white/40">
          {!canPlay && !loadError
            ? 'Cargando audio…'
            : loadError
              ? 'Error al cargar el audio'
              : playing
                ? 'Reproduciendo…'
                : `${replays} reproducción${replays !== 1 ? 'es' : ''}`}
        </p>
        {!playing && canPlay && !loadError && (
          <p className="text-xs text-white/25">Presioná para escuchar de nuevo</p>
        )}
      </div>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onCanPlay={() => {
          setCanPlay(true)
          if (shouldAutoPlay.current && audioRef.current && !disabled) {
            shouldAutoPlay.current = false
            audioRef.current.play().catch(() => {
              // Blocked by browser policy — user will press play manually
            })
            setReplays(1)
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onError={() => setLoadError(true)}
        preload="auto"
      />
    </div>
  )
}
