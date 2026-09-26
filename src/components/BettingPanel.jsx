import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createClient }                                        from '@supabase/supabase-js'
import { encodeAbiParameters, decodeAbiParameters, parseUnits, formatUnits } from 'viem'
import { computeMaxWager }                                     from '../casino-sdk/guest'
import { FaTrophy, FaSadTear, FaChevronLeft, FaChevronRight, FaCheck, FaSync, FaChevronDown } from 'react-icons/fa'
import { GiChessKnight, GiChessPawn, GiChessRook, GiChessQueen, GiChessBishop, GiChessKing, GiCastle } from 'react-icons/gi'
import { createSoundEngine } from '../audio/soundEngine'
import { BsGridFill, BsClockHistory, BsListUl, BsExclamationTriangleFill, BsVolumeUpFill, BsVolumeMuteFill } from 'react-icons/bs'

// Supabase client — live bets feed only, separate from App.jsx channel
const liveSb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// ─── Constants ───────────────────────────────────────────────────────────────
const EMPTY_HEX       = '0x'
const BETTING_LOCK_AT = 45
const DEMO_DECIMALS   = 18
const DEMO_START_BAL  = 1_000n * 10n ** BigInt(DEMO_DECIMALS)

const OUTCOMES = [
  { prediction: 0, label: 'WHITE WINS', color: '#F59E0B', r: 245, g: 159, b: 11,  mult: 2.5333, multBps: 25_333n },
  { prediction: 1, label: 'DRAW',       color: '#8B5CF6', r: 139, g: 92,  b: 246, mult: 2.7220, multBps: 27_220n },
  { prediction: 2, label: 'BLACK WINS', color: '#3B82F6', r: 59,  g: 130, b: 246, mult: 3.4420, multBps: 34_420n },
]
const OUTCOME_TO_IDX = { white: 0, draw: 1, black: 2 }
const ROUND_META     = {
  white: { label: 'WHITE WINS', color: '#F59E0B' },
  draw:  { label: 'DRAW',       color: '#8B5CF6' },
  black: { label: 'BLACK WINS', color: '#3B82F6' },
}

const DECIDING_TEXTS = [
  'Evaluating…',
  'Calculating…',
  'Analyzing positions on both sides…',
]

// ─── Typography ───────────────────────────────────────────────────────────────
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
const MONO  = "ui-monospace, 'SF Mono', Menlo, monospace"

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700;14..32,800;14..32,900&display=swap');
@keyframes cc-spin      { to{transform:rotate(360deg)} }
@keyframes cc-chess-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
@keyframes cc-pop       { 0%{transform:scale(.85);opacity:0} 60%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
@keyframes cc-fadein    { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
@keyframes cc-shimmer   { 0%{left:-60%} 100%{left:120%} }
@keyframes cc-toast-in  { from{opacity:0;transform:translateX(calc(100%+20px)) scale(.95)} to{opacity:1;transform:translateX(0) scale(1)} }
@keyframes cc-toast-out { from{opacity:1;transform:translateX(0)} to{opacity:0;transform:translateX(calc(100%+20px))} }
@keyframes cc-slide-up   { from{opacity:0;transform:translateY(10px)}  to{opacity:1;transform:translateY(0)} }
@keyframes cc-slide-down { from{opacity:0;transform:translateY(-8px)}  to{opacity:1;transform:translateY(0)} }
@keyframes cc-panel-in  { from{opacity:0;transform:translateX(-14px) scale(.97)} to{opacity:1;transform:translateX(0) scale(1)} }
@keyframes cc-panel-out { from{opacity:1;transform:translateX(0) scale(1)} to{opacity:0;transform:translateX(-14px) scale(.97)} }
@keyframes cc-sheet-in  { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
@keyframes cc-sheet-out { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(24px)} }
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
input[type=number]{-moz-appearance:textfield}
.cc-panel{scrollbar-width:none;-ms-overflow-style:none}
.cc-panel::-webkit-scrollbar{display:none}
.cc-qbtn:hover:not(:disabled){filter:brightness(1.18);transform:translateY(-1px)}
.cc-qbtn:active:not(:disabled){transform:translateY(0) scale(.97)}
.cc-outcome:hover:not(:disabled){filter:brightness(1.08);transform:translateY(-1px) scale(1.01)}
.cc-icon-btn:hover{opacity:.8}
.cc-reload-row:hover{background:rgba(245,158,11,0.08)!important}
@media (pointer: fine) {
  body {
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512' width='32' height='32'%3E%3Cpath fill='%23F5F3EE' d='M60.81 476.91h300v-60h-300v60zm233.79-347.3l13.94 7.39c31.88-43.62 61.34-31.85 61.34-31.85l-21.62 53 35.64 19 2.87 33 64.42 108.75-43.55 29.37s-26.82-36.39-39.65-43.66c-10.66-6-41.22-10.25-56.17-12l-67.54-76.91-12 10.56 37.15 42.31c-.13.18-.25.37-.38.57-35.78 58.17 23 105.69 68.49 131.78H84.14C93 85 294.6 129.61 294.6 129.61z'/%3E%3C/svg%3E") 4 4, auto;
  }
  input, textarea { cursor: text; }
}
`

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(wei, dec) {
  if (wei == null) return '—'
  const n = parseFloat(formatUnits(wei, dec))
  if (isNaN(n)) return '—'
  return n >= 10000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
       : n >= 1     ? n.toFixed(2)
       : n.toFixed(4)
}
function gc({ r, g, b }, a) { return `rgba(${r},${g},${b},${a})` }


// Outcome the CONTRACT drew, read from the settled session's gameState:
// abi.encode(uint8 prediction, uint32 roundId, uint8 outcome, bool settled)
function contractOutcomeIdx(gameState) {
  try {
    const [, , outcome] = decodeAbiParameters(
      [{ type: 'uint8' }, { type: 'uint32' }, { type: 'uint8' }, { type: 'bool' }],
      gameState
    )
    return outcome <= 2 ? Number(outcome) : null
  } catch { return null }
}

function timeAgo(iso) {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60)   return `${Math.floor(s)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

// Shared glass surface
const glassSurface = {
  background:           'rgba(8,9,22,0.78)',
  backdropFilter:       'blur(40px) saturate(200%)',
  WebkitBackdropFilter: 'blur(40px) saturate(200%)',
  border:               '1px solid rgba(255,255,255,0.07)',
  borderTopColor:       'rgba(255,255,255,0.22)',
  boxShadow: [
    '0 20px 60px rgba(0,0,0,0.65)',
    '0 4px 16px rgba(0,0,0,0.35)',
    'inset 0 1px 0 rgba(255,255,255,0.14)',
    'inset 0 -1px 0 rgba(0,0,0,0.20)',
  ].join(','),
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
function Spinner({ color, size = 14 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      border: `2px solid rgba(255,255,255,0.08)`, borderTopColor: color,
      animation: 'cc-spin .75s linear infinite',
    }} />
  )
}

// ─── Phase icon ───────────────────────────────────────────────────────────────
function PhaseIcon({ phase, color, isResult }) {
  const glow = { filter: `drop-shadow(0 0 5px ${color})`, flexShrink: 0 }
  if (isResult)
    return <GiChessQueen size={14} color={color} style={{ ...glow, animation: 'cc-pop .5s cubic-bezier(.34,1.56,.64,1) both' }} />
  if (phase === 'betting_open')
    return <GiChessPawn  size={14} color={color} style={{ ...glow, animation: 'cc-chess-bob 1.5s ease-in-out infinite' }} />
  if (phase === 'betting_locked')
    return <GiChessRook  size={14} color={color} style={glow} />
  return <GiChessRook size={14} color="rgba(255,255,255,0.2)" style={{ flexShrink: 0 }} />
}

// ─── Toast ────────────────────────────────────────────────────────────────────
const TOAST_ICONS = { trophy: FaTrophy, sad: FaSadTear, knight: GiChessKnight }

function ToastItem({ t, onRemove }) {
  const [out, setOut] = useState(false)
  useEffect(() => {
    const a = setTimeout(() => setOut(true), (t.duration ?? 5000) - 380)
    const b = setTimeout(() => onRemove(t.id), t.duration ?? 5000)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [])
  const Icon = TOAST_ICONS[t.iconType]
  return (
    <div
      onClick={() => { setOut(true); setTimeout(() => onRemove(t.id), 380) }}
      style={{
        animation: out
          ? 'cc-toast-out .38s cubic-bezier(.32,0,.67,0) forwards'
          : 'cc-toast-in  .44s cubic-bezier(.34,1.56,.64,1) both',
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '11px 13px 11px 11px',
        background: 'rgba(9,10,20,0.92)',
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px)',
        border: `1px solid ${t.color ? t.color + '30' : 'rgba(255,255,255,0.08)'}`,
        borderTopColor: t.color ? t.color + '65' : 'rgba(255,255,255,0.2)',
        borderRadius: 16,
        boxShadow: `0 8px 32px rgba(0,0,0,0.55)${t.color ? `, 0 0 18px ${t.color}15` : ''}`,
        minWidth: 220, maxWidth: 280, cursor: 'pointer', pointerEvents: 'auto',
      }}
    >
      {Icon && <Icon size={20} color={t.color ?? 'rgba(255,255,255,0.7)'} style={{ flexShrink: 0, marginTop: 1 }} />}
      <div>
        <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: t.color ?? 'rgba(255,255,255,0.95)', marginBottom: 3 }}>{t.title}</div>
        <div style={{ fontFamily: INTER, fontSize: 9.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{t.subtitle}</div>
      </div>
    </div>
  )
}

// sits just below the balance pill (balance is top:14 ~31px tall → toasts at top:60)
// embedded=true: render just the toast items, no own fixed position — used on
// mobile where a shared parent stack (toasts + icon column) owns positioning,
// so toasts and the icon column push each other via real flex layout instead
// of two fixed positions guessing at each other's height.
function ToastStack({ toasts, onRemove, embedded = false }) {
  const items = toasts.map(t => <ToastItem key={t.id} t={t} onRemove={onRemove} />)
  if (embedded) return <>{items}</>
  return (
    <div style={{
      position: 'fixed', top: 60, right: 14, zIndex: 600,
      display: 'flex', flexDirection: 'column', gap: 6,
      pointerEvents: 'none', alignItems: 'flex-end',
    }}>
      {items}
    </div>
  )
}

// ─── LeftControls — wraps the danger pill + sound pill in one flex column,
// so the sound pill gets pushed down automatically when the dropdown opens
// instead of relying on a fixed offset that can collide with it ───────────
function LeftControls({ compact = false }) {
  return (
    <div style={{
      position: 'fixed', top: 14, left: 14, zIndex: 300,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
    }}>
      <ReloadControl compact={compact} />
      <SoundControl compact={compact} />
    </div>
  )
}

// ─── ReloadControl — top-left danger pill ────────────────────────────────────
function ReloadControl({ compact = false }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* ── Trigger pill ──────────────────────────────────────────── */}
      <div style={{ ...glassSurface, borderRadius: 999, padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
        {/* Icon zone */}
        <button
          onClick={() => setOpen(o => !o)}
          className="cc-icon-btn"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: compact ? '9px 13px' : '9px 11px 9px 13px',
            background: 'transparent', border: 'none', cursor: 'pointer',
          }}
        >
          <BsExclamationTriangleFill
            size={13}
            color={open ? '#F59E0B' : 'rgba(245,158,11,0.55)'}
            style={open ? { filter: 'drop-shadow(0 0 5px #F59E0B88)' } : undefined}
          />
        </button>
        {/* Chevron zone — dropped on mobile to save width, icon zone alone still toggles */}
        {!compact && (
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '9px 11px 9px 6px',
              background: 'transparent', border: 'none',
              borderLeft: '1px solid rgba(255,255,255,0.06)',
              cursor: 'pointer',
            }}
          >
            <FaChevronDown
              size={9}
              color="rgba(255,255,255,0.22)"
              style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }}
            />
          </button>
        )}
      </div>

      {/* ── Dropdown panel — opens downward ───────────────────────── */}
      {open && (
        <div style={{
          ...glassSurface,
          borderRadius: 14, overflow: 'hidden', width: 168,
          animation: 'cc-slide-down .2s cubic-bezier(.23,1,.32,1)',
        }}>
          <div style={{
            padding: '9px 14px 7px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            fontFamily: INTER, fontSize: 9, fontWeight: 700,
            letterSpacing: '0.14em', color: 'rgba(255,255,255,0.25)',
          }}>
            PIECES NOT MOVING?
          </div>
          <button
            onClick={() => window.location.reload()}
            className="cc-reload-row"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 9,
              padding: '10px 14px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: INTER, fontSize: 10, fontWeight: 700,
              color: '#F59E0B', letterSpacing: '0.08em',
            }}
          >
            <FaSync size={11} color="#F59E0B" />
            RELOAD
          </button>
        </div>
      )}
    </>
  )
}

// ─── SoundControl — sits inside LeftControls, right under the danger pill ───
function SoundControl({ compact = false }) {
  const [on,       setOn]       = useState(false)
  const [expanded, setExpanded] = useState(false)
  const engineRef = useRef(null)

  useEffect(() => {
    engineRef.current = createSoundEngine()
    return () => engineRef.current?.stop()
  }, [])

  const toggle = () => {
    setOn(o => {
      const next = !o
      next ? engineRef.current?.start() : engineRef.current?.stop()
      return next
    })
  }

  return (
    <div style={{ ...glassSurface, borderRadius: 999, padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
        <button
          onClick={toggle}
          className="cc-icon-btn"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: compact ? '9px 13px' : (expanded ? '9px 10px 9px 13px' : '9px 13px'),
            background: 'transparent', border: 'none', cursor: 'pointer',
            transition: 'padding .22s',
          }}
        >
          {on
            ? <BsVolumeUpFill   size={13} color="#a78bfa" style={{ filter: 'drop-shadow(0 0 5px #a78bfa)' }} />
            : <BsVolumeMuteFill size={13} color="rgba(255,255,255,0.40)" />
          }
        </button>
        {!compact && expanded && (
          <button
            onClick={toggle}
            style={{
              fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              color: on ? '#a78bfa' : 'rgba(255,255,255,0.32)',
              animation: 'cc-fadein .18s ease', whiteSpace: 'nowrap',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '0 6px 0 0', lineHeight: 1,
            }}
          >
            {on ? 'SOUND ON' : 'SOUND OFF'}
          </button>
        )}
        {!compact && (
          <button
            onClick={() => setExpanded(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '9px 11px 9px 4px',
              background: 'transparent', border: 'none',
              borderLeft: '1px solid rgba(255,255,255,0.06)',
              cursor: 'pointer', transition: 'color .15s',
            }}
          >
            {expanded
              ? <FaChevronLeft  size={9} color="rgba(255,255,255,0.22)" />
              : <FaChevronRight size={9} color="rgba(255,255,255,0.22)" />
            }
          </button>
        )}
      </div>
  )
}

// ─── RecentRoundsPanel — last completed rounds; shared by RightControls'
// desktop dock and the mobile sheet, so this logic only lives in one place ──
function RecentRoundsPanel() {
  const [rounds, setRounds] = useState([])
  const [tick,   setTick]   = useState(0)

  useEffect(() => {
    liveSb.from('rounds')
      .select('round_id, outcome, resolved_at')
      .not('outcome', 'is', null)
      .order('round_id', { ascending: false })
      .limit(7)
      .then(({ data }) => { if (data) setRounds(data) })

    const ch = liveSb.channel('cc-right-feed')
      .on('broadcast', { event: 'phase_change' }, ({ payload }) => {
        if (payload.phase === 'result' && payload.outcome) {
          setRounds(prev => [
            { round_id: payload.round_id, outcome: payload.outcome, resolved_at: new Date().toISOString() },
            ...prev.slice(0, 14),
          ])
        }
      })
      .subscribe()

    const t = setInterval(() => setTick(n => n + 1), 30_000)
    return () => { liveSb.removeChannel(ch); clearInterval(t) }
  }, [])

  return (
    <div className="cc-panel" style={{ maxHeight: 'calc(100vh - 190px)', overflowY: 'auto' }}>
      {rounds.length === 0 ? (
        <div style={{ padding: '20px 14px', textAlign: 'center', fontFamily: INTER, fontSize: 9, color: 'rgba(255,255,255,0.18)' }}>
          No completed rounds yet
        </div>
      ) : rounds.map((r, i) => {
        const meta = ROUND_META[r.outcome] ?? { label: (r.outcome ?? '?').toUpperCase(), color: '#fff' }
        return (
          <div key={r.round_id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 14px',
            borderBottom: i < rounds.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            background: i === 0 ? 'rgba(139,92,246,0.06)' : 'transparent',
          }}>
            <span style={{ fontFamily: MONO, fontSize: 8.5, color: 'rgba(255,255,255,0.2)', fontVariantNumeric: 'tabular-nums' }}>
              #{r.round_id}
            </span>
            <span style={{ fontFamily: INTER, fontSize: 9, fontWeight: 700, color: meta.color, letterSpacing: '0.06em' }}>
              {meta.label}
            </span>
            <span style={{ fontFamily: INTER, fontSize: 8, color: 'rgba(255,255,255,0.16)' }}>
              {tick >= 0 && timeAgo(r.resolved_at)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── RightControls — ROOM toggle + live bets feed + move log ────────────────
function RightControls({
  envMode, onToggle, moveLog = [],
  isMobile = false, mobileSheet = null, setMobileSheet = () => {},
  movesOpenIdx = 0, setMovesOpenIdx = () => {},
  embedded = false,
}) {
  const [roomExpanded,  setRoomExpanded]  = useState(false)
  const [betsExpanded,  setBetsExpanded]  = useState(false)
  const [movesExpanded, setMovesExpanded] = useState(false)
  const [activePanel,   setActivePanel]   = useState(null) // desktop/tablet only

  // Whichever mechanism owns it right now
  const shownPanel = isMobile ? mobileSheet : activePanel

  useEffect(() => {
    if (moveLog.length === 0) setMovesOpenIdx(0)
  }, [moveLog])

  const pillBase = {
    ...glassSurface,
    display: 'flex', alignItems: 'center',
    border: 'none', cursor: 'pointer',
    transition: 'all .22s cubic-bezier(.23,1,.32,1)',
    pointerEvents: 'auto', // needed once embedded inside a pointerEvents:none parent stack
  }

  const openBets = () => {
    if (isMobile) setMobileSheet(p => (p === 'bets' ? null : 'bets'))
    else setActivePanel(p => (p === 'bets' ? null : 'bets'))
  }
  const openMoves = () => {
    if (isMobile) setMobileSheet(p => (p === 'moves' ? null : 'moves'))
    else setActivePanel(p => (p === 'moves' ? null : 'moves'))
    setMovesOpenIdx(moveLog.length)
  }

  const pills = (
    <>
      {/* ── Docked panel — desktop/tablet only. On mobile, BETS/MOVES
          render inside the shared bottom sheet in BettingPanel instead ── */}
      {!isMobile && activePanel && (
        <div style={{
          position: 'fixed', right: 92, top: '50%', transform: 'translateY(-50%)',
          width: 268,
          ...glassSurface,
          borderRadius: 16, overflow: 'hidden',
          animation: 'cc-panel-in .22s cubic-bezier(.23,1,.32,1)',
        }}>
          <div style={{
            padding: '10px 14px 8px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            fontFamily: INTER, fontSize: 9, fontWeight: 700,
            letterSpacing: '0.16em', color: 'rgba(255,255,255,0.25)',
          }}>
            {activePanel === 'bets' ? 'RECENT ROUNDS' : 'MOVE HISTORY'}
          </div>
          {activePanel === 'bets'
            ? <RecentRoundsPanel />
            : <MoveLogPanel moveLog={moveLog} openIndex={movesOpenIdx} />
          }
        </div>
      )}

      {/* ── Bets toggle pill ───────────────────────────────────────── */}
      <div style={{ ...pillBase, borderRadius: 999, padding: 0, overflow: 'hidden' }}>
        <button
          onClick={openBets}
          className="cc-icon-btn"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: betsExpanded ? '9px 10px 9px 13px' : '9px 13px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            transition: 'padding .22s',
          }}
        >
          <BsClockHistory
            size={13}
            color={shownPanel === 'bets' ? '#a78bfa' : 'rgba(255,255,255,0.40)'}
            style={shownPanel === 'bets' ? { filter: 'drop-shadow(0 0 5px #a78bfa)' } : undefined}
          />
        </button>
        {betsExpanded && (
          <button
            onClick={openBets}
            style={{
              fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              color: shownPanel === 'bets' ? '#a78bfa' : 'rgba(255,255,255,0.32)',
              animation: 'cc-fadein .18s ease', whiteSpace: 'nowrap',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '0 6px 0 0', lineHeight: 1,
            }}
          >
            BETS
          </button>
        )}
        <button
          onClick={() => setBetsExpanded(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '9px 11px 9px 4px',
            background: 'transparent', border: 'none',
            borderLeft: '1px solid rgba(255,255,255,0.06)',
            cursor: 'pointer', transition: 'color .15s',
          }}
        >
          {betsExpanded
            ? <FaChevronLeft  size={9} color="rgba(255,255,255,0.22)" />
            : <FaChevronRight size={9} color="rgba(255,255,255,0.22)" />
          }
        </button>
      </div>

      {/* ── Moves toggle pill ───────────────────────────────────────── */}
      <div style={{ ...pillBase, borderRadius: 999, padding: 0, overflow: 'hidden' }}>
        <button
          onClick={openMoves}
          className="cc-icon-btn"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: movesExpanded ? '9px 10px 9px 13px' : '9px 13px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            transition: 'padding .22s',
          }}
        >
          <BsListUl
            size={13}
            color={shownPanel === 'moves' ? '#a78bfa' : 'rgba(255,255,255,0.40)'}
            style={shownPanel === 'moves' ? { filter: 'drop-shadow(0 0 5px #a78bfa)' } : undefined}
          />
        </button>
        {movesExpanded && (
          <button
            onClick={openMoves}
            style={{
              fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              color: shownPanel === 'moves' ? '#a78bfa' : 'rgba(255,255,255,0.32)',
              animation: 'cc-fadein .18s ease', whiteSpace: 'nowrap',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '0 6px 0 0', lineHeight: 1,
            }}
          >
            MOVES
          </button>
        )}
        <button
          onClick={() => setMovesExpanded(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '9px 11px 9px 4px',
            background: 'transparent', border: 'none',
            borderLeft: '1px solid rgba(255,255,255,0.06)',
            cursor: 'pointer', transition: 'color .15s',
          }}
        >
          {movesExpanded
            ? <FaChevronLeft  size={9} color="rgba(255,255,255,0.22)" />
            : <FaChevronRight size={9} color="rgba(255,255,255,0.22)" />
          }
        </button>
      </div>

      {/* ── Room toggle pill — icon click = toggle, › click = expand ── */}
      <div style={{ ...pillBase, borderRadius: 999, padding: 0, overflow: 'hidden' }}>
        <button
          onClick={onToggle}
          title={envMode ? 'Switch to plain' : 'Switch to room'}
          className="cc-icon-btn"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: roomExpanded ? '9px 10px 9px 13px' : '9px 13px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            transition: 'padding .22s',
          }}
        >
          {envMode
            ? <GiCastle  size={15} color="#a78bfa" style={{ filter: 'drop-shadow(0 0 5px #a78bfa)' }} />
            : <BsGridFill size={13} color="rgba(255,255,255,0.40)" />
          }
        </button>
        {roomExpanded && (
          <button
            onClick={onToggle}
            style={{
              fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              color: envMode ? '#a78bfa' : 'rgba(255,255,255,0.32)',
              animation: 'cc-fadein .18s ease', whiteSpace: 'nowrap',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '0 6px 0 0', lineHeight: 1,
            }}
          >
            {envMode ? 'ROOM' : 'PLAIN'}
          </button>
        )}
        <button
          onClick={() => setRoomExpanded(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '9px 11px 9px 4px',
            background: 'transparent', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.06)',
            cursor: 'pointer',
          }}
        >
          {roomExpanded
            ? <FaChevronLeft  size={9} color="rgba(255,255,255,0.22)" />
            : <FaChevronRight size={9} color="rgba(255,255,255,0.22)" />
          }
        </button>
      </div>
    </>
  )

  if (embedded) return pills

  return (
    <div style={{
      position: 'fixed', right: 14, top: '50%', transform: 'translateY(-50%)', zIndex: 300,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
    }}>
      {pills}
    </div>
  )
}

// ─── MoveLogPanel — 4-row rolling window, oldest fades out as a new one lands ──
const PIECE_ICONS = { p: GiChessPawn, n: GiChessKnight, b: GiChessBishop, r: GiChessRook, q: GiChessQueen, k: GiChessKing }
// Board piece colors are tuned for studio lighting on 3D meshes — literal
// near-black reads as invisible on this flat glass panel, so black pieces
// get a lighter cool-grey tint here instead of the board's actual C.BLACK_PC.
const PIECE_TINT  = { w: '#F5F3EE', b: '#9AA3B8' }

function MoveRow({ m }) {
  const Icon     = PIECE_ICONS[m.piece] ?? GiChessPawn
  const CapIcon  = m.captured ? (PIECE_ICONS[m.captured] ?? GiChessPawn) : null
  const capColor = m.color === 'w' ? 'b' : 'w' // captured piece is always the opposite color
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
      <Icon size={13} color={PIECE_TINT[m.color]} style={{ flexShrink: 0 }} />
      <span>moved to {m.to}</span>
      {CapIcon && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          (captured <CapIcon size={13} color={PIECE_TINT[capColor]} style={{ flexShrink: 0 }} />)
        </span>
      )}
    </span>
  )
}

function MoveLogPanel({ moveLog, openIndex }) {
  const [rows, setRows] = useState([])
  const seenRef = useRef(openIndex)

  // Panel just opened, or the round reset — clear and re-anchor to the new offset
  useEffect(() => {
    seenRef.current = openIndex
    setRows([])
  }, [openIndex])

  // New moves landed — append, and if we're over 4, animate the oldest out
  useEffect(() => {
    if (moveLog.length <= seenRef.current) return
    const fresh = moveLog.slice(seenRef.current).map((m, i) => ({ ...m, _id: `${seenRef.current + i}` }))
    seenRef.current = moveLog.length
    setRows(prev => {
      const merged = [...prev, ...fresh]
      if (merged.length > 4) {
        const leavingId = merged[0]._id
        setTimeout(() => setRows(r => r.filter(row => row._id !== leavingId)), 260)
        return merged.map((row, i) => i === 0 ? { ...row, leaving: true } : row)
      }
      return merged
    })
  }, [moveLog, openIndex])

  return (
    <div>
      {rows.length === 0 ? (
        <div style={{ padding: '20px 14px', textAlign: 'center', fontFamily: INTER, fontSize: 9, color: 'rgba(255,255,255,0.18)' }}>
          Waiting for the next move…
        </div>
      ) : [...rows].reverse().map((r, i, arr) => (
        <div key={r._id} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '10px 14px',
          borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
          background: i === 0 ? 'rgba(139,92,246,0.06)' : 'transparent',
          fontFamily: INTER, fontSize: 9.5, color: 'rgba(255,255,255,0.55)',
          animation: r.leaving
            ? 'cc-toast-out .26s cubic-bezier(.32,0,.67,0) forwards'
            : 'cc-slide-down .22s cubic-bezier(.23,1,.32,1)',
        }}>
          <MoveRow m={r} />
        </div>
      ))}
    </div>
  )
}

// ─── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: INTER, fontSize: 9, fontWeight: 600,
      letterSpacing: '0.14em', color: 'rgba(255,255,255,0.22)', marginBottom: 7,
    }}>
      {children}
    </div>
  )
}

// ─── Divider ──────────────────────────────────────────────────────────────────
function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BettingPanel({
  phase, outcome, roundId, startedAt,
  isDeciding = false,
  hostApi, snapshot, isDemo,
  envMode = false, onEnvToggle = () => {},
  panelW = 288,
  moveLog = [],
  tier = 'desktop',
}) {
  const isMobile = tier === 'mobile'
  const isTablet = tier === 'tablet'
  // Mobile-only: BET / BETS / MOVES share one bottom-sheet slot instead of
  // separately-floating chrome. Desktop/tablet keep the existing independent
  // panelOpen + RightControls' own activePanel — untouched, this is unused there.
  const [mobileSheet,  setMobileSheet]  = useState(null) // null | 'bet' | 'bets' | 'moves'
  const [movesOpenIdx, setMovesOpenIdx] = useState(0)
  const [tick,        setTick]        = useState(0)
  const [selected,    setSelected]    = useState(null)
  const [wagerInput,  setWagerInput]  = useState('10')
  const [betState,    setBetState]    = useState('idle')
  const [session,     setSession]     = useState(null)
  const [error,       setError]       = useState(null)
  const [demoBalance, setDemoBalance] = useState(DEMO_START_BAL)
  const [decidingIdx, setDecidingIdx] = useState(0)
  const [displayPay,  setDisplayPay]  = useState(null)
  const [displayBal, setDisplayBal] = useState(undefined)
  const [balFlash,   setBalFlash]   = useState(null)   // 'up' | 'down' | null
  const balTextRef = useRef(null)
  const dispBalRef = useRef(undefined)             // value currently on screen
  const [panelOpen,     setPanelOpen]     = useState(true)
  const [panelClosing,  setPanelClosing]  = useState(false)  // FIX: close animation state

  const revealedRef    = useRef(false)
  const toastedRef     = useRef(false)
  const toastIdRef     = useRef(0)
  const balCreditedRef = useRef(false)

  const [toasts,     setToasts]     = useState([])
  const [pendingPay, setPendingPay] = useState(0n)

  const addToast    = useCallback((t) => { const id = ++toastIdRef.current; setToasts(p => [...p, { ...t, id }]) }, [])
  const removeToast = useCallback((id) => setToasts(p => p.filter(t => t.id !== id)), [])

  // FIX: close panel with exit animation
  const handlePanelClose = useCallback(() => {
    if (isMobile) { setMobileSheet(null); return }
    setPanelOpen(false)
    setPanelClosing(true)
    setTimeout(() => setPanelClosing(false), 240)
  }, [isMobile])

  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id) }, [])

  useEffect(() => {
    setBetState('idle'); setSession(null)
    setError(null); revealedRef.current = false; toastedRef.current = false; setDisplayPay(null)
    setPendingPay(0n); balCreditedRef.current = false
  }, [roundId])

  useEffect(() => {
    if (!isDeciding) { setDecidingIdx(0); return }
    const t1 = setTimeout(() => setDecidingIdx(1), 1600)
    const t2 = setTimeout(() => setDecidingIdx(2), 3200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [isDeciding])

  const decimals = isDemo ? DEMO_DECIMALS : (snapshot?.token?.decimals ?? 18)
  const symbol   = isDemo ? 'chUSD'       : (snapshot?.token?.symbol   ?? 'chUSD')
  const balance  = isDemo ? demoBalance
    : (() => { const r = snapshot?.balances?.smartVaultBalance; return r != null ? BigInt(r) + pendingPay : undefined })()
  
  // Count-up / count-down animation for the balance pill.
  // Writes straight to the DOM (no React state) so the panel doesn't re-render every frame.
  useEffect(() => {
    const el   = balTextRef.current
    const show = (v) => { if (el) el.textContent = fmt(v, decimals) }
    if (el) el.style.color = 'rgba(255,255,255,0.92)'
    if (balance === undefined) { dispBalRef.current = undefined; show(undefined); return }
    const from = dispBalRef.current
    if (from === undefined || from === balance) { dispBalRef.current = balance; show(balance); return }
    const to    = balance
    const start = performance.now()
    const dur   = 900   // ms, change this to speed it up or slow it down
    if (el) el.style.color = to > from ? '#34D399' : '#F87171'
    let raf
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur)
      const e = 1 - Math.pow(1 - t, 3)
      const v = t < 1 ? from + BigInt(Math.round(Number(to - from) * e)) : to
      dispBalRef.current = v
      show(v)
      if (t < 1) raf = requestAnimationFrame(tick)
      else if (el) el.style.color = 'rgba(255,255,255,0.92)'
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [balance, decimals])



  // TEMP DIAGNOSTIC — remove after balance bug is fixed
  useEffect(() => {
    if (isDemo) return
    const row = snapshot?.sessions?.items?.find(i => i.sessionKey === session?.sessionKey)
    console.log('[CC] bal', {
      phase, roundId,
      vault: snapshot?.balances?.smartVaultBalance,
      pendingPay: pendingPay.toString(),
      shown: balance?.toString(),
      row,
      t: Date.now(),
    })
  }, [phase, roundId, snapshot, pendingPay])

  const wager = useMemo(() => {
    try { const v = parseUnits(wagerInput.trim() || '0', decimals); return v > 0n ? v : null }
    catch { return null }
  }, [wagerInput, decimals])

  const platformMax = useMemo(() => {
    if (isDemo || selected === null || !snapshot) return undefined
    const r = computeMaxWager(snapshot, { maxMultiplierX: OUTCOMES[selected].mult })
    return r.kind === 'limit' ? r.maxWager : undefined
  }, [snapshot, selected, isDemo])

  const effectiveMax = useMemo(() => {
    const caps = [balance, platformMax].filter(v => v !== undefined && v > 0n)
    return caps.length ? caps.reduce((a, b) => a < b ? a : b) : undefined
  }, [balance, platformMax])

  const countdown = useMemo(() => {
    if (!startedAt) return null
    const el = (Date.now() - new Date(startedAt).getTime()) / 1000
    if (phase === 'betting_open')   return Math.max(0, Math.ceil(BETTING_LOCK_AT - el))
    if (phase === 'betting_locked') return Math.max(0, Math.ceil(80 - el))
    if (phase === 'result')         return Math.max(0, Math.ceil(90 - el))
    return null
  }, [tick, phase, startedAt])

  const walletReady  = isDemo || snapshot?.wallet?.status === 'ready'
  const overBalance  = wager !== null && balance !== undefined && wager > balance
  const overPlatform = !isDemo && wager !== null && platformMax !== undefined && wager > platformMax
  const betLocked    = phase !== 'betting_open'
  const panelLocked  = betLocked || betState !== 'idle'
  const canBet = phase === 'betting_open' && selected !== null && wager !== null
    && betState === 'idle' && walletReady && !overBalance && !overPlatform

  const isResult      = phase === 'result'
  // Non-demo bettors see the CONTRACT's draw; spectators with no bet fall back to the round result.
  const contractIdx   = !isDemo && session?.outcomeIdx != null ? session.outcomeIdx : null
  const resultIdx     = isResult
    ? (contractIdx ?? (outcome ? OUTCOME_TO_IDX[outcome] : null))
    : null
  const resultOutcome = resultIdx !== null ? OUTCOMES[resultIdx] : null
  const placedOutcome = session !== null ? OUTCOMES[session.prediction] : null
  // Non-demo: the contract's draw decides win/loss, not the Supabase board result.
  const won = session !== null && isResult && (
    isDemo
      ? outcome !== null && OUTCOME_TO_IDX[outcome] === session.prediction
      : session.outcomeIdx != null && session.outcomeIdx === session.prediction
  )

  const handleBet = useCallback(async () => {
    if (!canBet || selected === null || wager === null) return
    if (isDemo) {
      setDemoBalance(p => p - wager)
      setSession({ sessionKey: `demo:${Date.now()}`, prediction: selected, wager, sessionId: 'demo', payout: null, settled: false })
      setBetState('placed'); return
    }
    setBetState('placing'); setError(null)
    try {
      const gameData = encodeAbiParameters([{ type: 'uint8' }, { type: 'uint32' }], [selected, Number(roundId)])
      const { sessionKey } = await Promise.race([
        hostApi.openSession({ wager: wager.toString(), gameData }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Bet timed out — please retry')), 60_000)),
      ])
      setSession({ sessionKey, prediction: selected, wager, sessionId: null, payout: null, settled: false })
      setBetState('placed')
    } catch (err) { setError(err?.message ?? 'Failed to place bet.'); setBetState('error') }
  }, [canBet, selected, wager, isDemo, hostApi, roundId])

  useEffect(() => {
    if (!session || betState !== 'placed' || isDemo || !snapshot) return
    const row = snapshot.sessions?.items?.find(i => i.sessionKey === session.sessionKey)
    if (!row) return
    if (row.isSettled || ['SETTLED','FORFEITED','CANCELLED'].includes(row.phaseName ?? '')) {
      setSession(p => p ? { ...p, sessionId: row.sessionId, payout: row.payout ? BigInt(row.payout) : 0n, settled: true, outcomeIdx: contractOutcomeIdx(row.raw?.gameState) } : null)
      setBetState('settled')
    }
  }, [snapshot, session, betState, isDemo])

  // ── Demo + non-demo reveal ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'result' || revealedRef.current) return
    if (isDemo) {
      if (!session || outcome === null) return
      revealedRef.current = true
      const isWon  = OUTCOME_TO_IDX[outcome] === session.prediction
      const payout = isWon ? (session.wager * OUTCOMES[session.prediction].multBps) / 10_000n : 0n
      setSession(p => p ? { ...p, payout, settled: true } : null)
      if (isWon) setDemoBalance(p => p + payout)
      setBetState('revealed'); return
    }
    if (session?.sessionId) {
      revealedRef.current = true
      console.log('[CC] reveal → calling', { sessionId: session.sessionId, t: Date.now() })
      hostApi?.revealOutcome({ sessionId: session.sessionId })
        .then(r => console.log('[CC] reveal ✓', r))
        .catch(e => console.error('[CC] reveal ✗', e))
      setBetState('revealed')
    }
  }, [phase, isDemo, session, outcome, hostApi])

  // Non-demo fallback: sessionId may arrive after phase='result'
  useEffect(() => {
    if (phase !== 'result' || revealedRef.current || isDemo || !session?.sessionId) return
    revealedRef.current = true
    console.log('[CC] reveal(fallback) → calling', { sessionId: session.sessionId, t: Date.now() })
    hostApi?.revealOutcome({ sessionId: session.sessionId })
      .then(r => console.log('[CC] reveal ✓', r))
      .catch(e => console.error('[CC] reveal ✗', e))
    setBetState('revealed')
  }, [session?.sessionId, phase, isDemo, hostApi])

  // Optimistic balance credit for non-demo wins
  useEffect(() => {
    if (isDemo || !isResult || !won || !session || balCreditedRef.current) return
    balCreditedRef.current = true
    const estimated = (session.wager * OUTCOMES[session.prediction].multBps) / 10_000n
    // removed: the host credits the payout itself after revealOutcome (the overlay double-counted)
  }, [isResult, won, session?.payout, isDemo])

  // ── Bet placed toast ───────────────────────────────────────────────────────
  useEffect(() => {
    if (betState !== 'placed' || !session) return
    const opt      = OUTCOMES[session.prediction]
    const subtitle = session.prediction === 1 ? 'Calling a draw this round'
      : session.prediction === 0 ? 'Backing White to win this round'
      : 'Backing Black to win this round'
    addToast({ iconType: 'knight', title: 'BET PLACED', subtitle, color: opt.color, duration: 4000 })
  }, [betState])

  // ── Win / loss toast ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isResult || !session || outcome === null || toastedRef.current) return
    if (!isDemo && !session.settled) return   // wait for the contract's settled state
    toastedRef.current = true
    const isWon = isDemo
      ? OUTCOME_TO_IDX[outcome] === session.prediction
      : session.outcomeIdx != null && session.outcomeIdx === session.prediction
    const opt   = OUTCOMES[session.prediction]
    if (isWon) {
      const estimated = (session.wager * OUTCOMES[session.prediction].multBps) / 10_000n
      const payout    = (session.payout && session.payout > 0n) ? session.payout : estimated
      const profit    = fmt(payout - session.wager, decimals)
      addToast({ iconType: 'trophy', title: 'YOU WON!', subtitle: `+${profit} ${symbol} won · Luck is on your side 😏`, color: opt.color, duration: 7000 })
    } else {
      addToast({ iconType: 'sad', title: 'BUMMER', subtitle: `Make it back next round`, color: '#ef4444', duration: 5500 })
    }
  }, [isResult, session, outcome, decimals, symbol])

  // ── Payout countup ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isResult || !won || !session) return
    const estimated = (session.wager * OUTCOMES[session.prediction].multBps) / 10_000n
    const target    = (session.payout && session.payout > 0n) ? session.payout : estimated
    if (!target || target <= 0n) return
    const duration = 1400, start = Date.now()
    const id = setInterval(() => {
      const t = Math.min((Date.now() - start) / duration, 1)
      setDisplayPay(BigInt(Math.floor(Number(target) * (1 - Math.pow(1 - t, 3)))))
      if (t >= 1) clearInterval(id)
    }, 40)
    return () => clearInterval(id)
  }, [isResult, won, session?.payout])

  const setWagerBig = useCallback((v) => {
    if (!v || v <= 0n) return
    const n = parseFloat(formatUnits(v, decimals))
    setWagerInput(n >= 1 ? n.toFixed(2) : n.toFixed(4))
  }, [decimals])

  const pillColor = isDeciding ? '#8B5CF6'
    : phase === 'betting_open'   ? '#10B981'
    : phase === 'betting_locked' ? '#F59E0B'
    : resultOutcome?.color ?? '#8B5CF6'

  // ── Outcome card — iOS 26 liquid glass style ──────────────────────────────
  const outcomeCard = (opt, mode = 'row') => {
    const isCol    = mode === 'column'
    const isSel    = selected === opt.prediction
    const wasBet   = session?.prediction === opt.prediction
    const isWinner = resultIdx === opt.prediction
    const locked   = betLocked || (betState !== 'idle' && betState !== 'error')
    return (
      <button
        key={opt.prediction}
        className="cc-outcome"
        onClick={() => { if (locked) return; setSelected(opt.prediction); if (betState === 'error') setBetState('idle'); setError(null) }}
        disabled={locked}
        style={{
          flex:    isCol ? 1 : undefined,
          width:   isCol ? undefined : '100%',
          height:  isCol ? 66 : 44,
          borderRadius: 14,
          display:        'flex',
          flexDirection:  isCol ? 'column' : 'row',
          alignItems:     'center',
          justifyContent: isCol ? 'center' : 'space-between',
          padding:  isCol ? '0 10px' : '0 15px',
          gap:      isCol ? 5 : 0,
          position: 'relative', overflow: 'hidden',
          background: `linear-gradient(175deg, ${gc(opt, isWinner ? 0.30 : isSel ? 0.22 : 0.11)} 0%, ${gc(opt, isWinner ? 0.16 : isSel ? 0.12 : 0.06)} 100%)`,
          backdropFilter:       'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px)',
          border: `${isSel || isWinner ? '1.5px' : '1px'} solid ${gc(opt, isWinner ? 0.75 : isSel ? 0.60 : 0.26)}`,
          borderTopColor: `${gc(opt, isWinner ? 0.90 : isSel ? 0.75 : 0.38)}`,
          boxShadow: [
            `0 ${isWinner ? 10 : isSel ? 7 : 3}px ${isWinner ? 30 : isSel ? 22 : 10}px ${gc(opt, isWinner ? 0.48 : isSel ? 0.32 : 0.12)}`,
            `inset 0 1.5px 0 rgba(255,255,255,${isWinner ? 0.38 : isSel ? 0.28 : 0.13})`,
            `inset 0 -1px 0 rgba(0,0,0,0.16)`,
            `inset 1px 0 0 rgba(255,255,255,0.07)`,
            `inset -1px 0 0 rgba(0,0,0,0.06)`,
          ].join(','),
          cursor:     locked ? 'default' : 'pointer',
          opacity:    locked && !wasBet && !isWinner ? 0.42 : 1,
          transition: 'all .18s cubic-bezier(.23,1,.32,1)',
          transform:  isWinner ? 'scale(1.02)' : isSel ? 'translateY(-1.5px)' : 'none',
        }}
      >
        {/* Specular sheen — bright top band */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '52%',
          borderRadius: 'inherit',
          background: `linear-gradient(180deg, rgba(255,255,255,${isSel || isWinner ? 0.22 : 0.09}) 0%, transparent 100%)`,
          pointerEvents: 'none',
        }} />
        {/* Shimmer on selected */}
        {isSel && <div style={{ position: 'absolute', top: 0, bottom: 0, left: '-60%', width: '45%', background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.1) 50%,transparent)', animation: 'cc-shimmer 2.4s ease-in-out infinite', pointerEvents: 'none' }} />}
        {/* BET badge */}
        {wasBet && !isResult && (
          <div style={{ position: 'absolute', top: 4, right: 9, fontFamily: INTER, fontSize: 7, fontWeight: 700, letterSpacing: '.1em', color: opt.color }}>BET</div>
        )}
        {/* Winner ★ */}
        {isWinner && (
          <div style={{ position: 'absolute', top: 4, right: 9, fontSize: 11, color: opt.color, textShadow: `0 0 8px ${opt.color}`, animation: 'cc-pop .4s ease' }}>★</div>
        )}
        {/* Label */}
        <span style={{
          fontFamily: INTER, fontSize: isCol ? 8.5 : 10.5, fontWeight: 700,
          letterSpacing: '.06em', color: isSel || isWinner ? opt.color : 'rgba(255,255,255,0.48)',
          textAlign: 'center', lineHeight: 1.2,
        }}>
          {opt.label}
        </span>
        {/* Multiplier */}
        <span style={{
          fontFamily: INTER, fontSize: isCol ? 19 : 17, fontWeight: 800,
          lineHeight: 1, color: isSel || isWinner ? opt.color : gc(opt, 0.68),
          textShadow: isSel || isWinner ? `0 0 16px ${gc(opt, .55)}, 0 2px 8px rgba(0,0,0,.4)` : 'none',
          fontVariantNumeric: 'tabular-nums',
          transition: 'all .15s',
        }}>
          {opt.mult.toFixed(2)}×
        </span>
      </button>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      {isMobile ? (
        <div style={{
          position: 'fixed', top: 60, right: 14, zIndex: 600,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
          pointerEvents: 'none',
        }}>
          <ToastStack toasts={toasts} onRemove={removeToast} embedded />
          <RightControls
            envMode={envMode} onToggle={onEnvToggle} moveLog={moveLog}
            isMobile mobileSheet={mobileSheet} setMobileSheet={setMobileSheet}
            movesOpenIdx={movesOpenIdx} setMovesOpenIdx={setMovesOpenIdx}
            embedded
          />
        </div>
      ) : (
        <>
          <ToastStack toasts={toasts} onRemove={removeToast} />
          <RightControls
            envMode={envMode} onToggle={onEnvToggle} moveLog={moveLog}
            isMobile={false} mobileSheet={mobileSheet} setMobileSheet={setMobileSheet}
            movesOpenIdx={movesOpenIdx} setMovesOpenIdx={setMovesOpenIdx}
          />
        </>
      )}
      <LeftControls compact={isMobile} />

      {/* ── Balance — top right ──────────────────────────────────────── */}
      <div style={{
        position: 'fixed', top: 14, right: 14, zIndex: 300, pointerEvents: 'none',
        display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 7, padding: isMobile ? '6px 11px' : '7px 16px',
        ...glassSurface, borderRadius: 999,
      }}>
        {!isMobile && <span style={{ fontFamily: INTER, fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.08em' }}>BAL</span>}
        <span style={{ fontFamily: INTER, fontSize: isMobile ? 12 : 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', transition: 'color .3s', color: 'rgba(255,255,255,0.92)' }} ref={balTextRef}>
          {null}
        </span>
        <span style={{ fontFamily: INTER, fontSize: isMobile ? 8.5 : 10, fontWeight: 500, color: 'rgba(255,255,255,0.30)' }}>{symbol}</span>
      </div>

      {/* ── Status pill — centered on the full viewport on desktop, but
          centered within the safe gap between the side pills on mobile, with
          a hard width cap so long deciding-text truncates instead of
          stretching over the balance pill ─────────────────────────────── */}
      {isMobile ? (
        <div style={{
          position: 'fixed', top: 14, left: 64, right: 100, zIndex: 300, pointerEvents: 'none',
          display: 'flex', justifyContent: 'center',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
            ...glassSurface, borderRadius: 999,
            fontFamily: INTER, fontSize: 8, fontWeight: 600, letterSpacing: '0.05em',
            maxWidth: '100%', overflow: 'hidden',
          }}>
            {isDeciding
              ? <Spinner color={pillColor} size={10} />
              : <PhaseIcon phase={phase} color={pillColor} isResult={isResult} />
            }
            <span style={{ color: 'rgba(255,255,255,0.65)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isDeciding
                ? <span key={decidingIdx} style={{ animation: 'cc-fadein .3s ease' }}>{DECIDING_TEXTS[decidingIdx]}</span>
                : phase === 'betting_open'   ? 'BET OPEN'
                : phase === 'betting_locked' ? 'LOCKED'
                : isResult && resultOutcome  ? <span style={{ color: resultOutcome.color, fontWeight: 800 }}>{resultOutcome.label}</span>
                : 'WAITING'
              }
            </span>
            {!isDeciding && countdown !== null && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                <span style={{
                  fontFamily: MONO, fontVariantNumeric: 'tabular-nums',
                  color: countdown <= 10 ? '#F59E0B' : 'rgba(255,255,255,0.82)',
                  fontWeight: 700,
                }}>{countdown}s</span>
              </span>
            )}
            {isDemo && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span style={{ color: 'rgba(255,255,255,0.14)' }}>·</span>
                <span style={{ padding: '1px 5px', background: 'rgba(139,92,246,0.22)', border: '1px solid rgba(139,92,246,0.38)', borderRadius: 6, color: '#a78bfa', fontSize: 7, fontWeight: 700 }}>DEMO</span>
              </span>
            )}
          </div>
        </div>
      ) : (
        <div style={{
          position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
          zIndex: 300, pointerEvents: 'none',
          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 17px',
          ...glassSurface, borderRadius: 999,
          fontFamily: INTER, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', whiteSpace: 'nowrap',
        }}>
          {isDeciding
            ? <Spinner color={pillColor} size={12} />
            : <PhaseIcon phase={phase} color={pillColor} isResult={isResult} />
          }
          <span style={{ color: 'rgba(255,255,255,0.65)' }}>
            {isDeciding
              ? <span key={decidingIdx} style={{ animation: 'cc-fadein .3s ease' }}>{DECIDING_TEXTS[decidingIdx]}</span>
              : phase === 'betting_open'   ? 'BET OPEN'
              : phase === 'betting_locked' ? 'LOCKED'
              : isResult && resultOutcome  ? <span style={{ color: resultOutcome.color, fontWeight: 800 }}>{resultOutcome.label}</span>
              : 'WAITING'
            }
          </span>
          {!isDeciding && countdown !== null && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
              <span style={{
                fontFamily: MONO, fontVariantNumeric: 'tabular-nums',
                color: countdown <= 10 ? '#F59E0B' : 'rgba(255,255,255,0.82)',
                fontWeight: 700,
              }}>{countdown}s</span>
            </>
          )}
          {isDemo && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.14)' }}>·</span>
              <span style={{ padding: '1px 7px', background: 'rgba(139,92,246,0.22)', border: '1px solid rgba(139,92,246,0.38)', borderRadius: 6, color: '#a78bfa', fontSize: 8, fontWeight: 700 }}>DEMO</span>
            </>
          )}
        </div>
      )}

      {/* ── Collapsed panel tab — vertical edge tab on desktop/tablet, full-width bottom bar on mobile ── */}
      {(isMobile ? mobileSheet === null : !panelOpen && !panelClosing) && (
        <button
          onClick={() => isMobile ? setMobileSheet('bet') : setPanelOpen(true)}
          style={isMobile ? {
            position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 100,
            padding: '14px 20px',
            paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
            ...glassSurface,
            border: 'none',
            borderRadius: 16,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          } : {
            position: 'fixed', left: 0, top: '50%', transform: 'translateY(-50%)',
            zIndex: 100, padding: '18px 7px',
            ...glassSurface,
            border: 'none', borderLeft: 'none',
            borderRadius: '0 14px 14px 0',
            cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}
        >
          {isMobile ? (
            <>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <GiChessKnight size={16} color="#a78bfa" style={{ filter: 'drop-shadow(0 0 4px #a78bfa)' }} />
                <span style={{ fontFamily: INTER, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.55)' }}>
                  {selected !== null ? `${OUTCOMES[selected].label} · ${wagerInput || 0} ${symbol}` : 'TAP TO BET'}
                </span>
              </span>
              <FaChevronRight size={11} color="rgba(255,255,255,0.22)" style={{ transform: 'rotate(-90deg)' }} />
            </>
          ) : (
            <>
              <GiChessKnight size={16} color="#a78bfa" style={{ filter: 'drop-shadow(0 0 4px #a78bfa)' }} />
              <span style={{
                fontFamily: INTER, fontSize: 8, fontWeight: 700, letterSpacing: '0.14em',
                color: 'rgba(255,255,255,0.35)', writingMode: 'vertical-rl', textOrientation: 'mixed',
              }}>BET</span>
              <FaChevronRight size={11} color="rgba(255,255,255,0.22)" />
            </>
          )}
        </button>
      )}

      {/* ── Left panel ───────────────────────────────────────────────── */}
      {/* FIX: keep rendered during panelClosing so exit animation plays */}
      {(isMobile ? mobileSheet !== null : (panelOpen || panelClosing)) && (
        <div className="cc-panel" style={isMobile ? {
          position: 'fixed', left: 12, right: 12, bottom: 12,
          maxHeight: '70vh',
          borderRadius: 20, zIndex: 100,
          overflowY: 'auto', overflowX: 'hidden',
          display: 'flex', flexDirection: 'column',
          ...glassSurface,
          background: 'rgba(8,9,22,0.72)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          animation: panelClosing
            ? 'cc-sheet-out .24s cubic-bezier(.23,1,.32,1) forwards'
            : 'cc-sheet-in .25s cubic-bezier(.23,1,.32,1)',
        } : {
          position: 'fixed', top: '50%', left: 14,
          width: isTablet ? 'clamp(200px, 26vw, 250px)' : 'clamp(220px, 22vw, 270px)',
          transform: 'translateY(-50%)',
          maxHeight: 'calc(100vh - 28px)',
          borderRadius: 20, zIndex: 100,
          overflowY: 'auto', overflowX: 'hidden',
          display: 'flex', flexDirection: 'column',
          ...glassSurface,
          background: 'rgba(8,9,22,0.72)',
          // FIX: play exit animation when closing
          animation: panelClosing
            ? 'cc-panel-out .24s cubic-bezier(.23,1,.32,1) forwards'
            : 'cc-panel-in .25s cubic-bezier(.23,1,.32,1)',
        }}>
          {/* Top sheen */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '25%', borderRadius: '20px 20px 0 0', background: 'linear-gradient(180deg,rgba(255,255,255,0.07) 0%,transparent 100%)', pointerEvents: 'none', zIndex: 1 }} />

          {/* On mobile, BETS/MOVES take over this same sheet slot instead of
              their own floating dock — everything below through the CTA is
              the "bet" tab's content, unchanged, just now conditional */}
          {(!isMobile || mobileSheet === 'bet') && (
          <>
          {/* Header + collapse button */}
          <div style={{ padding: '18px 18px 14px', flexShrink: 0, position: 'relative' }}>
            {/* FIX: ♟ unicode → GiChessPawn react-icon */}
            <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.9)', marginBottom: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <GiChessPawn size={14} color="rgba(255,255,255,0.9)" />
              CHESSCHUCK
            </div>
            <div style={{ fontFamily: INTER, fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.06em', textAlign: 'center' }}>PROVABLY FAIR · ON-CHAIN</div>
            {/* FIX: collapse button now triggers handlePanelClose for exit animation */}
            <button
              onClick={handlePanelClose}
              style={{
                position: 'absolute', top: 14, right: 14,
                background: 'transparent', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '4px 6px', borderRadius: 6,
              }}
              title="Collapse panel"
            >
              {/* FIX: ‹ unicode → FaChevronLeft react-icon */}
              <FaChevronLeft size={12} color="rgba(255,255,255,0.35)" />
            </button>
          </div>

          <Divider />

          {/* Deciding state */}
          {isDeciding && !isResult ? (
            <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <Spinner color="#8B5CF6" size={28} />
              <div key={decidingIdx} style={{ fontFamily: INTER, fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.38)', textAlign: 'center', lineHeight: 1.6, animation: 'cc-fadein .3s ease' }}>
                {DECIDING_TEXTS[decidingIdx]}
              </div>
            </div>
          ) : (
            <>
              {/* Wager section */}
              {!isResult && (
                <>
                  <div style={{ padding: '14px 18px 12px', flexShrink: 0 }}>
                    <SectionLabel>BET AMOUNT</SectionLabel>
                    {/* FIX: removed overflow:hidden — was clipping chUSD label and number */}
                    <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderTopColor: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '0 13px', marginBottom: 8, height: 46, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), inset 0 2px 8px rgba(0,0,0,0.12)' }}>
                      <span style={{ fontFamily: INTER, fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.25)', marginRight: 8, flexShrink: 0 }}>{symbol}</span>
                      {/* FIX: minWidth:0 lets input shrink so symbol label is never pushed out */}
                      <input
                        type="text" inputMode="decimal"
                        value={wagerInput}
                        onChange={e => {
                          const v = e.target.value
                          if (v === '' || /^\d*\.?\d*$/.test(v)) setWagerInput(v)
                        }}
                        disabled={panelLocked}
                        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', textAlign: 'right', padding: '0 6px 0 4px', fontFamily: INTER, fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: panelLocked ? 'rgba(255,255,255,0.48)' : 'rgba(255,255,255,0.92)' }}
                      />
                    </div>
                    {/* Quick-select — liquid glass */}
                    <div style={{ display: 'flex', gap: 5 }}>
                      {[
                        { l: '¼',  fn: () => wager ? setWagerBig(wager / 4n) : null, d: panelLocked || !wager },
                        { l: '½',  fn: () => wager ? setWagerBig(wager / 2n) : null, d: panelLocked || !wager },
                        { l: '2×', fn: () => wager ? setWagerBig(wager * 2n) : null, d: panelLocked || !wager },
                        { l: 'Max',fn: () => effectiveMax ? setWagerBig(effectiveMax) : null, d: panelLocked || !effectiveMax },
                      ].map(({ l, fn, d }) => (
                        <button
                          key={l}
                          onClick={fn}
                          disabled={d}
                          className="cc-qbtn"
                          style={{
                            flex: 1, padding: '8px 0',
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)',
                            border: '1px solid rgba(255,255,255,0.09)',
                            borderTopColor: 'rgba(255,255,255,0.18)',
                            borderRadius: 10,
                            color: d ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.50)',
                            fontFamily: INTER, fontSize: 10.5, fontWeight: 600,
                            cursor: d ? 'default' : 'pointer',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 2px 6px rgba(0,0,0,0.2)',
                            transition: 'all .12s',
                          }}
                        >{l}</button>
                      ))}
                    </div>
                  </div>
                  <Divider />
                </>
              )}

              {/* Outcome cards */}
              <div style={{ padding: '14px 18px 12px', flexShrink: 0 }}>
                {!isResult && <SectionLabel>SELECT OUTCOME</SectionLabel>}
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  {outcomeCard(OUTCOMES[0], 'column')}
                  {outcomeCard(OUTCOMES[2], 'column')}
                </div>
                {outcomeCard(OUTCOMES[1], 'row')}
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div style={{ margin: '2px 18px 4px', padding: '6px 10px', background: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 8, fontFamily: INTER, fontSize: 9, color: '#f87171', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {/* Win / loss */}
          {isResult && session && (
            <div style={{ margin: '2px 18px 8px', textAlign: 'center', fontFamily: INTER, fontSize: 11, fontWeight: 700, animation: 'cc-fadein .5s ease' }}>
              {won
                ? <span style={{ color: placedOutcome?.color, textShadow: `0 0 20px ${gc(placedOutcome, .55)}` }}>+{fmt(displayPay, decimals)} {symbol} CREDITED</span>
                : <span style={{ color: 'rgba(255,255,255,0.18)' }}>BETTER LUCK NEXT ROUND</span>
              }
            </div>
          )}

          {/* CTA */}
          <div style={{ padding: '18px 18px 22px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Place bet — iOS 26 style */}
            {!isResult && !isDeciding && (betState === 'idle' || betState === 'error') && (
              <button onClick={handleBet} disabled={!canBet} style={{
                width: '100%', padding: '14px',
                background: canBet
                  ? 'linear-gradient(180deg, #12D48A 0%, #059669 60%, #047857 100%)'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${canBet ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'}`,
                borderTopColor: canBet ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.09)',
                borderRadius: 14,
                color: canBet ? '#fff' : 'rgba(255,255,255,0.14)',
                fontFamily: INTER, fontSize: 12, fontWeight: 800, letterSpacing: '.12em',
                cursor: canBet ? 'pointer' : 'default',
                boxShadow: canBet
                  ? '0 6px 28px rgba(16,185,129,.45), 0 2px 8px rgba(0,0,0,.3), inset 0 1.5px 0 rgba(255,255,255,.30), inset 0 -1px 0 rgba(0,0,0,.18)'
                  : 'none',
                transition: 'all .2s cubic-bezier(.23,1,.32,1)',
              }}>
                {betState === 'error' ? 'RETRY' : !walletReady ? 'CONNECT WALLET' : selected === null ? 'SELECT AN OUTCOME' : overBalance ? 'INSUFFICIENT BALANCE' : overPlatform ? 'EXCEEDS LIMIT' : 'PLACE BET'}
              </button>
            )}

            {/* Placing */}
            {betState === 'placing' && (
              <div style={{ padding: '12px', background: gc(placedOutcome ?? OUTCOMES[1], 0.07), border: `1px solid ${gc(placedOutcome ?? OUTCOMES[1], 0.35)}`, borderTopColor: gc(placedOutcome ?? OUTCOMES[1], 0.55), borderRadius: 14, textAlign: 'center', fontFamily: INTER, fontSize: 11, fontWeight: 600, color: placedOutcome?.color ?? 'rgba(255,255,255,.3)', letterSpacing: '.08em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Spinner color={placedOutcome?.color ?? '#8B5CF6'} />
                PLACING BET…
              </div>
            )}

            {/* Placed / settled */}
            {(betState === 'placed' || betState === 'settled') && placedOutcome && !isResult && (
              <div style={{ padding: '11px 13px', background: gc(placedOutcome, 0.09), border: `1px solid ${gc(placedOutcome, 0.32)}`, borderTopColor: gc(placedOutcome, 0.52), borderRadius: 14, textAlign: 'center', fontFamily: INTER, fontSize: 10, fontWeight: 600, letterSpacing: '.04em', boxShadow: `0 0 14px ${gc(placedOutcome, .12)}` }}>
                <span style={{ color: placedOutcome.color, fontWeight: 700 }}>{fmt(session.wager, decimals)} {symbol} · {placedOutcome.label}</span>
                {/* FIX: ✓ unicode → FaCheck react-icon */}
                {betState === 'settled' && <FaCheck size={8} style={{ color: 'rgba(255,255,255,.2)', marginLeft: 8, verticalAlign: 'middle' }} />}
              </div>
            )}

            {/* Result countdown */}
            {isResult && (
              <div style={{ padding: '11px 13px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderTopColor: 'rgba(255,255,255,0.11)', borderRadius: 14, textAlign: 'center', fontFamily: INTER, fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.18)', letterSpacing: '.06em' }}>
                NEXT ROUND{countdown !== null && countdown > 0
                  ? <> · <span style={{ color: countdown <= 3 ? '#F59E0B' : 'rgba(255,255,255,0.38)', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', transition: 'color .3s' }}>{countdown}s</span></>
                  : '…'}
              </div>
            )}
          </div>
          </>
          )}

          {/* Mobile-only: BETS / MOVES content, sharing this same sheet */}
          {isMobile && mobileSheet === 'bets' && (
            <>
              <div style={{ padding: '18px 18px 10px', flexShrink: 0, position: 'relative' }}>
                <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.9)', textAlign: 'center' }}>
                  RECENT ROUNDS
                </div>
                <button onClick={handlePanelClose} style={{ position: 'absolute', top: 14, right: 14, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 6px', borderRadius: 6 }}>
                  <FaChevronLeft size={12} color="rgba(255,255,255,0.35)" style={{ transform: 'rotate(-90deg)' }} />
                </button>
              </div>
              <Divider />
              <RecentRoundsPanel />
            </>
          )}
          {isMobile && mobileSheet === 'moves' && (
            <>
              <div style={{ padding: '18px 18px 10px', flexShrink: 0, position: 'relative' }}>
                <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.9)', textAlign: 'center' }}>
                  MOVE HISTORY
                </div>
                <button onClick={handlePanelClose} style={{ position: 'absolute', top: 14, right: 14, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 6px', borderRadius: 6 }}>
                  <FaChevronLeft size={12} color="rgba(255,255,255,0.35)" style={{ transform: 'rotate(-90deg)' }} />
                </button>
              </div>
              <Divider />
              <MoveLogPanel moveLog={moveLog} openIndex={movesOpenIdx} />
            </>
          )}
        </div>
      )}
    </>
  )
}