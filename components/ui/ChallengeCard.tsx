// =====================================================================
// SoundSnap — ChallengeCard
// =====================================================================
// Server Component. Renders a clickable card for a single challenge in
// the home page grid. Links to /challenge/[id].
// =====================================================================

import Link from 'next/link'

interface ChallengeCardProps {
  id: string
  title: string
  description?: string | null
  genreTag?: string | null
  decadeTag?: string | null
  coverImageUrl?: string | null
  isGuestAllowed?: boolean
  challengeType?: string | null
  playCount?: number
}

const GENRE_COLORS: Record<string, string> = {
  rock: 'bg-red-500/20 text-red-300',
  pop: 'bg-pink-500/20 text-pink-300',
  jazz: 'bg-amber-500/20 text-amber-300',
  electronic: 'bg-cyan-500/20 text-cyan-300',
  latin: 'bg-orange-500/20 text-orange-300',
  'hip-hop': 'bg-purple-500/20 text-purple-300',
  indie: 'bg-lime-500/20 text-lime-300',
  metal: 'bg-zinc-400/20 text-zinc-300',
  classic: 'bg-yellow-500/20 text-yellow-300',
}

function genreClass(genre?: string | null): string {
  if (!genre) return 'bg-white/10 text-white/40'
  return GENRE_COLORS[genre.toLowerCase()] ?? 'bg-white/10 text-white/50'
}

export default function ChallengeCard({
  id,
  title,
  description,
  genreTag,
  decadeTag,
  coverImageUrl,
  isGuestAllowed,
  challengeType,
  playCount,
}: ChallengeCardProps) {
  return (
    <Link
      href={`/challenge/${id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[.03] transition-all hover:border-white/20 hover:bg-white/[.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      {/* Cover image */}
      <div className="relative aspect-square overflow-hidden bg-white/5">
        {coverImageUrl ? (
          <img
            src={coverImageUrl}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl opacity-10">
            ♪
          </div>
        )}

        {/* Badges */}
        <div className="absolute left-2 top-2 flex gap-1">
          {challengeType === 'artist' && (
            <div className="rounded-full bg-indigo-600/80 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              Artista
            </div>
          )}
          {isGuestAllowed && (
            <div className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white/60 backdrop-blur-sm">
              Free
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 font-semibold text-white group-hover:text-indigo-300 transition-colors">
          {title}
        </h3>

        {description && (
          <p className="line-clamp-2 text-xs text-white/40">{description}</p>
        )}

        {/* Tags */}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {genreTag && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${genreClass(genreTag)}`}
            >
              {genreTag}
            </span>
          )}
          {decadeTag && (
            <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
              {decadeTag}
            </span>
          )}
          {typeof playCount === 'number' && playCount > 0 && (
            <span className="ml-auto flex items-center gap-0.5 text-[10px] text-white/30">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-5.197-3.01A1 1 0 008 9.013v5.974a1 1 0 001.555.832l5.197-3.01a1 1 0 000-1.641z" />
              </svg>
              {playCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
