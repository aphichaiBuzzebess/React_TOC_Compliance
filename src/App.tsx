import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { MotionConfig } from 'motion/react'
import { useAssessmentStore } from './store/useAssessmentStore'
import { useResolvedTheme } from './lib/theme'
import AppShell from './components/AppShell'
import NewAssessment from './pages/NewAssessment'
import Dashboard from './pages/Dashboard'
import Matrix from './pages/Matrix'
import Gaps from './pages/Gaps'
import Summary from './pages/Summary'
import Questions from './pages/Questions'
import KnowledgeBase from './pages/KnowledgeBase'
import AiSettings from './pages/AiSettings'

export default function App() {
  const accessCode = useAssessmentStore((s) => s.accessCode)
  const theme = useResolvedTheme()
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    void useAssessmentStore.getState().loadServerDefault()
  }, [accessCode])
  return (
    <MotionConfig reducedMotion="user">
    <AppShell>
      <Routes>
        <Route path="/" element={<NewAssessment />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/matrix" element={<Matrix />} />
        <Route path="/gaps" element={<Gaps />} />
        <Route path="/questions" element={<Questions />} />
        <Route path="/knowledge-base" element={<KnowledgeBase />} />
        <Route path="/ai-settings" element={<AiSettings />} />
        <Route path="/summary" element={<Summary />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
    </MotionConfig>
  )
}
