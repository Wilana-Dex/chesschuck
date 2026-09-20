import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import ChessBoard from './components/ChessBoard'
import BettingPanel from './components/BettingPanel'
import { useCasinoHost } from './hooks/useCasinoHost'
import StandaloneOverlay from './components/StandaloneOverlay' 

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

function parsePgn(pgn) {
  return pgn
    .replace(/\d+\.\.\.\s*/g, '')
    .replace(/\d+\.\s*/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\([^)]*\)/g, '')
    .trim()
    .split(/\s+/)
    .filter(m => m && !m.match(/^(1-0|0-1|1\/2-1\/2|\*|\$\d+)$/))
}

// Used by BettingPanel to centre the status pill over the visible board area
export const PANEL_W = 288  // 14px gap + 260px panel + 14px gap

export default function App() {
  const [moves,      setMoves]      = useState([])
  const [moveCount,  setMoveCount]  = useState(0)
  const [phase,      setPhase]      = useState('waiting')
  const [outcome,    setOutcome]    = useState(null)
  const [roundId,    setRoundId]    = useState(null)
  const [startedAt,  setStartedAt]  = useState(null)
  const [isDeciding, setIsDeciding] = useState(false)
  const [envMode,    setEnvMode]    = useState(false)

  // Tracks which round_id has had its moves committed to state.
  // Whichever fires second (broadcast vs DB fetch) checks this and bails,
  // preventing a double setMoves → double useEffect([moves]) → double startRound.
  const loadedRoundIdRef      = useRef(null)
  // Stable ref to fetchCurrentRound so the channel subscribe callback can call
  // it without creating a circular dep. Set once on mount, never changes.
  const fetchCurrentRoundRef  = useRef(null)

  const { hostApi, snapshot, isDemo } = useCasinoHost()

  useEffect(() => {
    async function fetchCurrentRound() {
      const { data: round } = await supabase
        .from('rounds')
        .select('round_id, phase, game_index, outcome, started_at')
        .order('round_id', { ascending: false })
        .limit(1)
        .single()
      if (!round) return

      // Gather game data BEFORE touching any state — ChessBoard must never
      // see the half-loaded (phase set, moves=[]) intermediate render.
      let parsed = [], mc = 0, sa = null
      if (round.phase === 'betting_open' || round.phase === 'betting_locked') {
        const { data: game } = await supabase
          .from('games')
          .select('pgn, move_count')
          .eq('id', round.game_index)
          .single()
        if (game) {
          parsed = parsePgn(game.pgn || '')
          mc     = game.move_count || parsed.length
          sa     = round.started_at || null
        }

        // Guard: if a broadcast already committed moves for this round (or a
        // newer one) while both queries were in flight, bail here. Setting
        // moves again would give useEffect([moves]) in ChessBoard a new array
        // reference, fire startRound() a second time, bump the epoch, and
        // kill the running animation. This is the primary cause of the
        // intermittent "board freezes on load" bug when the GLB is cached.
        if (
          round.phase === 'betting_open' &&
          loadedRoundIdRef.current !== null &&
          loadedRoundIdRef.current >= round.round_id
        ) return
      }

      // Mark round as loaded so the broadcast handler knows to skip it
      if (round.phase === 'betting_open') {
        loadedRoundIdRef.current = round.round_id
      }

      // Commit everything in one batch → one render → ChessBoard always
      // receives a consistent (phase, moves, startedAt) triple.
      setPhase(round.phase)
      setRoundId(round.round_id)
      setMoves(parsed)
      setMoveCount(mc)
      setStartedAt(sa)
      if (round.phase === 'result') setOutcome(round.outcome)
    }

    fetchCurrentRoundRef.current = fetchCurrentRound
    fetchCurrentRound()
  }, [])

  useEffect(() => {
    const ch = supabase
      .channel('chesschuck-rounds')
      .on('broadcast', { event: 'phase_change' }, ({ payload }) => {
        setPhase(payload.phase)
        setRoundId(payload.round_id)
        if (payload.phase === 'betting_open') {
          setOutcome(null); setIsDeciding(false)
          // Guard: pg_cron fires every 10s and the Edge Function may broadcast
          // betting_open on every tick, not just on transition. Each broadcast
          // produces a new array ref → useEffect([moves]) → startRound() →
          // epoch bump → kills the running animation. Same race if the DB fetch
          // beat the broadcast and already committed moves for this round_id.
          if (loadedRoundIdRef.current !== payload.round_id) {
            loadedRoundIdRef.current = payload.round_id
            const parsed = parsePgn(payload.pgn || '')
            setMoves(parsed)
            setMoveCount(payload.move_count || parsed.length)
            setStartedAt(payload.started_at || new Date().toISOString())
          }
        }
        if (payload.phase === 'result') setOutcome(payload.outcome)
      })
      .subscribe((status) => {
        // The Supabase WS handshake can take 1-3 seconds inside an SDK iframe.
        // If the initial fetchCurrentRound saw `result` phase, loadedRoundIdRef
        // stays null and the board idles at starting position. If a betting_open
        // broadcast fired during the handshake window it was silently missed —
        // nothing else would trigger a refetch. This subscribe callback closes
        // that gap: on channel SUBSCRIBED, if no game is loaded yet, do one
        // immediate re-fetch to catch whatever state the DB is currently in.
        if (status === 'SUBSCRIBED' && loadedRoundIdRef.current === null) {
          fetchCurrentRoundRef.current?.()
        }
      })
    return () => { supabase.removeChannel(ch) }
  }, [])

  useEffect(() => {
    if (phase !== 'betting_locked' || !startedAt) { setIsDeciding(false); return }
    const elapsed   = (Date.now() - new Date(startedAt).getTime()) / 1000
    const remaining = Math.max(0, (75 - elapsed) * 1000)
    if (elapsed >= 75) { setIsDeciding(true); return }
    const t = setTimeout(() => setIsDeciding(true), remaining)
    return () => clearTimeout(t)
  }, [phase, startedAt])

  useEffect(() => { setIsDeciding(false) }, [roundId])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#09090f', overflow: 'hidden' }}>
      {/* Board — full screen so the 3D room renders behind the glass panel */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <ChessBoard
          moves={moves} moveCount={moveCount} phase={phase}
          outcome={outcome} startedAt={startedAt}
          isDeciding={isDeciding} envMode={envMode}
        />
      </div>

      {/* Betting panel — floating left side */}
      <BettingPanel
        phase={phase} outcome={outcome} roundId={roundId}
        startedAt={startedAt} isDeciding={isDeciding}
        hostApi={hostApi} snapshot={snapshot} isDemo={isDemo}
        envMode={envMode} onEnvToggle={() => setEnvMode(e => !e)}
        panelW={PANEL_W}
      />

      <StandaloneOverlay isDemo={isDemo} />
    </div>
  )
}