import { useMemo } from 'react'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { fromReqs, SAMPLE, type Assessment } from '@/lib/assessment'

/** The real result once a TOR has been assessed, otherwise the built-in sample. */
export function useAssessment(): Assessment {
  const result = useAssessmentStore((s) => s.result)
  return useMemo(() => (result ? fromReqs(result) : SAMPLE), [result])
}
