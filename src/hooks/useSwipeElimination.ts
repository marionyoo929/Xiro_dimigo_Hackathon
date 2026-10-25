import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'

type Gesture = { pointerId: number; x: number; y: number; axis: 'pending' | 'horizontal' | 'vertical' }
export function useSwipeElimination(disabled: boolean, onEliminate: () => Promise<boolean>) {
  const [drag, setDrag] = useState<number | null>(null), [exiting, setExiting] = useState(false)
  const gesture = useRef<Gesture | null>(null), locked = useRef(false), mounted = useRef(true)
  const action = useRef(onEliminate); action.current = onEliminate
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; gesture.current = null } }, [])
  const eliminate = async () => {
    if (disabled || locked.current) { setDrag(null); return false }
    locked.current = true; setDrag(null); setExiting(true)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let changed = false
    try {
      const [result] = await Promise.all([action.current(), new Promise(resolve => window.setTimeout(resolve, reducedMotion ? 0 : 220))])
      changed = result
    } catch { /* The caller presents API errors; restore the card on failure. */ }
    finally { locked.current = false; if (mounted.current) { setExiting(false); setDrag(null) } }
    return changed
  }
  const endCapture = (event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return {
    exiting, eliminate,
    style: { transform: exiting ? 'translate3d(-110%,0,0)' : drag === null ? undefined : `translate3d(${drag}px,0,0)`, transition: drag !== null && !exiting ? 'none' : undefined } as CSSProperties,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (disabled || locked.current || !event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest('button,a,input,select,textarea,summary')) return
        gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, axis: 'pending' }
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const g = gesture.current
        if (!g || g.pointerId !== event.pointerId) return
        const dx = event.clientX - g.x, dy = event.clientY - g.y
        if (g.axis === 'pending') {
          if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) g.axis = 'vertical'
          else if (dx < -8 && Math.abs(dx) > Math.abs(dy) * 1.2) { g.axis = 'horizontal'; event.currentTarget.setPointerCapture(event.pointerId) }
        }
        if (g.axis === 'horizontal') { event.preventDefault(); setDrag(Math.max(-event.currentTarget.clientWidth, Math.min(0, dx))) }
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        const g = gesture.current
        if (!g || g.pointerId !== event.pointerId) return
        gesture.current = null
        if (g.axis === 'horizontal' && event.clientX - g.x <= -Math.min(96, event.currentTarget.clientWidth * .28)) void eliminate()
        else setDrag(null)
        endCapture(event)
      },
      onPointerCancel: (event: PointerEvent<HTMLElement>) => { gesture.current = null; setDrag(null); endCapture(event) },
      onLostPointerCapture: () => { gesture.current = null; setDrag(null) },
    },
  }
}
