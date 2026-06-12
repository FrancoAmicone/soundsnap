'use client'

// =====================================================================
// SoundSnap — PartyRoom
// =====================================================================
// Central client island for a party. Holds the authoritative state
// (hydrated from the server, re-fetched on every Realtime ping) and
// renders the right phase: lobby → round → round results → final.
//
// Realtime is used only for coordination:
//   - Presence: who is connected.
//   - Broadcast: "something changed" pings → everyone refetches the
//     authoritative GET /api/party/<code>. Host-only actions are still
//     enforced server-side, so forged pings can't corrupt game state.
// =====================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { partyChannelName, PARTY_BROADCAST } from '@/lib/realtime'
import type {
  PartyBroadcastEvent,
  PartyCreateResponse,
  PartyStateResponse,
} from '@/types'
import PartyLobby from './PartyLobby'
import PartyRound from './PartyRound'
import PartyRoundResults from './PartyRoundResults'
import PartyFinalResults from './PartyFinalResults'
import ReactionOverlay, { type FloatingReaction } from './ReactionOverlay'

export default function PartyRoom({
  initialState,
}: {
  initialState: PartyStateResponse
}) {
  const code = initialState.code
  const meId = initialState.me.userId
  const myName =
    initialState.members.find((m) => m.userId === meId)?.username ?? 'Jugador'

  const router = useRouter()
  const [state, setState] = useState<PartyStateResponse>(initialState)
  const [connectedIds, setConnectedIds] = useState<string[]>([meId])
  const [reactions, setReactions] = useState<FloatingReaction[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const reactionIdRef = useRef(0)

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/party/${code}`, { cache: 'no-store' })
    if (res.ok) setState((await res.json()) as PartyStateResponse)
  }, [code])

  const broadcast = useCallback((event: PartyBroadcastEvent) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: PARTY_BROADCAST,
      payload: event,
    })
  }, [])

  // Float an emoji for ~3s (used for both incoming and own reactions).
  const pushReaction = useCallback((emoji: string) => {
    const id = reactionIdRef.current++
    setReactions((r) => [...r, { id, emoji }])
    setTimeout(() => {
      setReactions((r) => r.filter((x) => x.id !== id))
    }, 3000)
  }, [])

  const sendReaction = useCallback(
    (emoji: string) => {
      pushReaction(emoji) // show immediately to the sender
      broadcast({ type: 'reaction', emoji, userId: meId })
    },
    [pushReaction, broadcast, meId],
  )

  // ── Realtime channel ────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(partyChannelName(code), {
      config: { presence: { key: meId } },
    })
    channelRef.current = channel

    channel
      .on('broadcast', { event: PARTY_BROADCAST }, ({ payload }) => {
        const ev = payload as PartyBroadcastEvent
        if (ev.type === 'reaction') {
          // Don't echo our own (we already showed it on send).
          if (ev.userId !== meId) pushReaction(ev.emoji)
        } else if (ev.type === 'rematch') {
          router.push(`/party/${ev.code}`)
        } else {
          refetch()
        }
      })
      .on('presence', { event: 'sync' }, () => {
        setConnectedIds(Object.keys(channel.presenceState()))
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.track({ userId: meId, username: myName })
        }
      })

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [code, meId, myName, refetch, pushReaction, router])

  // ── Action handlers ─────────────────────────────────────────────────
  const notifyLobby = useCallback(() => {
    broadcast({ type: 'lobby_updated' })
    refetch()
  }, [broadcast, refetch])

  const handleStart = useCallback(async (): Promise<string | null> => {
    const res = await fetch('/api/party/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const data = await res.json()
    if (!res.ok) return (data as { error?: string }).error ?? 'No se pudo empezar'
    setState(data as PartyStateResponse)
    broadcast({ type: 'round_started', round: 1 })
    return null
  }, [code, broadcast])

  const handleRoundComplete = useCallback(async () => {
    broadcast({
      type: 'member_finished',
      userId: meId,
      round: state.round?.roundNumber ?? 0,
    })
    await refetch()
  }, [broadcast, refetch, meId, state.round])

  const handleNext = useCallback(async (): Promise<string | null> => {
    const res = await fetch('/api/party/next-round', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const data = await res.json()
    if (!res.ok) return (data as { error?: string }).error ?? 'No se pudo avanzar'
    const next = data as PartyStateResponse
    setState(next)
    if (next.status === 'finished') broadcast({ type: 'party_finished' })
    else broadcast({ type: 'round_started', round: next.currentRound })
    return null
  }, [code, broadcast])

  const handleRematch = useCallback(async (): Promise<string | null> => {
    const res = await fetch('/api/party/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ difficulty: state.difficulty }),
    })
    const data = await res.json()
    if (!res.ok) return (data as { error?: string }).error ?? 'No se pudo crear la revancha'
    const { code: newCode } = data as PartyCreateResponse
    broadcast({ type: 'rematch', code: newCode })
    router.push(`/party/${newCode}`)
    return null
  }, [state.difficulty, broadcast, router])

  // ── Render by phase ─────────────────────────────────────────────────
  let content: React.ReactNode
  if (state.status === 'lobby') {
    content = (
      <PartyLobby
        state={state}
        connectedIds={connectedIds}
        onChanged={notifyLobby}
        onStart={handleStart}
      />
    )
  } else if (state.status === 'finished') {
    content = <PartyFinalResults state={state} onRematch={handleRematch} />
  } else if (state.mySession && !state.myRoundDone) {
    // in_progress, my round to play
    content = <PartyRound state={state} onComplete={handleRoundComplete} />
  } else {
    content = (
      <PartyRoundResults
        state={state}
        connectedIds={connectedIds}
        onNext={handleNext}
        onReact={sendReaction}
      />
    )
  }

  return (
    <>
      {content}
      <ReactionOverlay reactions={reactions} />
    </>
  )
}
