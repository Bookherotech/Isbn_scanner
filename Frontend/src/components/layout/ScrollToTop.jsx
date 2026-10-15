import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Every page opens at the top. Query-only changes (drawers, tabs) keep the scroll position. */
export function ScrollToTop() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    document.querySelectorAll('.phone__screen').forEach((el) => el.scrollTo({ top: 0, behavior: 'instant' }))
  }, [pathname])
  return null
}
