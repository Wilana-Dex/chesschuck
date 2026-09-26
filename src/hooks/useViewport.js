import { useState, useEffect } from 'react'

const MOBILE_MAX = 767
const TABLET_MAX = 1023

function computeTier(w) {
  if (w <= MOBILE_MAX) return 'mobile'
  if (w <= TABLET_MAX) return 'tablet'
  return 'desktop'
}

export function useViewport() {
  const [tier, setTier] = useState(() =>
    typeof window !== 'undefined' ? computeTier(window.innerWidth) : 'desktop'
  )

  useEffect(() => {
    const onResize = () => setTier(computeTier(window.innerWidth))
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return { tier, isMobile: tier === 'mobile', isTablet: tier === 'tablet', isDesktop: tier === 'desktop' }
}