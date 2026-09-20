import { useEffect, useRef, useState } from 'react'
import { connectGameToHost, observeGameContentSize } from '../casino-sdk/guest'

/**
 * Detect whether we're inside a chain.wtf host iframe — synchronously,
 * with zero delay. No more 1500ms wait before demo mode kicks in.
 */
function inHostIframe() {
  try { return window.self !== window.top }
  catch { return true } // cross-origin iframe → treat as host
}

/**
 * useCasinoHost
 *
 * Connects to the chain.wtf casino host via Penpal when inside the iframe.
 * Falls back to demo mode immediately (synchronous) when running standalone.
 *
 * Returns:
 *   hostApi  — HostApiV1 once handshake completes (null in demo mode)
 *   snapshot — latest HostSnapshotV1 pushed by host  (null in demo mode)
 *   isDemo   — true when NOT inside the host iframe
 */
export function useCasinoHost() {
  // Synchronous init: if we're not in the iframe, isDemo is true from the
  // very first render — no waiting, no "CONNECT WALLET" flash.
  const [hostApi,  setHostApi]  = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [isDemo,   setIsDemo]   = useState(() => !inHostIframe())

  const hostApiRef = useRef(null)

  useEffect(() => {
    // Already in demo mode — skip SDK entirely
    if (isDemo) return

    let mounted = true

    let connection
    try {
      connection = connectGameToHost({
        async setState(nextSnapshot) {
          if (!mounted) return
          setSnapshot(nextSnapshot)
        },
      })
    } catch {
      // SDK unavailable — fall back to demo
      if (mounted) setIsDemo(true)
      return
    }

    connection.promise
      .then(parent => {
        if (!mounted) return
        hostApiRef.current = parent
        setHostApi(parent)
      })
      .catch(() => {
        // Handshake failed — shouldn't happen if inHostIframe() was right,
        // but handle gracefully by activating demo mode
        if (mounted) setIsDemo(true)
      })

    return () => {
      mounted = false
      connection.destroy()
    }
  }, [isDemo])

  // Report content size to host so it can size the iframe correctly
  useEffect(() => {
    if (!hostApi) return
    let observer
    try { observer = observeGameContentSize(hostApi) }
    catch { return }
    return () => observer?.disconnect()
  }, [hostApi])

  return { hostApi, snapshot, isDemo }
}