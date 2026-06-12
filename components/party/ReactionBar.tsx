'use client'

// =====================================================================
// SoundSnap — ReactionBar
// =====================================================================
// Emoji buttons players tap to send a live reaction to the room (via
// Realtime Broadcast — handled by PartyRoom).
// =====================================================================

const EMOJIS = ['🔥', '😂', '😱', '👏', '💀', '❤️']

export default function ReactionBar({ onReact }: { onReact: (emoji: string) => void }) {
  return (
    <div className="flex justify-center gap-2">
      {EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onReact(e)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[.03] text-xl transition-transform hover:scale-110 hover:border-white/20 active:scale-95"
          aria-label={`Reaccionar ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  )
}
