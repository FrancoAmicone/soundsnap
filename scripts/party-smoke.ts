// =====================================================================
// SoundSnap — Party logic smoke test (no DB / no network)
// =====================================================================
// Exercises the deterministic core of party mode against the REAL
// exported functions: round planning, round count, code generation, and
// the Intermediate reveal mechanic. Run with:
//   node --experimental-strip-types \
//        --import ./scripts/register-alias.mjs \
//        scripts/party-smoke.ts
// =====================================================================

import {
  computeRoundPlan,
  computeTotalRounds,
  generatePartyCode,
  type MemberRow,
} from '@/lib/party'
import { buildClientTrack, sampleTracks } from '@/lib/tracks'
import { calcStreakBonus } from '@/lib/scoring'
import type { DeezerTrack, ServerTrack } from '@/types'

let passed = 0
let failed = 0

function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    console.error(`  ✗ ${label}\n      esperado: ${e}\n      obtenido: ${a}`)
  }
}

function ok(label: string, cond: boolean) {
  if (cond) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    console.error(`  ✗ ${label}`)
  }
}

function member(i: number): MemberRow {
  return {
    id: `m${i}`,
    user_id: `u${i}`,
    deezer_artist_id: `a${i}`,
    artist_name: `Artist ${i}`,
    is_ready: true,
    turn_order: i,
    profiles: { username: `user${i}`, avatar_url: null },
  }
}

const track: ServerTrack = {
  trackId: 't1',
  correctTitle: 'Secret Title',
  correctArtist: 'Secret Artist',
  previewUrl: 'https://preview',
  coverUrl: 'https://cover',
  mcOptions: ['Secret Title', 'B', 'C', 'D'],
  mcCorrectIndex: 0,
}

// ── computeTotalRounds ────────────────────────────────────────────────
console.log('\ncomputeTotalRounds')
eq('2 jugadores → 3 rondas (incluye mix)', computeTotalRounds(2), 3)
eq('3 jugadores → 3 rondas', computeTotalRounds(3), 3)
eq('5 jugadores → 5 rondas', computeTotalRounds(5), 5)
eq('10 jugadores → 10 rondas', computeTotalRounds(10), 10)

// ── computeRoundPlan: 2 players ───────────────────────────────────────
console.log('\ncomputeRoundPlan — 2 jugadores')
const two = [member(0), member(1)]
eq('R1 = artista de A', computeRoundPlan(1, two).type + ':' + computeRoundPlan(1, two).owner?.user_id, 'artist:u0')
eq('R2 = artista de B', computeRoundPlan(2, two).type + ':' + computeRoundPlan(2, two).owner?.user_id, 'artist:u1')
eq('R3 = mix (sin owner)', computeRoundPlan(3, two).type + ':' + String(computeRoundPlan(3, two).owner), 'mix:null')

// ── computeRoundPlan: N players (no mix) ──────────────────────────────
console.log('\ncomputeRoundPlan — 4 jugadores')
const four = [member(0), member(1), member(2), member(3)]
for (let r = 1; r <= 4; r++) {
  const plan = computeRoundPlan(r, four)
  eq(`R${r} = artista del jugador ${r - 1}`, plan.type + ':' + plan.owner?.user_id, `artist:u${r - 1}`)
}

// ── generatePartyCode ─────────────────────────────────────────────────
console.log('\ngeneratePartyCode')
const codes = Array.from({ length: 200 }, () => generatePartyCode())
ok('largo 6', codes.every((c) => c.length === 6))
ok('alfabeto sin caracteres ambiguos (I/O/0/1)', codes.every((c) => /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(c)))
ok('razonablemente únicos (200 muestras)', new Set(codes).size > 195)

// ── buildClientTrack: reveal mechanic + answer never leaked ───────────
console.log('\nbuildClientTrack — easy')
const easy = buildClientTrack('easy', track, 'playlist')
ok('expone coverUrl', easy.coverUrl === 'https://cover')
ok('expone mcOptions', Array.isArray(easy.mcOptions) && easy.mcOptions.length === 4)
ok('no expone artist', easy.artist === null)
ok('sin revealKind', easy.revealKind === undefined)

console.log('\nbuildClientTrack — intermediate / playlist (revela ARTISTA)')
const interPlaylist = buildClientTrack('intermediate', track, 'playlist')
eq('revealKind = artist', interPlaylist.revealKind, 'artist')
ok('expone artist (para revelar a 15s)', interPlaylist.artist === 'Secret Artist')
ok('NO expone coverUrl', interPlaylist.coverUrl === null)

console.log('\nbuildClientTrack — intermediate / artista (revela TAPA)')
const interArtist = buildClientTrack('intermediate', track, 'artist')
eq('revealKind = cover', interArtist.revealKind, 'cover')
ok('expone coverUrl (para revelar a 15s)', interArtist.coverUrl === 'https://cover')
ok('NO expone artist', interArtist.artist === null)

console.log('\nbuildClientTrack — hard')
const hard = buildClientTrack('hard', track, 'artist')
ok('no expone coverUrl', hard.coverUrl === null)
ok('no expone artist', hard.artist === null)
ok('no expone mcOptions', hard.mcOptions === null)

console.log('\nseguridad — la respuesta nunca se serializa')
// Easy: the title IS one of the 4 visible MC options by design; what must
// never leak is which one — i.e. mcCorrectIndex is absent from the payload.
ok('easy: sin mcCorrectIndex', !('mcCorrectIndex' in easy))
ok('easy: sin correctArtist', !JSON.stringify(easy).includes('Secret Artist'))
// Intermediate/Hard: the title is free-text → it must not appear at all.
for (const ct of [interPlaylist, interArtist, hard]) {
  ok('payload sin correctTitle', !JSON.stringify(ct).includes('Secret Title'))
}

// ── sampleTracks: anti-repeat ─────────────────────────────────────────
console.log('\nsampleTracks — anti-repetición')
function dz(id: string): DeezerTrack {
  return { id, name: `T${id}`, artist: 'A', albumName: 'Al', previewUrl: 'p', coverUrl: null }
}
const pool10 = Array.from({ length: 10 }, (_, i) => dz(String(i)))

const noExclude = sampleTracks(pool10, 5)
ok('sin exclude: devuelve 5', noExclude.length === 5)
ok('sin exclude: sin duplicados', new Set(noExclude.map((t) => t.id)).size === 5)

const exclude = new Set(['0', '1', '2', '3', '4'])
let avoided = 0
for (let i = 0; i < 50; i++) {
  const picked = sampleTracks(pool10, 5, exclude)
  if (picked.every((t) => !exclude.has(t.id))) avoided++
}
ok('con 5 frescos disponibles: nunca toca los excluidos (50 corridas)', avoided === 50)

// Not enough fresh → must top up with excluded (never returns < count).
const exclude8 = new Set(['0', '1', '2', '3', '4', '5', '6', '7'])
const topUp = sampleTracks(pool10, 5, exclude8)
ok('pozo insuficiente de frescos: igual devuelve 5', topUp.length === 5)
ok('top-up: incluye los 2 frescos (8,9)', topUp.some((t) => t.id === '8') && topUp.some((t) => t.id === '9'))
ok('top-up: sin duplicados', new Set(topUp.map((t) => t.id)).size === 5)

// ── calcStreakBonus ───────────────────────────────────────────────────
console.log('\ncalcStreakBonus')
eq('racha 1 → 0', calcStreakBonus(1), 0)
eq('racha 2 → 25', calcStreakBonus(2), 25)
eq('racha 3 → 50', calcStreakBonus(3), 50)
eq('racha 6 → 125 (cap)', calcStreakBonus(6), 125)
eq('racha 12 → 125 (cap)', calcStreakBonus(12), 125)
eq('racha 0 → 0', calcStreakBonus(0), 0)

// ── Summary ───────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
