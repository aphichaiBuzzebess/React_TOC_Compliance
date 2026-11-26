import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { MotionConfig } from 'motion/react'
import { useAssessmentStore } from './store/useAssessmentStore'
import { useResolvedTheme } from './lib/theme'
import AppShell from './components/AppShell'
import NewAssessment from './pages/NewAssessment'
import Review from './pages/Review'
import Matrix from './pages/Matrix'
import Summary from './pages/Summary'
import KnowledgeBase from './pages/KnowledgeBase'
import AiSettings from './pages/AiSettings'
import History from './pages/History'
import Scouter from './pages/Scouter'
import Login from './pages/Login'

export default function App() {
  const accessCode = useAssessmentStore((s) => s.accessCode)
  const mode = useAssessmentStore((s) => s.mode)
  const user = useAssessmentStore((s) => s.user)
  const stamped = useAssessmentStore((s) => s.owner !== null)
  const theme = useResolvedTheme()
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    void useAssessmentStore.getState().loadServerDefault()
  }, [accessCode])
  useEffect(() => {
    void useAssessmentStore.getState().loadAuth()
  }, [])
  // Saved data that belongs to a person is not drawn until the server says who is signed in.
  if (mode === 'unknown' && stamped) return <div role="status" aria-busy="true" aria-label="กำลังตรวจสอบการล็อกอิน" className="min-h-screen bg-canvas" />
  if (mode === 'account' && !user) return <MotionConfig reducedMotion="user"><AppShell><Login /></AppShell></MotionConfig>
  return (
    <MotionConfig reducedMotion="user">
    <AppShell>
      <Routes>
        <Route path="/" element={<NewAssessment />} />
        <Route path="/review" element={<Review />} />
        <Route path="/dashboard" element={<Navigate to="/summary" replace />} />
        <Route path="/matrix" element={<Matrix />} />
        <Route path="/gaps" element={<Navigate to="/summary" replace />} />
        <Route path="/questions" element={<Navigate to="/summary" replace />} />
        <Route path="/knowledge-base" element={<KnowledgeBase />} />
        <Route path="/ai-settings" element={<AiSettings />} />
        <Route path="/history" element={<History />} />
        <Route path="/scouter" element={<Scouter />} />
        <Route path="/summary" element={<Summary />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
    </MotionConfig>
  )
}
