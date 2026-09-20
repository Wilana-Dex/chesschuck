// supabase/functions/game-clock/index.ts
// Runs every 10 seconds via pg_cron.
// Reads current round, checks elapsed time, transitions phases, broadcasts.

import { createClient } from '@supabase/supabase-js'

const ROUND_DURATION    = 90   // seconds — full round
const BETTING_LOCK_AT   = 45   // seconds — betting closes
const RESULT_AT         = 80   // seconds — result declared
const _PAUSE_BEFORE_NEXT = 10   // seconds after result before new round

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// ── Broadcast helper ────────────────────────────────────────────────
async function broadcast(event: string, payload: Record<string, unknown>) {
  // Sending without .subscribe() makes a REST call — no WebSocket needed
  const channel = supabase.channel('chesschuck-rounds')
  await channel.send({ type: 'broadcast', event, payload })
}

// ── Pick a game for the next round ─────────────────────────────────
async function pickGame(seed: string): Promise<{ id: number; pgn: string; result: string; move_count: number }> {
  // Derive a game index from the round seed (simulating VRF selection)
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed))
  const view  = new DataView(hash)
  const index = view.getUint32(0, false) % 10000  // 0–9999

  const { data, error } = await supabase
    .from('games')
    .select('id, pgn, result, move_count')
    .eq('id', index)
    .single()

  if (error || !data) throw new Error(`Failed to pick game: ${error?.message}`)
  return data
}

// ── Start a new round ──────────────────────────────────────────────
async function startNewRound() {
  const seed = crypto.randomUUID()
  const game = await pickGame(seed)

  const { data: round, error } = await supabase
    .from('rounds')
    .insert({
      game_index:  game.id,
      phase:       'betting_open',
      started_at:  new Date().toISOString(),
      vrf_seed:    seed,
    })
    .select()
    .single()

  if (error || !round) throw new Error(`Failed to create round: ${error?.message}`)

  await broadcast('phase_change', {
    round_id:    round.round_id,
    phase:       'betting_open',
    game_index:  game.id,
    pgn:         game.pgn,
    move_count:  game.move_count,
    started_at:  round.started_at,
    lock_at:     BETTING_LOCK_AT,
    result_at:   RESULT_AT,
    round_ends:  ROUND_DURATION,
  })

  console.log(`New round ${round.round_id} started — game ${game.id} (${game.move_count} moves)`)
}

// ── Lock betting ────────────────────────────────────────────────────
async function lockBetting(roundId: number) {
  const { error } = await supabase
    .from('rounds')
    .update({ phase: 'betting_locked', locked_at: new Date().toISOString() })
    .eq('round_id', roundId)

  if (error) throw new Error(`Failed to lock betting: ${error.message}`)

  await broadcast('phase_change', {
    round_id: roundId,
    phase:    'betting_locked',
  })

  console.log(`Round ${roundId} — betting locked`)
}

// ── Declare result ──────────────────────────────────────────────────
async function declareResult(roundId: number, gameIndex: number) {
  const { data: game, error: gameErr } = await supabase
    .from('games')
    .select('result')
    .eq('id', gameIndex)
    .single()

  if (gameErr || !game) throw new Error(`Failed to get game result`)

  const { error } = await supabase
    .from('rounds')
    .update({
      phase:       'result',
      outcome:     game.result,
      resolved_at: new Date().toISOString(),
    })
    .eq('round_id', roundId)

  if (error) throw new Error(`Failed to declare result: ${error.message}`)

  await broadcast('phase_change', {
    round_id: roundId,
    phase:    'result',
    outcome:  game.result,           // 'white' | 'draw' | 'black'
  })

  console.log(`Round ${roundId} — result: ${game.result}`)
}

// ── Main handler ────────────────────────────────────────────────────
Deno.serve(async (_req) => {
  try {
    // Get the most recent round
    const { data: round, error } = await supabase
      .from('rounds')
      .select('round_id, phase, started_at, game_index')
      .order('round_id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(error.message)

    // No round yet — start the very first one
    if (!round) {
      await startNewRound()
      return new Response('First round started', { status: 200 })
    }

    const elapsed = (Date.now() - new Date(round.started_at).getTime()) / 1000

    // ── State machine ──────────────────────────────────────────────
    if (round.phase === 'betting_open' && elapsed >= BETTING_LOCK_AT) {
      await lockBetting(round.round_id)

    } else if (round.phase === 'betting_locked' && elapsed >= RESULT_AT) {
      await declareResult(round.round_id, round.game_index)

    } else if (round.phase === 'result' && elapsed >= ROUND_DURATION) {
      await startNewRound()

    } else if (round.phase === 'waiting') {
      // Shouldn't happen in normal flow but handle gracefully
      await startNewRound()
    }
    // If nothing needs to change — exit silently (most ticks do this)

    return new Response('OK', { status: 200 })

  } catch (err) {
    console.error('game-clock error:', err)
    return new Response(String(err), { status: 500 })
  }
})