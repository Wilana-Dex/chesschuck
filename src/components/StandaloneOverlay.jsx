import { useState } from 'react'
import { GiChessKnight, GiChessPawn, GiChessQueen } from 'react-icons/gi'
import { FaTrophy, FaTimes } from 'react-icons/fa'

// ─── Design tokens ────────────────────────────────────────────────────────────
const INTER = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
const MONO  = "ui-monospace, 'SF Mono', Menlo, monospace"

const glass = {
  background:           'rgba(6,7,18,0.92)',
  backdropFilter:       'blur(64px) saturate(200%)',
  WebkitBackdropFilter: 'blur(64px) saturate(200%)',
  border:               '1px solid rgba(255,255,255,0.08)',
  borderTopColor:       'rgba(255,255,255,0.18)',
  boxShadow: [
    '0 48px 120px rgba(0,0,0,0.85)',
    '0 8px 32px rgba(0,0,0,0.55)',
    'inset 0 1px 0 rgba(255,255,255,0.12)',
    'inset 0 -1px 0 rgba(0,0,0,0.28)',
  ].join(','),
}

const cardGlass = (color) => ({
  background:           color ? `linear-gradient(155deg, rgba(${color},0.13) 0%, rgba(${color},0.05) 100%)` : 'rgba(255,255,255,0.035)',
  backdropFilter:       'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border:               `1px solid ${color ? `rgba(${color},0.22)` : 'rgba(255,255,255,0.07)'}`,
  borderTopColor:       color ? `rgba(${color},0.44)` : 'rgba(255,255,255,0.13)',
  boxShadow: [
    `inset 0 1.5px 0 rgba(255,255,255,${color ? '0.10' : '0.07'})`,
    'inset 0 -1px 0 rgba(0,0,0,0.12)',
    `0 6px 20px rgba(0,0,0,${color ? '0.22' : '0.16'})`,
    color ? `0 0 32px rgba(${color},0.08)` : '',
  ].filter(Boolean).join(','),
})

const OUTCOMES = [
  { label: 'WHITE WINS', color: '#F59E0B', rgb: '245,159,11',  mult: '2.53×', prob: '37.43%' },
  { label: 'DRAW',       color: '#8B5CF6', rgb: '139,92,246',  mult: '2.72×', prob: '34.95%' },
  { label: 'BLACK WINS', color: '#3B82F6', rgb: '59,130,246',  mult: '3.44×', prob: '27.62%' },
]

const EVENTS = [
  { t: 0,  label: 'Bets open', sub: 'A grandmaster game plays out live while you pick a side',    color: '#10B981', pos: 0     },
  { t: 45, label: 'Bets lock',            sub: 'No further wagers accepted',                      color: '#F59E0B', pos: 50    },
  { t: 80, label: 'Result declared',      sub: 'Result revealed - settled by the contract',            color: '#8B5CF6', pos: 88.9  },
  { t: 90, label: 'Next round',           sub: 'Payouts settled, cycle repeats',                  color: '#3B82F6', pos: 100   },
]

const VRF_STEPS = [
  { n: '01', label: 'YOU PLACE A BET',     sub: 'Your prediction and wager go on-chain as a public session',    color: '#10B981' },
  { n: '02', label: 'VRF DRAWS THE RESULT', sub: 'Verify Network sends a random word. The contract maps it to White, Draw or Black with fixed odds',         color: '#8B5CF6' },
  { n: '03', label: 'PAYOUT SETTLES',      sub: 'The contract pays from that word. The board cannot change it',   color: '#F59E0B' },
  { n: '04', label: 'BETS LOCK AT T=45',   sub: 'No more wagers. Your result is already settled on-chain, just not shown yet',      color: '#F59E0B' },
  { n: '05', label: 'ANYONE CAN VERIFY',   sub: 'The random word, VRF proof and your session are all on-chain',  color: '#3B82F6' },
]

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
@keyframes so-fadein  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
@keyframes so-scalein { from{opacity:0;transform:scale(.93) translateY(14px)} to{opacity:1;transform:scale(1) translateY(0)} }
@keyframes so-pulse   { 0%,100%{box-shadow:0 0 0 0 rgba(139,92,246,0.38),0 8px 32px rgba(139,92,246,0.20)} 50%{box-shadow:0 0 0 11px rgba(139,92,246,0),0 8px 32px rgba(139,92,246,0.36)} }
@keyframes so-travel  { 0%{left:-2%} 100%{left:102%} }
@keyframes so-shimmer { 0%,100%{opacity:0.45} 50%{opacity:1} }
@keyframes so-cardin  { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:translateX(0)} }
.so-scroll::-webkit-scrollbar{display:none}
.so-scroll{scrollbar-width:none;-ms-overflow-style:none}
.so-tab-btn:hover:not(.so-active){opacity:0.72}
.so-close-btn:hover{background:rgba(255,255,255,0.10)!important}
`

// ─── iOS 26 Segment Tabs ──────────────────────────────────────────────────────
function SegmentTabs({ tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex', gap: 3, padding: '3px',
      background: 'rgba(0,0,0,0.42)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderTopColor: 'rgba(255,255,255,0.11)',
      borderRadius: 14,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(0,0,0,0.22)',
    }}>
      {tabs.map(({ key, label, icon: Icon }) => {
        const on = active === key
        return (
          <button
            key={key}
            className={`so-tab-btn${on ? ' so-active' : ''}`}
            onClick={() => onChange(key)}
            style={{
              flex: 1, padding: '9px 4px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              fontFamily: INTER, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em',
              color: on ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.28)',
              background: on
                ? 'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 100%)'
                : 'transparent',
              border: on ? '1px solid rgba(255,255,255,0.13)' : '1px solid transparent',
              borderTopColor: on ? 'rgba(255,255,255,0.26)' : 'transparent',
              borderRadius: 11,
              boxShadow: on
                ? '0 2px 10px rgba(0,0,0,0.32), inset 0 1.5px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.12)'
                : 'none',
              cursor: 'pointer', transition: 'all .17s cubic-bezier(.23,1,.32,1)',
            }}
          >
            <Icon size={11} style={{ opacity: on ? 1 : 0.4, flexShrink: 0 }} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Tab: THE ROUND ───────────────────────────────────────────────────────────
function RoundTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, animation: 'so-fadein .22s ease' }}>

      {/* Timeline card */}
      <div style={{
        ...cardGlass(),
        borderRadius: 18, padding: '16px 15px 13px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Top sheen */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(180deg,rgba(255,255,255,0.06) 0%,transparent 100%)', borderRadius: 'inherit', pointerEvents: 'none' }} />

        {/* Timestamps */}
        <div style={{ position: 'relative', height: 17, marginBottom: 7 }}>
          {EVENTS.map(e => (
            <div key={e.t} style={{ position: 'absolute', left: `${e.pos}%`, bottom: 0, transform: 'translateX(-50%)', fontFamily: MONO, fontSize: 8, fontWeight: 800, color: e.color, whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
              {e.t}s
            </div>
          ))}
        </div>

        {/* Track */}
        <div style={{ position: 'relative', height: 5, marginBottom: 9 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.06)', borderRadius: 99 }} />
          <div style={{ position: 'absolute', left: 0, width: '50%', top: 0, bottom: 0, background: 'linear-gradient(90deg,#10B981,rgba(16,185,129,0.52))', borderRadius: '99px 0 0 99px' }} />
          <div style={{ position: 'absolute', left: '50%', width: '38.9%', top: 0, bottom: 0, background: 'linear-gradient(90deg,rgba(245,158,11,0.75),rgba(139,92,246,0.65))' }} />
          <div style={{ position: 'absolute', left: '88.9%', right: 0, top: 0, bottom: 0, background: '#8B5CF6', borderRadius: '0 99px 99px 0' }} />
          {EVENTS.map(e => (
            <div key={e.t} style={{ position: 'absolute', left: `${e.pos}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 3, height: 14, background: e.color, borderRadius: 99, zIndex: 2, boxShadow: `0 0 7px ${e.color}` }} />
          ))}
          <div style={{ position: 'absolute', top: '50%', left: 0, width: 10, height: 10, borderRadius: '50%', transform: 'translate(-50%,-50%)', background: '#fff', boxShadow: '0 0 14px rgba(255,255,255,0.9)', animation: 'so-travel 9s linear infinite', zIndex: 3 }} />
        </div>

        {/* Phase labels */}
        <div style={{ display: 'flex' }}>
          <div style={{ flex: '0 0 50%', textAlign: 'center', fontFamily: INTER, fontSize: 7.5, fontWeight: 700, color: '#10B981', letterSpacing: '0.06em' }}>BETTING OPEN</div>
          <div style={{ flex: '0 0 38.9%', textAlign: 'center', fontFamily: INTER, fontSize: 7.5, fontWeight: 700, color: '#F59E0B', letterSpacing: '0.06em' }}>LOCKED</div>
          <div style={{ flex: '0 0 11.1%', textAlign: 'center', fontFamily: INTER, fontSize: 7.5, fontWeight: 700, color: '#8B5CF6', letterSpacing: '0.06em' }}>OUT</div>
        </div>
      </div>

      {/* Event cards */}
      {EVENTS.map((e, i) => (
        <div
          key={e.t}
          style={{
            ...cardGlass(),
            borderRadius: 15, padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 13,
            borderLeft: `2px solid ${e.color}60`,
            animation: `so-cardin .28s ease ${i * 0.06}s both`,
          }}
        >
          {/* Time bubble */}
          <div style={{
            width: 40, height: 40, borderRadius: 11, flexShrink: 0,
            background: `linear-gradient(145deg, ${e.color}20 0%, ${e.color}0a 100%)`,
            border: `1px solid ${e.color}30`,
            borderTopColor: `${e.color}55`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 14px ${e.color}14`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: MONO, fontSize: 11, fontWeight: 800, color: e.color,
          }}>{e.t}s</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.92)', marginBottom: 3, letterSpacing: '0.02em' }}>{e.label}</div>
            <div style={{ fontFamily: INTER, fontSize: 9, color: 'rgba(255,255,255,0.30)', lineHeight: 1.55 }}>{e.sub}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Tab: FAIRNESS ────────────────────────────────────────────────────────────
function FairnessTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, animation: 'so-fadein .22s ease' }}>
      {VRF_STEPS.map((s, i) => (
        <div
          key={s.n}
          style={{
            ...cardGlass(),
            borderRadius: 15, padding: '13px 14px',
            display: 'flex', gap: 13,
            animation: `so-cardin .28s ease ${i * 0.07}s both`,
          }}
        >
          {/* Number bubble */}
          <div style={{
            width: 38, height: 38, borderRadius: 11, flexShrink: 0,
            background: `linear-gradient(145deg, ${s.color}1f 0%, ${s.color}0b 100%)`,
            border: `1px solid ${s.color}35`,
            borderTopColor: `${s.color}62`,
            boxShadow: `0 4px 14px ${s.color}1a, inset 0 1.5px 0 rgba(255,255,255,0.10)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: MONO, fontSize: 10, fontWeight: 800, color: s.color,
            animation: 'so-shimmer 3.2s ease-in-out infinite',
            animationDelay: `${i * 0.55}s`,
          }}>{s.n}</div>
          <div style={{ paddingTop: 1, flex: 1 }}>
            <div style={{ fontFamily: INTER, fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.92)', marginBottom: 4, letterSpacing: '0.04em' }}>{s.label}</div>
            <div style={{ fontFamily: INTER, fontSize: 9, color: 'rgba(255,255,255,0.30)', lineHeight: 1.62 }}>{s.sub}</div>
          </div>
        </div>
      ))}

      {/* Proof banner */}
      <div style={{
        borderRadius: 15, padding: '13px 15px',
        background: 'linear-gradient(135deg, rgba(16,185,129,0.13) 0%, rgba(16,185,129,0.05) 100%)',
        border: '1px solid rgba(16,185,129,0.24)',
        borderTopColor: 'rgba(16,185,129,0.44)',
        boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.08), 0 6px 20px rgba(16,185,129,0.08)',
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: 18, lineHeight: 1, marginTop: 1, filter: 'drop-shadow(0 0 6px #10B981)' }}>✓</span>
        <div style={{ fontFamily: INTER, fontSize: 9.5, color: 'rgba(16,185,129,0.92)', lineHeight: 1.72 }}>
          Your result is drawn by on-chain VRF <strong>after</strong> you bet. Nobody can choose it.
          The random word and your session are both on-chain — anyone can verify the draw.
        </div>
      </div>
    </div>
  )
}

// ─── Tab: PAYOUTS ─────────────────────────────────────────────────────────────
function PayoutsTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, animation: 'so-fadein .22s ease' }}>
      {OUTCOMES.map((o, i) => (
        <div
          key={o.label}
          style={{
            position: 'relative', overflow: 'hidden',
            borderRadius: 17,
            background: `linear-gradient(155deg, rgba(${o.rgb},0.18) 0%, rgba(${o.rgb},0.08) 55%, rgba(${o.rgb},0.04) 100%)`,
            border: `1px solid rgba(${o.rgb},0.26)`,
            borderTopColor: `rgba(${o.rgb},0.50)`,
            boxShadow: [
              `0 8px 28px rgba(${o.rgb},0.16)`,
              `inset 0 1.5px 0 rgba(255,255,255,0.14)`,
              `inset 0 -1px 0 rgba(0,0,0,0.14)`,
              `inset 1px 0 0 rgba(255,255,255,0.06)`,
              `inset -1px 0 0 rgba(0,0,0,0.05)`,
            ].join(','),
            padding: '16px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            animation: `so-cardin .28s ease ${i * 0.08}s both`,
          }}
        >
          {/* Sheen */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '44%', background: 'linear-gradient(180deg,rgba(255,255,255,0.10) 0%,transparent 100%)', borderRadius: 'inherit', pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ fontFamily: INTER, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.08em', color: o.color, marginBottom: 6, textShadow: `0 0 18px rgba(${o.rgb},0.55)` }}>{o.label}</div>
            <div style={{ fontFamily: INTER, fontSize: 9, color: 'rgba(255,255,255,0.32)', fontWeight: 500 }}>{o.prob} of grandmaster games</div>
          </div>
          <div style={{ textAlign: 'right', position: 'relative' }}>
            <div style={{ fontFamily: INTER, fontSize: 30, fontWeight: 900, color: o.color, lineHeight: 1, textShadow: `0 0 32px rgba(${o.rgb},0.65)`, fontVariantNumeric: 'tabular-nums' }}>{o.mult}</div>
            <div style={{ fontFamily: INTER, fontSize: 8, color: `rgba(${o.rgb},0.55)`, letterSpacing: '0.12em', marginTop: 5, fontWeight: 700 }}>PAYOUT</div>
          </div>
        </div>
      ))}

      {/* RTP */}
      <div style={{
        ...cardGlass(),
        borderRadius: 15, padding: '13px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontFamily: INTER, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.07em', marginBottom: 4 }}>RETURN TO PLAYER</div>
          <div style={{ fontFamily: INTER, fontSize: 8.5, color: 'rgba(255,255,255,0.16)', letterSpacing: '0.04em', fontWeight: 500 }}>All multipliers hard-coded on-chain · house cannot change them</div>
        </div>
        <div style={{ fontFamily: INTER, fontSize: 30, fontWeight: 900, color: 'rgba(255,255,255,0.62)', fontVariantNumeric: 'tabular-nums', textShadow: '0 0 24px rgba(255,255,255,0.10)', marginLeft: 14 }}>95%</div>
      </div>
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────
const TABS = [
  { key: 'round',    label: 'THE ROUND', icon: GiChessPawn   },
  { key: 'fairness', label: 'FAIRNESS',  icon: GiChessKnight },
  { key: 'payouts',  label: 'PAYOUTS',   icon: FaTrophy      },
]

export default function StandaloneOverlay({ isDemo, isMobile = false }) {
  const [open, setOpen] = useState(false)
  const [tab,  setTab]  = useState('round')

  if (!isDemo) return null

  return (
    <>
      <style>{CSS}</style>

      {/* ── HOW IT WORKS pill — TRUE viewport center. Raised above the
          collapsed bottom bar on mobile so they don't stack ────────── */}
      <button
        onClick={() => { setOpen(true); setTab('round') }}
        style={{
          position: 'fixed',
          bottom: isMobile ? 76 : 28,
          left: '50%',
          transform: 'translateX(-50%)',
          // Lower than the mobile sheet's z-index (100) on purpose — an
          // expanded sheet sits fully on top of this; it only reappears
          // once everything's collapsed back down, since the collapsed
          // bar's footprint doesn't reach up this far.
          zIndex: isMobile ? 50 : 300,
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '11px 26px',
          background:           'rgba(7,8,20,0.88)',
          backdropFilter:       'blur(48px) saturate(200%)',
          WebkitBackdropFilter: 'blur(48px) saturate(200%)',
          border:               '1px solid rgba(139,92,246,0.28)',
          borderTopColor:       'rgba(139,92,246,0.56)',
          borderRadius:         999,
          boxShadow: [
            '0 10px 40px rgba(0,0,0,0.60)',
            '0 0 0 0 rgba(139,92,246,0.38)',
            'inset 0 1.5px 0 rgba(255,255,255,0.10)',
            'inset 0 -1px 0 rgba(0,0,0,0.20)',
          ].join(','),
          cursor: 'pointer',
          animation: 'so-pulse 3s ease-in-out infinite',
          whiteSpace: 'nowrap',
        }}
      >
        {/* Sheen */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(180deg,rgba(255,255,255,0.10) 0%,transparent 100%)', borderRadius: 999, pointerEvents: 'none' }} />
        <GiChessKnight size={15} color="#a78bfa" style={{ filter: 'drop-shadow(0 0 6px #8B5CF6)', flexShrink: 0 }} />
        <span style={{ fontFamily: INTER, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#c4b5fd' }}>
          HOW IT WORKS
        </span>
      </button>

      {/* ── Modal ──────────────────────────────────────────────────── */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.78)',
            backdropFilter: 'blur(16px) saturate(150%)',
            WebkitBackdropFilter: 'blur(16px) saturate(150%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
            animation: 'so-fadein .18s ease',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 490,
              maxHeight: '90vh',
              borderRadius: 28,
              display: 'flex', flexDirection: 'column',
              position: 'relative', overflow: 'hidden',
              animation: 'so-scalein .24s cubic-bezier(.34,1.56,.64,1)',
              ...glass,
            }}
          >
            {/* Top sheen layer */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '20%', background: 'linear-gradient(180deg,rgba(255,255,255,0.07) 0%,transparent 100%)', borderRadius: '28px 28px 0 0', pointerEvents: 'none', zIndex: 0 }} />

            {/* ── Header ─────────────────────────────────────────── */}
            <div style={{ padding: '22px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                {/* Icon chip */}
                <div style={{
                  width: 42, height: 42, borderRadius: 13, flexShrink: 0,
                  background: 'linear-gradient(145deg, rgba(245,158,11,0.22) 0%, rgba(245,158,11,0.09) 100%)',
                  border: '1px solid rgba(245,158,11,0.32)',
                  borderTopColor: 'rgba(245,158,11,0.58)',
                  boxShadow: '0 4px 18px rgba(245,158,11,0.20), inset 0 1.5px 0 rgba(255,255,255,0.14)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <GiChessQueen size={21} color="#F59E0B" style={{ filter: 'drop-shadow(0 0 7px #F59E0B88)' }} />
                </div>
                <div>
                  <div style={{ fontFamily: INTER, fontSize: 15, fontWeight: 800, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.97)', lineHeight: 1.2 }}>CHESSCHUCK</div>
                  <div style={{ fontFamily: INTER, fontSize: 9, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.10em', marginTop: 3, fontWeight: 500 }}>PROVABLY FAIR CHESS CASINO</div>
                </div>
              </div>

              {/* Close button */}
              <button
                className="so-close-btn"
                onClick={() => setOpen(false)}
                style={{
                  width: 34, height: 34,
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.04) 100%)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderTopColor: 'rgba(255,255,255,0.20)',
                  borderRadius: 11,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.25), inset 0 1.5px 0 rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.50)',
                  fontFamily: INTER, fontSize: 18,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, lineHeight: 1, transition: 'all .15s',
                }}
              ><FaTimes size={13} /></button>
            </div>

            {/* ── Segment tabs ───────────────────────────────────── */}
            <div style={{ padding: '16px 20px 0', flexShrink: 0, position: 'relative', zIndex: 1 }}>
              <SegmentTabs tabs={TABS} active={tab} onChange={setTab} />
            </div>

            {/* ── Scrollable content ─────────────────────────────── */}
            <div className="so-scroll" style={{ padding: '14px 20px 26px', overflowY: 'auto', flex: 1, position: 'relative', zIndex: 1 }}>
              {tab === 'round'    && <RoundTab />}
              {tab === 'fairness' && <FairnessTab />}
              {tab === 'payouts'  && <PayoutsTab />}
            </div>
          </div>
        </div>
      )}
    </>
  )
}