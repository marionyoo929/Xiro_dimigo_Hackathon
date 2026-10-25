import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

type CandidateView = { id: string; viewedByMe: boolean; status: string }

// Both review screens use the same rule: a card visible for 250ms is read.
// Only successful server writes count, and completion waits for the final reload.
export function useCandidateViews(base: string, candidates: CandidateView[], onRefresh: () => Promise<void>) {
  const elements = useRef(new Map<string, HTMLElement>())
  const current = useRef(candidates), refresh = useRef(onRefresh), mounted = useRef(true)
  const confirmed = useRef(new Set<string>()), failed = useRef(new Set<string>())
  const pending = useRef(new Map<string, Promise<boolean>>()), refreshing = useRef(0)
  const [revision, redraw] = useState(0), [syncing, setSyncing] = useState(false), [refreshError, setRefreshError] = useState('')
  current.current = candidates; refresh.current = onRefresh
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const refreshLatest = useCallback(async () => {
    refreshing.current++
    if (mounted.current) setSyncing(true)
    try { await refresh.current(); if (mounted.current) setRefreshError('') }
    catch { if (mounted.current) setRefreshError('최신 확인 상태를 불러오지 못했어요. 다시 확인해 주세요.') }
    finally {
      refreshing.current--
      if (mounted.current) setSyncing(pending.current.size > 0 || refreshing.current > 0)
    }
  }, [])
  const markViewed = useCallback((id: string): Promise<boolean> => {
    if (!current.current.some(item => item.id === id)) return Promise.resolve(false)
    if (current.current.some(item => item.id === id && item.viewedByMe) || confirmed.current.has(id)) return pending.current.get(id) || Promise.resolve(true)
    const existing = pending.current.get(id)
    if (existing) return existing
    if (mounted.current) setSyncing(true)
    const request = api(`${base}/${encodeURIComponent(id)}/view`, { method: 'POST' })
      .then(() => { confirmed.current.add(id); failed.current.delete(id); return true })
      .catch(() => { failed.current.add(id); return false })
      .finally(async () => {
        pending.current.delete(id)
        if (!mounted.current) return
        redraw(value => value + 1)
        if (!pending.current.size) await refreshLatest()
      })
    pending.current.set(id, request)
    return request
  }, [base, refreshLatest])
  const signature = candidates.map(item => `${item.id}:${item.viewedByMe}:${item.status}`).join('|')
  useEffect(() => {
    const timers = new Map<string, number>()
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.candidateId
        if (!id) continue
        if (!entry.isIntersecting || entry.intersectionRatio < 0.55 || entry.intersectionRect.height < 20 || entry.intersectionRect.width < 20) { clearTimeout(timers.get(id)); timers.delete(id); continue }
        const item = current.current.find(candidate => candidate.id === id)
        if (!item || item.viewedByMe || confirmed.current.has(id) || pending.current.has(id) || failed.current.has(id) || timers.has(id)) continue
        timers.set(id, window.setTimeout(() => { timers.delete(id); void markViewed(id) }, 250))
      }
    }, { threshold: 0.55 })
    for (const item of current.current) {
      const element = elements.current.get(item.id)
      if (element) observer.observe(element)
    }
    return () => { observer.disconnect(); timers.forEach(clearTimeout) }
  }, [signature, markViewed, revision])
  const viewed = (id: string) => confirmed.current.has(id) || candidates.some(item => item.id === id && item.viewedByMe)
  return {
    register: (id: string, element: HTMLElement | null) => { if (element) elements.current.set(id, element); else elements.current.delete(id) },
    markViewed, viewed, viewedCount: candidates.filter(item => viewed(item.id)).length, syncing,
    error: failed.current.size ? '확인 기록을 저장하지 못했어요. 다시 시도해 주세요.' : refreshError,
    retry: () => { const ids = [...failed.current]; if (ids.length) ids.forEach(id => { void markViewed(id) }); else void refreshLatest() },
  }
}
