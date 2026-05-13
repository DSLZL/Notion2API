import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { QUERY_KEYS } from '../constants'
import { API_BASE } from '../env'

/**
 * Global SSE connection hook — call once in Shell layout.
 * Listens to /admin/events and invalidates relevant query caches.
 */
export function useSSE() {
  const qc = useQueryClient()
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const url = `${API_BASE}/admin/events`
    const es = new EventSource(url, { withCredentials: true })
    esRef.current = es

    // Config / session events
    es.addEventListener('admin.ready', () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG })
    })
    es.addEventListener('session.refreshed', () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACCOUNTS })
    })
    es.addEventListener('session.error', () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG })
    })

    // Account events
    es.addEventListener('account.added', () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACCOUNTS })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG })
    })
    es.addEventListener('account.removed', () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACCOUNTS })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG })
    })
    es.addEventListener('account.updated', () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACCOUNTS })
    })
    es.addEventListener('account.activated', () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACCOUNTS })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG })
    })

    // Conversation events
    es.addEventListener('conversation.started', () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CONVERSATIONS })
    })
    es.addEventListener('conversation.updated', () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CONVERSATIONS })
    })
    es.addEventListener('conversation.completed', () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CONVERSATIONS })
    })
    es.addEventListener('conversation.failed', () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CONVERSATIONS })
    })

    // Config changes
    es.addEventListener('config.updated', () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.SETTINGS })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.MODELS })
    })

    es.onerror = () => {
      // EventSource auto-reconnects; no action needed
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [qc])
}
