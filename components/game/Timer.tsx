'use client'

// =====================================================================
// SoundSnap — Timer
// =====================================================================
// 30-second countdown. Calls:
//   onReveal  — once, when timeLeft drops to 15 (Intermediate reveal)
//   onTimeout — when timeLeft reaches 0
//
// The callbacks are fired in a separate useEffect watching timeLeft so
// they never run inside a state-updater function (which would trigger
// React's "setState during render" error).
//
// Mount a fresh <Timer key={trackIndex} /> each question to reset it.
// =====================================================================

import { useState, useEffect, useRef } from 'react'

interface TimerProps {
  duration?: number
  onTimeout: () => void
  /** Called once when timeLeft drops to 15. Only relevant for Intermediate. */
  onReveal?: () => void
}

export default function Timer({ duration = 30, onTimeout, onReveal }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(duration)
  const revealedRef = useRef(false)
  const calledTimeoutRef = useRef(false)

  // Stable refs — the effects below always call the latest callbacks
  const onRevealRef = useRef(onReveal)
  const onTimeoutRef = useRef(onTimeout)
  useEffect(() => { onRevealRef.current = onReveal }, [onReveal])
  useEffect(() => { onTimeoutRef.current = onTimeout }, [onTimeout])

  // ── Tick ────────────────────────────────────────────────────────────
  // Only decrements state — no side-effects inside the updater.
  useEffect(() => {
    if (timeLeft <= 0) return
    const id = setTimeout(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000)
    return () => clearTimeout(id)
  }, [timeLeft])

  // ── Side-effects watching timeLeft ──────────────────────────────────
  // Runs after render so we never call a parent's setState during render.
  useEffect(() => {
    if (timeLeft <= 15 && !revealedRef.current) {
      revealedRef.current = true
      onRevealRef.current?.()
    }
    if (timeLeft <= 0 && !calledTimeoutRef.current) {
      calledTimeoutRef.current = true
      onTimeoutRef.current()
    }
  }, [timeLeft])

  const pct = timeLeft / duration
  const isWarning = timeLeft <= 15 && timeLeft > 5
  const isDanger = timeLeft <= 5

  const strokeColor = isDanger
    ? '#f87171'
    : isWarning
      ? '#fbbf24'
      : '#6366f1'

  const radius = 20
  const circumference = 2 * Math.PI * radius

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex h-14 w-14 items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" width="56" height="56" viewBox="0 0 56 56">
          <circle
            cx="28" cy="28" r={radius}
            fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3"
          />
          <circle
            cx="28" cy="28" r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
          />
        </svg>
        <span
          className={`relative font-mono text-lg font-bold leading-none tabular-nums transition-colors ${
            isDanger ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-white'
          }`}
        >
          {timeLeft}
        </span>
      </div>
    </div>
  )
}
