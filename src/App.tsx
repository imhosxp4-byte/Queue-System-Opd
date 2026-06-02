import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import NavBar from './components/NavBar'
import LoginPage from './pages/Login'
import ConnectionSettingsPage from './pages/ConnectionSettings'
import MainPage from './pages/Main'
import QueueCallPage from './pages/QueueCall'
import QueueDisplayPage from './pages/QueueDisplay'
import DisplayConfigsPage from './pages/DisplayConfigs'
import QueueHistoryPage from './pages/QueueHistory'
import AppSettingsPage from './pages/AppSettings'
import QueueMiniPage from './pages/QueueMini'

function AppLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <NavBar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/display" element={<QueueDisplayPage />} />
        <Route path="/queue-mini" element={<QueueMiniPage />} />

        <Route element={<AppLayout />}>
          <Route path="/main" element={<MainPage />} />
          <Route path="/queue-call" element={<QueueCallPage />} />
          <Route path="/queue-history" element={<QueueHistoryPage />} />
          <Route path="/display-configs" element={<DisplayConfigsPage />} />
          <Route path="/app-settings" element={<AppSettingsPage />} />
          <Route path="/settings" element={<ConnectionSettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
