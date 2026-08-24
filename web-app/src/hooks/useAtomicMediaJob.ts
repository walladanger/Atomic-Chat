import { useCallback, useEffect, useRef, useState } from 'react'
import { atomicMediaClient } from '@/services/atomicMedia/client'
import type {
  AtomicMediaHealth,
  AtomicMediaJobRequest,
  AtomicMediaJobSnapshot,
} from '@/services/atomicMedia/types'

type AtomicMediaClientLike = Pick<
  typeof atomicMediaClient,
  'health' | 'createJob' | 'getJob'
>

export type AtomicMediaWorkerState = 'checking' | 'online' | 'offline'

const TERMINAL_STATUSES = new Set(['succeeded', 'failed'])

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Atomic Media request failed.'
}

export function useAtomicMediaJob(
  client: AtomicMediaClientLike = atomicMediaClient,
  pollIntervalMs = 1000
) {
  const [workerState, setWorkerState] =
    useState<AtomicMediaWorkerState>('checking')
  const [workerHealth, setWorkerHealth] = useState<AtomicMediaHealth | null>(null)
  const [job, setJob] = useState<AtomicMediaJobSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const disposedRef = useRef(false)
  const pollInFlightRef = useRef(false)

  const cancelPolling = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const refreshHealth = useCallback(async () => {
    setWorkerState('checking')
    try {
      const health = await client.health()
      if (disposedRef.current) return null
      setWorkerHealth(health)
      setWorkerState(health.status === 'ok' ? 'online' : 'offline')
      return health
    } catch {
      if (disposedRef.current) return null
      setWorkerHealth(null)
      setWorkerState('offline')
      return null
    }
  }, [client])

  const schedulePoll = useCallback(
    (jobId: string) => {
      cancelPolling()
      timerRef.current = setTimeout(async () => {
        timerRef.current = null
        if (disposedRef.current || pollInFlightRef.current) return
        pollInFlightRef.current = true
        try {
          const nextJob = await client.getJob(jobId)
          if (disposedRef.current) return
          setJob(nextJob)
          if (nextJob.status === 'failed') {
            setError(nextJob.error || 'Atomic Media generation failed.')
          } else if (!TERMINAL_STATUSES.has(nextJob.status)) {
            schedulePoll(jobId)
          }
        } catch (pollError) {
          if (disposedRef.current) return
          setError(errorMessage(pollError))
          schedulePoll(jobId)
        } finally {
          pollInFlightRef.current = false
        }
      }, pollIntervalMs)
    },
    [cancelPolling, client, pollIntervalMs]
  )

  const submit = useCallback(
    async (request: AtomicMediaJobRequest) => {
      cancelPolling()
      setError(null)
      try {
        const created = await client.createJob(request)
        if (disposedRef.current) return created
        setJob(created)
        if (created.status === 'failed') {
          setError(created.error || 'Atomic Media generation failed.')
        } else if (!TERMINAL_STATUSES.has(created.status)) {
          schedulePoll(created.job_id)
        }
        return created
      } catch (submitError) {
        if (!disposedRef.current) setError(errorMessage(submitError))
        throw submitError
      }
    },
    [cancelPolling, client, schedulePoll]
  )

  useEffect(() => {
    disposedRef.current = false
    void refreshHealth()
    return () => {
      disposedRef.current = true
      cancelPolling()
    }
  }, [cancelPolling, refreshHealth])

  return {
    workerState,
    workerHealth,
    job,
    error,
    submit,
    cancelPolling,
    refreshHealth,
  }
}
