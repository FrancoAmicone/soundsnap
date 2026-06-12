'use client'

// =====================================================================
// SoundSnap — RoundCountdown
// =====================================================================
// "Get ready" overlay shown once before a round starts. It does two jobs:
//   1. Preloads the first track's audio preview.
//   2. Counts 3 → 2 → 1 and only calls onReady() once BOTH the countdown
//      finished AND the audio is buffered — so the 30s timer never starts
//      while the clip is still loading (fair start for everyone).
// =====================================================================

import { useState, useEffect, useRef } from 'react'

interface RoundCountdownProps {
  previewUrl: string
  onReady: () => void
}

export default function RoundCountdown({ previewUrl, onReady }: RoundCountdownProps) {
  const [count, setCount] = useState(3)
  const [audioReady, setAudioReady] = useState(false)
  const firedRef = useRef(false)

  // ── Preload the first preview ───────────────────────────────────────
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    const markReady = () => setAudioReady(true)
    audio.addEventListener('canplaythrough', markReady)
    audio.addEventListener('canplay', markReady)
    audio.addEventListener('error', markReady) // don't block forever on error
    audio.src = previewUrl
    audio.load()

    // Safety net: never hang the game waiting on a slow CDN.
    const timeout = setTimeout(markReady, 8000)

    return () => {
      clearTimeout(timeout)
      audio.removeEventListener('canplaythrough', markReady)
      audio.removeEventListener('canplay', markReady)
      audio.removeEventListener('error', markReady)
      audio.src = ''
    }
  }, [previewUrl])

  // ── Tick 3 → 2 → 1 → 0 ──────────────────────────────────────────────
  useEffect(() => {
    if (count <= 0) return
    const id = setTimeout(() => setCount((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [count])

  // ── Start only when countdown done AND audio buffered ───────────────
  useEffect(() => {
    if (count <= 0 && audioReady && !firedRef.current) {
      firedRef.current = true
      onReady()
    }
  }, [count, audioReady, onReady])

  const waitingForAudio = count <= 0 && !audioReady

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
        Preparate
      </p>
      <div className="flex h-32 w-32 items-center justify-center rounded-full border border-white/10 bg-white/[.03]">
        {count > 0 ? (
          <span
            key={count}
            className="animate-[ping_0.4s_ease-out] text-7xl font-bold tabular-nums text-white"
          >
            {count}
          </span>
        ) : (
          <span className="text-3xl font-bold text-emerald-400">¡Ya!</span>
        )}
      </div>
      {waitingForAudio ? (
        <div className="flex items-center gap-2 text-sm text-white/40">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-indigo-400" />
          Cargando audio…
        </div>
      ) : (
        <p className="text-sm text-white/40">Escuchá 5 segundos y adiviná</p>
      )}
    </div>
  )
}
