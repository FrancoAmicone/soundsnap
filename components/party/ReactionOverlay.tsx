'use client'

// =====================================================================
// SoundSnap — ReactionOverlay
// =====================================================================
// Fullscreen, non-interactive layer that floats emoji reactions upward.
// PartyRoom feeds it the current list (each auto-removed after ~3s).
// =====================================================================

export interface FloatingReaction {
  id: number
  emoji: string
}

export default function ReactionOverlay({
  reactions,
}: {
  reactions: FloatingReaction[]
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <style>{`
        @keyframes ss-float-up {
          0%   { transform: translateY(0) scale(0.6); opacity: 0; }
          15%  { opacity: 1; }
          100% { transform: translateY(-70vh) scale(1.2); opacity: 0; }
        }
      `}</style>
      {reactions.map((r) => (
        <span
          key={r.id}
          className="absolute bottom-24 text-4xl"
          style={{
            left: `${8 + ((r.id * 37) % 84)}%`,
            animation: 'ss-float-up 3s ease-out forwards',
          }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  )
}
