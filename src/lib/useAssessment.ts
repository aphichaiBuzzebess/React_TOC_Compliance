import { useMemo } from 'react'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { fromReqs, type Assessment } from '@/lib/assessment'

/** The assessed TOR, or null until one has been run. */
export function useAssessment(): Assessment | null {
  const result = useAssessmentStore((s) => s.result)
  return useMemo(() => (result ? fromReqs(result) : null), [result])
}
