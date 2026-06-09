// =====================================================================
// SoundSnap — Admin layout
// =====================================================================
// Shell for all /admin routes. Proxy.ts already redirects to / for
// non-admin visitors, so here we just build the nav chrome.
// =====================================================================

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Admin — SoundSnap',
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', user.id)
        .single()
    : { data: null }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ---------------------------------------------------------------- */}
      {/* Top nav */}
      {/* ---------------------------------------------------------------- */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link
              href="/admin"
              className="text-sm font-bold tracking-tight text-white"
            >
              Sound<span className="text-indigo-400">Snap</span>{' '}
              <span className="text-white/30">/ Admin</span>
            </Link>
            <nav className="flex gap-1">
              <Link
                href="/admin"
                className="rounded-md px-3 py-1.5 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
              >
                Challenges
              </Link>
              <Link
                href="/admin/challenges/new"
                className="rounded-md px-3 py-1.5 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
              >
                + Nuevo
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.username ?? ''}
                className="h-7 w-7 rounded-full object-cover ring-1 ring-white/10"
              />
            ) : (
              <div className="h-7 w-7 rounded-full bg-indigo-600/40" />
            )}
            <span className="text-sm text-white/50">
              {profile?.username ?? user?.email}
            </span>
            <Link
              href="/"
              className="text-xs text-white/30 transition-colors hover:text-white/60"
            >
              ← Home
            </Link>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Main content */}
      {/* ---------------------------------------------------------------- */}
      <main className="mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
    </div>
  )
}
