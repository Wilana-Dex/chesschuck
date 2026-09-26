import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { Chess } from 'chess.js'
import gsap from 'gsap'

const C = {
  DARK_SQ:  0x2A2D35,
  LIGHT_SQ: 0x3D4148,
  WHITE_PC: 0xC2BDB4,
  BLACK_PC: 0x1A1C22,
  FRAME:    0x15171C,
  GLOW_W:   0xF5C842,
  GLOW_D:   0x5B4FE8,
  GLOW_B:   0xC0C0C8,
  BG:       0x0d0d10,
}

const GLB_TABLE_Y   = 0.89
const SCALE         = 8
const PLAY_WINDOW   = 80
const INITIAL_DELAY = 1.8

// Camera was framed for a wide desktop window. Vertical FOV is fixed at 42°,
// so a narrower (portrait) aspect ratio only crops the sides — it doesn't
// shrink the board. Pulling the camera back proportionally as aspect narrows
// keeps the whole board in frame and reads as the board actually shrinking
// on a phone, instead of getting cropped.
const BASE_CAM_POS = new THREE.Vector3(0, 6.5, 6)
const REF_ASPECT   = 16 / 10
function cameraDistanceScale(aspect) {
  return Math.min(2.15, Math.max(1, REF_ASPECT / aspect))
}

function calcTiming(plyCount) {
  const count       = Math.max(1, plyCount)
  const usable      = PLAY_WINDOW - INITIAL_DELAY
  const slotPerMove = usable / count
  const animDur     = Math.min(0.8, Math.max(0.2, slotPerMove * 0.7))
  const gap         = Math.max(0.05, slotPerMove - animDur)
  return { gap, animDur }
}

function pieceMat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 })
}

function parseName(name) {
  const parts  = name.split('_')
  const color  = name.startsWith('White') ? 'w' : 'b'
  const type   = parts[1]?.[0]?.toLowerCase()
  const square = parts[2]?.toLowerCase()
  return { color, type, square }
}

function isLight(squareName) {
  const file = squareName.charCodeAt(7) - 97
  const rank = parseInt(squareName[8]) - 1
  return (file + rank) % 2 !== 0
}

function keep(name) {
  return (
    name?.startsWith('White-Piece_')       ||
    name?.startsWith('Black-Piece_')       ||
    name?.startsWith('Square_')            ||
    name === 'Tables_TheBoard_Inner_Frame' ||
    name === 'Tables_TheBoard_Outer_Frame'
  )
}

const NICE_ENV_MESHES = new Set([
  'SideItems_Walls','Floor','Tables_Chair1','Tables_Chair2',
  'Tables_Leg','Tables_obj','Others_Flower','Others_vaze',
  'TheFlowers','SideItems_Plants_Grid','SideItems_TheDoor',
  'Others_Chess_Chronometer',
])

// Room palette matched to reference image
const ENV_MAT_COLORS = {
  'SideItems_Walls':          0xC0B49C,   // warm stone plaster
  'Floor':                    0x3A3C3A,   // dark cobblestone grey (from image)
  'Tables_Chair1':            0x9A7232,   // warm oak — matches table tone in image
  'Tables_Chair2':            0x9A7232,
  'Tables_Leg':               0x5E3A0E,   // dark walnut leg
  'Tables_obj':               0x7A4E18,   // medium warm brown table (from image)
  'Others_Flower':            0xEAE6DC,   // off-white cotton ball (from image)
  'Others_vaze':              0x1E1C18,   // near-black charcoal ceramic (from image)
  'TheFlowers':               0x382416,   // dark brown cotton branches (from image)
  'SideItems_Plants_Grid':    0x2C2E2A,   // dark plant planter
  'SideItems_TheDoor':        0x5C3C14,   // dark warm wood door
  'Others_Chess_Chronometer': 0x181614,   // near-black clock (from image)
}

export default function ChessBoard({
  moves      = [],
  moveCount  = 0,
  phase      = 'waiting',
  outcome    = null,
  startedAt  = null,
  isDeciding = false,
  envMode    = false,
  onMove     = () => {},
}) {
  const mountRef    = useRef(null)
  const sceneRef    = useRef(null)
  const camRef      = useRef(null)
  const camScaleRef = useRef(1)   // current camera-distance scale, kept in sync by onResize
  const rendRef     = useRef(null)
  const rafRef      = useRef(null)
  const rootRef     = useRef(null)
  const deadRef     = useRef(false)
  const readyRef    = useRef(false)
  const ambientRef  = useRef(null)   // stored so envMode can dim it
  const hemiRef     = useRef(null)   // stored so envMode can kill warm sky cast
  const spotRef     = useRef(null)   // stored so envMode can warm + dim it

  const piecesRef   = useRef({})
  const origPosRef  = useRef({})
  const tmplRef     = useRef({})
  const clonesRef   = useRef([])
  const capturedRef = useRef({ w: [], b: [] })  // bench tracking

  const gameRef     = useRef(new Chess())
  const idxRef      = useRef(0)
  const epochRef    = useRef(0)

  const movesRef     = useRef([])
  const moveCountRef = useRef(0)
  const startedAtRef = useRef(null)

  const timerRef     = useRef(null)
  const panRef       = useRef(null)
  const envMeshesRef = useRef([])
  const envModeRef   = useRef(false)     // mirrors envMode prop — readable from any effect
  const curPhaseRef  = useRef('waiting') // mirrors phase prop — readable from envMode effect

  // ── Square → world position ────────────────────────────────────
  function getTargetPos(square) {
    if (!rootRef.current) return null
    const mesh = rootRef.current.getObjectByName(`Square_${square.toLowerCase()}`)
    if (!mesh) return null
    const wp = new THREE.Vector3()
    mesh.getWorldPosition(wp)
    return wp
  }

  // ── Move captured piece to bench beside the board ──────────────
  // capturedColor = 'w' | 'b' (colour of the piece that was captured)
  // animate = true for live moves, false for fast-forward
  function placeOnBench(mesh, capturedColor, animate) {
    const list = capturedRef.current[capturedColor]
    const idx  = list.length
    list.push(mesh)

    const a1 = getTargetPos('a1')
    const h1 = getTargetPos('h1')
    const a8 = getTargetPos('a8')
    if (!a1 || !h1 || !a8) { if (!animate) mesh.visible = false; return }

    // One square width in world space
    const sqW = (h1.x - a1.x) / 7
    const col = idx % 8
    const row = Math.floor(idx / 8)

    // White pieces captured → bench beyond rank 8 (far side from camera)
    // Black pieces captured → bench beyond rank 1 (near camera)
    const anchor = capturedColor === 'w' ? a8 : a1
    const zDir   = capturedColor === 'w' ? -1 : 1

    const worldTarget = new THREE.Vector3(
      anchor.x + col * sqW * 0.82,
      anchor.y,
      anchor.z + zDir * sqW * (1.0 + row * 0.9),
    )
    const parent = mesh.parent
    const lp     = parent ? parent.worldToLocal(worldTarget.clone()) : worldTarget.clone()

    gsap.killTweensOf(mesh.position)
    gsap.killTweensOf(mesh.scale)
    if (animate) {
      gsap.to(mesh.scale,    { x: 0.62, y: 0.62, z: 0.62, duration: 0.25 })
      gsap.to(mesh.position, { x: lp.x, y: lp.y, z: lp.z, duration: 0.7, ease: 'power2.inOut', delay: 0.1 })
    } else {
      mesh.position.copy(lp)
      mesh.scale.set(0.62, 0.62, 0.62)
    }
  }

  // ── Animate one piece — SLIDE only, no hop or bounce ──────────
  function animatePiece(from, to, capturedSquare, animDur) {
    const piece = piecesRef.current[from]
    if (!piece) return Promise.resolve()
    const worldTarget = getTargetPos(to)
    if (!worldTarget) return Promise.resolve()

    const localTarget = piece.parent
      ? piece.parent.worldToLocal(worldTarget.clone())
      : worldTarget.clone()

    if (capturedSquare && capturedSquare !== from) {
      const cap = piecesRef.current[capturedSquare]
      if (cap) {
        placeOnBench(cap, cap.name.startsWith('White') ? 'w' : 'b', true)
        delete piecesRef.current[capturedSquare]
      }
    }

    delete piecesRef.current[from]
    piecesRef.current[to] = piece

    return new Promise(resolve => {
      gsap.killTweensOf(piece.position)
      gsap.to(piece.position, {
        x: localTarget.x, y: localTarget.y, z: localTarget.z,
        duration: animDur, ease: 'power3.inOut', onComplete: resolve,
      })
    })
  }

  // ── Castling / en passant / promotion ─────────────────────────
  function handleSpecial(move, animDur) {
    if (move.flags.includes('k') || move.flags.includes('q')) {
      const ks   = move.flags.includes('k')
      const rank = move.color === 'w' ? '1' : '8'
      animatePiece((ks ? 'h' : 'a') + rank, (ks ? 'f' : 'd') + rank, null, animDur)
    }
    if (move.flags.includes('e')) {
      const capRank = move.color === 'w'
        ? String(parseInt(move.to[1]) - 1)
        : String(parseInt(move.to[1]) + 1)
      const capSq = move.to[0] + capRank
      const cap   = piecesRef.current[capSq]
      if (cap) {
        placeOnBench(cap, cap.name.startsWith('White') ? 'w' : 'b', true)
        delete piecesRef.current[capSq]
      }
    }
    if (move.promotion) {
      setTimeout(() => {
        const old = piecesRef.current[move.to]
        if (old) old.visible = false
        const key  = `${move.color}_${move.promotion}`
        const tmpl = tmplRef.current[key] || tmplRef.current[`${move.color}_q`]
        if (!tmpl) return
        const clone  = tmpl.clone()
        const wPos   = getTargetPos(move.to)
        if (!wPos) return
        const parent = tmpl.parent
        const lPos   = parent ? parent.worldToLocal(wPos.clone()) : wPos.clone()
        parent?.add(clone)
        clone.position.copy(lPos)
        clone.material = pieceMat(move.color === 'w' ? C.WHITE_PC : C.BLACK_PC)
        clone.visible  = true
        piecesRef.current[move.to] = clone
        clonesRef.current.push(clone)
      }, animDur * 1000 + 200)
    }
  }

  // ── Apply one move instantly (fast-forward) ────────────────────
  function applyInstant(moveStr) {
    let result
    try { result = gameRef.current.move(moveStr) } catch { return }
    if (!result) return

    if (result.captured && !result.flags.includes('e')) {
      const cap = piecesRef.current[result.to]
      if (cap) {
        placeOnBench(cap, cap.name.startsWith('White') ? 'w' : 'b', false)
        delete piecesRef.current[result.to]
      }
    }

    const piece = piecesRef.current[result.from]
    if (piece) {
      const wp = getTargetPos(result.to)
      if (wp) {
        const lp = piece.parent ? piece.parent.worldToLocal(wp.clone()) : wp.clone()
        piece.position.copy(lp)
      }
      delete piecesRef.current[result.from]
      piecesRef.current[result.to] = piece
    }

    if (result.flags.includes('e')) {
      const capRank = result.color === 'w'
        ? String(parseInt(result.to[1]) - 1)
        : String(parseInt(result.to[1]) + 1)
      const capSq = result.to[0] + capRank
      const cap   = piecesRef.current[capSq]
      if (cap) {
        placeOnBench(cap, cap.name.startsWith('White') ? 'w' : 'b', false)
        delete piecesRef.current[capSq]
      }
    }

    if (result.flags.includes('k') || result.flags.includes('q')) {
      const ks   = result.flags.includes('k')
      const rank = result.color === 'w' ? '1' : '8'
      const from = (ks ? 'h' : 'a') + rank
      const to   = (ks ? 'f' : 'd') + rank
      const rook = piecesRef.current[from]
      if (rook) {
        const wp = getTargetPos(to)
        if (wp) {
          const lp = rook.parent ? rook.parent.worldToLocal(wp.clone()) : wp.clone()
          rook.position.copy(lp)
        }
        delete piecesRef.current[from]
        piecesRef.current[to] = rook
      }
    }
  }

  // ── playNext ───────────────────────────────────────────────────
  const onMoveRef   = useRef(onMove)
  useEffect(() => { onMoveRef.current = onMove }, [onMove])

  const playNextRef = useRef(null)
  playNextRef.current = async function playNext(epoch) {
    if (epoch !== epochRef.current || deadRef.current) return

    const moveList = movesRef.current
    const idx      = idxRef.current
    if (idx >= moveList.length) return

    const { gap, animDur } = calcTiming(moveCountRef.current || moveList.length)

    let result
    try { result = gameRef.current.move(moveList[idx]) }
    catch {
      idxRef.current = idx + 1
      timerRef.current = setTimeout(() => playNextRef.current(epoch), 300)
      return
    }
    if (!result) {
      idxRef.current = idx + 1
      timerRef.current = setTimeout(() => playNextRef.current(epoch), 300)
      return
    }

    const capSq = result.captured && !result.flags.includes('e') ? result.to : null
    await animatePiece(result.from, result.to, capSq, animDur)
    handleSpecial(result, animDur)

    if (epoch !== epochRef.current || deadRef.current) return

    onMoveRef.current(result)

    idxRef.current = idx + 1
    if (idx + 1 < moveList.length) {
      timerRef.current = setTimeout(() => playNextRef.current(epoch), gap * 1000)
    }
  }

  // ── Reset board to starting position ──────────────────────────
  function resetBoard() {
    Object.values(piecesRef.current).forEach(mesh => {
      if (mesh) { gsap.killTweensOf(mesh.position); gsap.killTweensOf(mesh.scale) }
    })
    ;[...capturedRef.current.w, ...capturedRef.current.b].forEach(mesh => {
      if (mesh) { gsap.killTweensOf(mesh.position); gsap.killTweensOf(mesh.scale) }
    })
    capturedRef.current = { w: [], b: [] }

    clonesRef.current.forEach(clone => { clone.parent?.remove(clone); clone.geometry?.dispose() })
    clonesRef.current = []
    gameRef.current   = new Chess()
    piecesRef.current = {}

    rootRef.current.traverse(obj => {
      if (obj.name?.startsWith('White-Piece_') || obj.name?.startsWith('Black-Piece_')) {
        const orig = origPosRef.current[obj.name]
        if (orig) {
          obj.position.copy(orig)
          obj.scale.set(1, 1, 1)
          obj.visible = true
          const { square } = parseName(obj.name)
          if (square) piecesRef.current[square] = obj
        }
      }
    })
  }

  // ── Winner celebration: losers scatter off board, winners fan ──
  function doCelebration(winnerColor) {
    if (!rootRef.current) return

    const winCol  = winnerColor === 'white' ? 'w' : 'b'
    const loseCol = winnerColor === 'white' ? 'b' : 'w'
    const a1 = getTargetPos('a1')
    const h8 = getTargetPos('h8')
    if (!a1 || !h8) return

    const centre = new THREE.Vector3(
      (a1.x + h8.x) / 2,
      (a1.y + h8.y) / 2,
      (a1.z + h8.z) / 2,
    )
    const boardHalfW = Math.abs(h8.x - a1.x) / 2
    const radius     = boardHalfW * 0.56

    // ── 1. Loser pieces scatter off the board ─────────────────────
    const loserPieces = []
    Object.entries(piecesRef.current).forEach(([sq, mesh]) => {
      if (!mesh) return
      const isLoser = loseCol === 'w' ? mesh.name.startsWith('White') : mesh.name.startsWith('Black')
      if (isLoser) loserPieces.push({ sq, mesh })
    })

    loserPieces.forEach(({ sq, mesh }, i) => {
      const sqWorld = getTargetPos(sq)
      if (!sqWorld) return

      // Vector from board centre through this square, extended 3× half-width off board
      const dir = new THREE.Vector3()
        .subVectors(sqWorld, centre)
      if (dir.length() < 0.001) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5)
      dir.normalize().multiplyScalar(boardHalfW * 3.2)

      const exitWorld = sqWorld.clone().add(dir)
      const parent    = mesh.parent
      const exitLocal = parent ? parent.worldToLocal(exitWorld.clone()) : exitWorld.clone()

      gsap.to(mesh.position, {
        x: exitLocal.x, y: exitLocal.y, z: exitLocal.z,
        duration: 0.52, ease: 'power2.in',
        delay: i * 0.05,
      })
    })

    // ── 2. Winner celebration after losers are gone ────────────────
    const winDelay = loserPieces.length * 0.05 + 0.65

    let kingMesh = null
    const others = []
    Object.values(piecesRef.current).forEach(mesh => {
      if (!mesh) return
      const isWinner = winCol === 'w' ? mesh.name.startsWith('White') : mesh.name.startsWith('Black')
      if (!isWinner) return
      if (mesh.name.includes('_King_')) kingMesh = mesh
      else others.push(mesh)
    })

    if (kingMesh) {
      // King slides to board centre
      const kp = kingMesh.parent ? kingMesh.parent.worldToLocal(centre.clone()) : centre.clone()
      gsap.to(kingMesh.position, {
        x: kp.x, y: kp.y, z: kp.z,
        duration: 1.2, ease: 'power2.inOut', delay: winDelay,
      })

      // Remaining winner pieces fan into a circle around the king
      others.forEach((mesh, i) => {
        const angle = (i / others.length) * Math.PI * 2
        const world = new THREE.Vector3(
          centre.x + Math.cos(angle) * radius,
          centre.y,
          centre.z + Math.sin(angle) * radius,
        )
        const parent = mesh.parent
        const lp     = parent ? parent.worldToLocal(world.clone()) : world.clone()
        gsap.to(mesh.position, {
          x: lp.x, y: lp.y, z: lp.z,
          duration: 0.9 + i * 0.04,
          ease: 'power2.inOut',
          delay: winDelay + 0.4 + i * 0.07,
        })
      })
    }

    // Camera eases in (skip if room mode already owns overhead view)
    if (!envModeRef.current) {
      const cam = camRef.current
      if (cam) {
        panRef.current?.kill()
        const s = camScaleRef.current
        gsap.to(cam.position, {
          x: 0, y: 5.0 * s, z: 5.0 * s,
          duration: 2.5, ease: 'power2.inOut',
          delay: winDelay,
          onUpdate: () => cam.lookAt(0, 0, 0),
        })
      }
    }
  }

  // ── startRound: reset + fast-forward + animate ────────────────
  function startRound() {
    if (!readyRef.current || !rootRef.current) return

    clearTimeout(timerRef.current)
    resetBoard()

    epochRef.current += 1
    const epoch    = epochRef.current
    const moveList = movesRef.current
    const { gap, animDur } = calcTiming(moveCountRef.current || moveList.length)

    let startIdx = 0
    if (startedAtRef.current) {
      const elapsedSec  = (Date.now() - new Date(startedAtRef.current).getTime()) / 1000
      const slotPerMove = (PLAY_WINDOW - INITIAL_DELAY) / Math.max(1, moveList.length)
      startIdx = Math.min(Math.max(0, Math.floor(elapsedSec / slotPerMove)), moveList.length - 1)
    }

    for (let i = 0; i < startIdx; i++) applyInstant(moveList[i])
    idxRef.current = startIdx

    const delay = startIdx === 0 ? INITIAL_DELAY * 1000 : 400
    timerRef.current = setTimeout(() => playNextRef.current(epoch), delay)
  }

  // ── Scene setup — runs once ────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return
    deadRef.current  = false
    readyRef.current = false

    const W = mountRef.current.clientWidth  || window.innerWidth
    const H = mountRef.current.clientHeight || window.innerHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type    = THREE.PCFShadowMap
    renderer.outputColorSpace  = THREE.SRGBColorSpace
    renderer.domElement.style.display = 'block'
    mountRef.current.appendChild(renderer.domElement)
    rendRef.current = renderer

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(C.BG)
    sceneRef.current = scene

    const cam = new THREE.PerspectiveCamera(42, W / H, 0.1, 200)
    camScaleRef.current = cameraDistanceScale(W / H)
    cam.position.copy(BASE_CAM_POS).multiplyScalar(camScaleRef.current)
    cam.lookAt(0, 0, 0)
    camRef.current = cam

    // Ambient — stored so envMode can dim + warm it
    const ambient = new THREE.AmbientLight(0xffffff, 1.2)
    scene.add(ambient)
    ambientRef.current = ambient

    const hemi = new THREE.HemisphereLight(0xfff4e0, 0x1a1c2a, 0.6)
    scene.add(hemi)
    hemiRef.current = hemi

    // Key light — stored so envMode can dim + warm it
    const spot = new THREE.SpotLight(0xffffff, 4)
    spot.decay = 0
    spot.position.set(0, 10, 2)
    spot.castShadow = true
    spot.shadow.mapSize.set(2048, 2048)
    spot.angle    = Math.PI / 4
    spot.penumbra = 0.4
    spot.target.position.set(0, 0, 0)
    scene.add(spot, spot.target)
    spotRef.current = spot

    const fill = new THREE.DirectionalLight(0xfff0d0, 0.5)
    fill.position.set(-3, 4, 5)
    scene.add(fill)

    const rim = new THREE.DirectionalLight(0x5B4FE8, 0.15)
    rim.position.set(5, 3, -3)
    scene.add(rim)

    const tick = () => {
      if (deadRef.current) return
      rafRef.current = requestAnimationFrame(tick)
      renderer.render(scene, cam)
    }
    tick()

    const onResize = () => {
      if (deadRef.current || !mountRef.current) return
      const w = mountRef.current.clientWidth
      const h = mountRef.current.clientHeight
      if (!w || !h) return
      cam.aspect = w / h
      camScaleRef.current = cameraDistanceScale(w / h)
      cam.position.copy(BASE_CAM_POS).multiplyScalar(camScaleRef.current)
      cam.lookAt(0, 0, 0)
      cam.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(mountRef.current)
    window.addEventListener('resize', onResize)
    requestAnimationFrame(onResize)
    setTimeout(onResize, 150)   // iframe layout not always ready in first rAF

    const draco = new DRACOLoader()
    draco.setDecoderPath('/draco/')
    const loader = new GLTFLoader()
    loader.setDRACOLoader(draco)

    loader.load('/assets/ChessGLB.glb', (gltf) => {
      if (deadRef.current) return

      const root = gltf.scene
      root.scale.set(SCALE, SCALE, SCALE)
      root.position.set(0, -GLB_TABLE_Y * SCALE, 0)

      root.traverse(obj => {
        if (obj.isMesh && !keep(obj.name)) {
          obj.visible = false
          envMeshesRef.current.push(obj)
        }
      })
      root.traverse(obj => {
        if (!keep(obj.name) || !obj.isMesh) return
        obj.castShadow    = true
        obj.receiveShadow = true

        if (obj.name.startsWith('Square_')) {
          obj.material = new THREE.MeshStandardMaterial({
            color: isLight(obj.name) ? C.LIGHT_SQ : C.DARK_SQ, roughness: 0.8, metalness: 0.05,
          })
          return
        }
        if (obj.name === 'Tables_TheBoard_Inner_Frame' || obj.name === 'Tables_TheBoard_Outer_Frame') {
          obj.material = new THREE.MeshStandardMaterial({ color: C.FRAME, roughness: 0.6, metalness: 0.2 })
          return
        }
        if (obj.name.startsWith('White-Piece_') || obj.name.startsWith('Black-Piece_')) {
          const { color, type, square } = parseName(obj.name)
          obj.material = pieceMat(color === 'w' ? C.WHITE_PC : C.BLACK_PC)
          if (square) {
            piecesRef.current[square]    = obj
            origPosRef.current[obj.name] = obj.position.clone()
          }
          const key = `${color}_${type}`
          if (type && !tmplRef.current[key]) tmplRef.current[key] = obj
        }
      })

      rootRef.current  = root
      scene.add(root)
      scene.updateMatrixWorld(true)   // GLB objects need world matrices before applyInstant/getTargetPos
      readyRef.current = true

      if (movesRef.current.length > 0) startRound()
    }, undefined, err => console.error('ChessGLB load error:', err))

    return () => {
      deadRef.current  = true
      readyRef.current = false
      ro.disconnect()
      window.removeEventListener('resize', onResize)
      clearTimeout(timerRef.current)
      panRef.current?.kill()
      cancelAnimationFrame(rafRef.current)
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
      renderer.dispose()
      sceneRef.current = null
      camRef.current   = null
      rootRef.current  = null
    }
  }, [])

  // ── New moves → new round ─────────────────────────────────────
  useEffect(() => {
    movesRef.current     = moves
    moveCountRef.current = moveCount
    startedAtRef.current = startedAt
    if (!moves.length || !readyRef.current || !rootRef.current) return
    startRound()
  }, [moves])

  // ── Soft stop at T=75: no new moves scheduled, current tween finishes ────
  // Do NOT bump epoch or kill tweens here — the result effect at T=80 does that.
  // Killing tweens at T=75 was the cause of "pieces frozen at starting position"
  // when joining mid-round: isDeciding fired ~2s after load, killing the
  // fast-forward animation before pieces reached their target squares.
  useEffect(() => {
    if (!isDeciding) return
    clearTimeout(timerRef.current) // stop queuing the next move — no new moves after T=75
  }, [isDeciding])

  // ── Environment toggle — wooden room ──────────────────────────
  useEffect(() => {
    envModeRef.current = envMode

    // Show / hide room meshes and apply palette on first show
    envMeshesRef.current.forEach(mesh => {
      const show = envMode && NICE_ENV_MESHES.has(mesh.name)
      mesh.visible = show
      if (show && !mesh.userData.envMatApplied) {
        mesh.userData.envMatApplied = true
        mesh.material = new THREE.MeshStandardMaterial({
          color:     ENV_MAT_COLORS[mesh.name] ?? 0x7B5E3C,
          roughness: 0.82,
          metalness: 0.0,
        })
      }
    })

    if (sceneRef.current) {
      // Near-black background — room meshes provide the colour, not the bg
      sceneRef.current.background = new THREE.Color(envMode ? 0x0C0906 : C.BG)
    }

    // hemi OFF in room mode — the warm sky colour (0xfff4e0, intensity 0.6) is the
    // primary cause of the orange soup: it paints every surface amber regardless of
    // spot colour. Kill it entirely in room mode; restore for plain mode.
    if (hemiRef.current) {
      hemiRef.current.intensity = envMode ? 0.0 : 0.6
    }
    // Ambient low + warm spot → natural highlight/shadow contrast in room mode
    if (ambientRef.current) {
      ambientRef.current.intensity = envMode ? 0.30 : 1.2
      ambientRef.current.color.set(0xffffff)
    }
    if (spotRef.current) {
      spotRef.current.intensity = envMode ? 2.2 : 4
      spotRef.current.color.set(envMode ? 0xffcc88 : 0xffffff)
    }
    // Camera intentionally NOT touched here — room mode uses the same
    // phase-driven camera as plain mode (no overhead jump).
  }, [envMode])

  // ── Keep startedAt ref fresh ───────────────────────────────────
  useEffect(() => { startedAtRef.current = startedAt }, [startedAt])

  // ── Stop animation on result ───────────────────────────────────
  useEffect(() => {
    if (phase !== 'result') return
    const snap = epochRef.current
    clearTimeout(timerRef.current)
    Object.values(piecesRef.current).forEach(mesh => {
      if (mesh) gsap.killTweensOf(mesh.position)
    })
    if (epochRef.current === snap) epochRef.current += 1
  }, [phase])

  // ── Camera by phase — same behaviour in plain and room mode ──────
  useEffect(() => {
    curPhaseRef.current = phase
    const cam = camRef.current
    if (!cam) return
    const s = camScaleRef.current
    if (phase === 'betting_locked') {
      panRef.current?.kill()
      panRef.current = gsap.timeline({ repeat: -1 })
        .to(cam.position, { x: -3.5 * s, y: 5.5 * s, z: 4.5 * s, duration: 18, ease: 'sine.inOut', onUpdate: () => cam.lookAt(0, 0, 0) })
        .to(cam.position, { x: 0,        y: 7 * s,   z: 3.5 * s, duration: 9,  ease: 'sine.inOut', onUpdate: () => cam.lookAt(0, 0, 0) })
        .to(cam.position, { x: 3.5 * s,  y: 5.5 * s, z: 4.5 * s, duration: 18, ease: 'sine.inOut', onUpdate: () => cam.lookAt(0, 0, 0) })
        .to(cam.position, { x: 0,        y: 6.5 * s, z: 6 * s,   duration: 9,  ease: 'sine.inOut', onUpdate: () => cam.lookAt(0, 0, 0) })
    }
    if (phase === 'betting_open' || phase === 'waiting') {
      panRef.current?.kill()
      gsap.to(cam.position, { x: 0, y: 6.5 * s, z: 6 * s, duration: 1.5, ease: 'power2.inOut', onUpdate: () => cam.lookAt(0, 0, 0) })
    }
  }, [phase])

  // ── Outcome glow + winner celebration ─────────────────────────
  useEffect(() => {
    if (!outcome || !sceneRef.current) return
    const color = outcome === 'white' ? C.GLOW_W : outcome === 'draw' ? C.GLOW_D : C.GLOW_B
    const glow  = new THREE.PointLight(color, 0, 10)
    glow.decay  = 0
    glow.position.set(0, 1, 0)
    sceneRef.current.add(glow)
    gsap.to(glow, { intensity: 3, duration: 1.2, ease: 'power2.out' })
    gsap.to(glow, { intensity: 0, duration: 2.0, ease: 'power2.in', delay: 3,
      onComplete: () => sceneRef.current?.remove(glow) })
    if (outcome !== 'draw') {
      setTimeout(() => doCelebration(outcome), 1500)
    }
  }, [outcome])

  return <div ref={mountRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
}