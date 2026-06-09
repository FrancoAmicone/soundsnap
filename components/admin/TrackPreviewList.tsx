'use client'

// =====================================================================
// SoundSnap — TrackPreviewList
// =====================================================================
// Admin component that shows a list of tracks with 5-second audio clips.
// Only one track plays at a time. The clip stops automatically at 5s.
// =====================================================================

import { useState, useRef, useEffect } from 'react'
import type { DeezerTrack } from '@/types'

interface TrackPreviewListProps {
  tracks: DeezerTrack[]
}

export default function TrackPreviewList({ tracks }: TrackPreviewListProps) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const clipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (clipTimerRef.current) clearTimeout(clipTimerRef.current)
      audioRef.current?.pause()
    }
  }, [])

  function play(track: DeezerTrack) {
    if (clipTimerRef.current) clearTimeout(clipTimerRef.current)

    if (playingId === track.id) {
      // Toggle off
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }

    // Stop current
    audioRef.current?.pause()

    const audio = new Audio(track.previewUrl)
    audio.currentTime = 0
    audioRef.current = audio

    audio.play().then(() => {
      setPlayingId(track.id)
      // Stop after 5s
      clipTimerRef.current = setTimeout(() => {
        audio.pause()
        setPlayingId(null)
      }, 5000)
    }).catch(() => {
      setPlayingId(null)
    })

    audio.onended = () => {
      setPlayingId(null)
    }
  }

  return (
    <ul className="divide-y divide-white/5">
      {tracks.map((track, idx) => {
        const isPlaying = playingId === track.id
        return (
          <li
            key={track.id}
            className="flex items-center gap-4 px-1 py-3"
          >
            <span className="w-6 shrink-0 text-right text-xs text-white/20">
              {idx + 1}
            </span>

            {track.coverUrl ? (
              <img
                src={track.coverUrl}
                alt={track.albumName}
                className="h-11 w-11 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="h-11 w-11 shrink-0 rounded bg-white/5" />
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-white">{track.name}</p>
              <p className="truncate text-sm text-white/40">{track.artist}</p>
              <p className="truncate text-xs text-white/20">{track.albumName}</p>
            </div>

            <button
              type="button"
              onClick={() => play(track)}
              className={`shrink-0 rounded-full p-2 transition-colors ${
                isPlaying
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
              }`}
              title={isPlaying ? 'Pausar' : 'Escuchar 5s'}
            >
              {isPlaying ? (
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="2" width="4" height="12" rx="1" />
                  <rect x="9" y="2" width="4" height="12" rx="1" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 2l10 6-10 6V2z" />
                </svg>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
