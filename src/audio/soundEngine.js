// ── Ambient music engine — pure Web Audio, zero external files ────────────
// A slow 4-chord minor loop (i–VI–III–VII) as a soft sustained pad, with a
// gentle arpeggio stepping over the top and a slow filter sweep for movement,
// so it reads as music rather than a static drone.

const CHORDS = [
  [220.00, 261.63, 329.63], // A minor  (A3 C4 E4)
  [174.61, 220.00, 261.63], // F major  (F3 A3 C4)
  [261.63, 329.63, 392.00], // C major  (C4 E4 G4)
  [196.00, 246.94, 293.66], // G major  (G3 B3 D4)
]
const CHORD_DUR = 4.0 // seconds per chord
const ARP_STEP  = 0.5 // seconds per arpeggio note

export function createSoundEngine() {
  let ctx = null, master = null, filter = null, chordIdx = 0, schedulerId = null

  function ensureCtx() {
    if (ctx) return
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    master = ctx.createGain()
    master.gain.value = 0
    filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1200
    master.connect(filter)
    filter.connect(ctx.destination)

    // slow, subtle filter sweep — the "movement" that keeps it from feeling static
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.value = 0.03
    lfoGain.gain.value = 300
    lfo.connect(lfoGain)
    lfoGain.connect(filter.frequency)
    lfo.start()
  }

  function playPadChord(freqs, at, dur) {
    freqs.forEach(f => {
      const osc = ctx.createOscillator()
      const g   = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(0.05, at + 1.2)
      g.gain.linearRampToValueAtTime(0, at + dur)
      osc.connect(g); g.connect(master)
      osc.start(at); osc.stop(at + dur + 0.1)
    })
  }

  function playArpNote(freq, at) {
    const osc = ctx.createOscillator()
    const g   = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq * 2 // one octave above the pad
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(0.06, at + 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, at + ARP_STEP * 0.9)
    osc.connect(g); g.connect(master)
    osc.start(at); osc.stop(at + ARP_STEP)
  }

  function scheduleChord() {
    const now   = ctx.currentTime
    const chord = CHORDS[chordIdx % CHORDS.length]
    playPadChord(chord, now + 0.05, CHORD_DUR)
    for (let i = 0; i < CHORD_DUR / ARP_STEP; i++) {
      playArpNote(chord[i % chord.length], now + 0.05 + i * ARP_STEP)
    }
    chordIdx++
  }

  return {
    start() {
      ensureCtx()
      if (ctx.state === 'suspended') ctx.resume()
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.8)
      scheduleChord()
      clearInterval(schedulerId)
      schedulerId = setInterval(scheduleChord, CHORD_DUR * 1000)
    },
    stop() {
      clearInterval(schedulerId)
      if (master && ctx) master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5)
    },
  }
}