// =====================================================================
// SoundSnap — Realtime party channel helpers (browser-only)
// =====================================================================
// Thin conventions around the Supabase Realtime channel used for party
// coordination. Live state is intentionally minimal: every broadcast is
// just a "something changed, refetch the authoritative state" ping, so a
// malicious client cannot forge game state — the server (GET /api/party)
// is always the source of truth. Presence tracks who is connected.
// =====================================================================

import type { PartyBroadcastEvent } from '@/types'

/** Channel name for a party room. */
export function partyChannelName(code: string): string {
  return `party:${code}`
}

/** Single broadcast event name carrying a PartyBroadcastEvent payload. */
export const PARTY_BROADCAST = 'party'

export interface PartyPresenceState {
  userId: string
  username: string
}

export type { PartyBroadcastEvent }
