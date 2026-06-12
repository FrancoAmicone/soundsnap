// =====================================================================
// SoundSnap — UserMenu
// =====================================================================
// Server Component shown in the top-right of nav bars. Renders either:
//   - "Entrar" link (guests)
//   - Avatar + username + logout button (logged-in users)
//
// Logout is a tiny <form> POSTing to /auth/signout — no client JS.
// =====================================================================

import Link from 'next/link'
import { createClient, getUser } from '@/lib/supabase/server'

interface UserMenuProps {
  /** Optional path to redirect-to after login (forwarded as ?next=). */
  loginNext?: string
}

export default async function UserMenu({ loginNext }: UserMenuProps) {
  const user = await getUser()

  if (!user) {
    const href = loginNext
      ? `/login?next=${encodeURIComponent(loginNext)}`
      : '/login'
    return (
      <Link
        href={href}
        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:border-white/20 hover:text-white"
      >
        Entrar
      </Link>
    )
  }

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, avatar_url')
    .eq('id', user.id)
    .single()

  const username = profile?.username ?? user.email ?? 'Usuario'

  return (
    <div className="flex items-center gap-3">
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt={username}
          className="h-7 w-7 rounded-full object-cover ring-1 ring-white/10"
        />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600/40 text-xs font-bold text-indigo-200">
          {username[0]?.toUpperCase()}
        </div>
      )}
      <span className="hidden text-sm text-white/60 sm:block">{username}</span>

      {/* Logout — pure server-side form */}
      <form action="/auth/signout" method="POST">
        <button
          type="submit"
          className="rounded-md px-2 py-1 text-xs text-white/30 transition-colors hover:bg-white/5 hover:text-white"
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
        >
          Salir
        </button>
      </form>
    </div>
  )
}
