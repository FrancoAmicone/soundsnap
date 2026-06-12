// =====================================================================
// SoundSnap — Party room page
// =====================================================================
// Server Component. Requires login. Loads the party state directly via
// the service client (no HTTP round-trip), auto-joining the caller if the
// room is still in the lobby. Hands the initial state to the PartyRoom
// client island, which drives Realtime + gameplay.
// =====================================================================

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  getPartyState,
  loadMembers,
  loadPartyByCode,
  MAX_PARTY_SIZE,
} from '@/lib/party'
import PartyRoom from '@/components/party/PartyRoom'
import UserMenu from '@/components/ui/UserMenu'

interface PageProps {
  params: Promise<{ code: string }>
}

export default async function PartyPage({ params }: PageProps) {
  const { code: rawCode } = await params
  const code = rawCode.trim().toUpperCase()

  const user = await getUser()
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/party/${code}`)}`)
  }

  const admin = createServiceClient()
  const party = await loadPartyByCode(admin, code)
  if (!party) notFound()

  const members = await loadMembers(admin, party.id)
  const isMember = members.some((m) => m.user_id === user.id)

  // Auto-join while the room is still open.
  if (!isMember) {
    if (party.status !== 'lobby') {
      return <RoomClosed code={code} />
    }
    if (members.length >= MAX_PARTY_SIZE) {
      return <RoomClosed code={code} full />
    }
    await admin.from('party_members').insert({
      party_id: party.id,
      user_id: user.id,
      turn_order: members.length,
    })
  }

  const state = await getPartyState(admin, code, user.id)
  if (!state) notFound()

  return <PartyRoom initialState={state} />
}

function RoomClosed({ code, full }: { code: string; full?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="text-sm font-bold tracking-tight text-white">
            Sound<span className="text-indigo-400">Snap</span>
          </Link>
          <UserMenu />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-2xl">
            🔒
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">
              {full ? 'La sala está llena' : 'La partida ya empezó'}
            </h1>
            <p className="mt-2 text-sm text-white/50">
              No podés unirte a la sala <span className="font-mono">{code}</span> en
              este momento.
            </p>
          </div>
          <Link
            href="/party"
            className="inline-block w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Crear o unirme a otra sala
          </Link>
          <Link href="/" className="block text-xs text-white/30 hover:text-white/60">
            ← Volver al inicio
          </Link>
        </div>
      </main>
    </div>
  )
}
