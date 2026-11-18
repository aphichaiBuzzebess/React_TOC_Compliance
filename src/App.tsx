import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/AppShell'
import NewAssessment from './pages/NewAssessment'
import Dashboard from './pages/Dashboard'
import Matrix from './pages/Matrix'
import Gaps from './pages/Gaps'
import Summary from './pages/Summary'
import Questions from './pages/Questions'
import KnowledgeBase from './pages/KnowledgeBase'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<NewAssessment />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/matrix" element={<Matrix />} />
        <Route path="/gaps" element={<Gaps />} />
        <Route path="/questions" element={<Questions />} />
        <Route path="/knowledge-base" element={<KnowledgeBase />} />
        <Route path="/summary" element={<Summary />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
