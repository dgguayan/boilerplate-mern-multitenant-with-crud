import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom"
import { ThemeProvider } from "next-themes"

import { AuthProvider } from "./context/AuthContext.jsx"
import { AppSidebar } from "./components/app-sidebar.jsx"
import { SiteHeader } from "./components/site-header.jsx"
import ProtectedRoute from "./components/ProtectedRoute.jsx"
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar.jsx"
import { TooltipProvider } from "./components/ui/tooltip.jsx"
import Login from "./pages/Login.jsx"
import Register from "./pages/Register.jsx"
import Dashboard from "./pages/Dashboard.jsx"
import Projects from "./pages/Projects.jsx"
import Forbidden from "./pages/Forbidden.jsx"
import TemporaryPage from "./pages/TemporaryPage.jsx"
import SettingsPage from "./pages/Settings.jsx"
import ConfirmPassword from "./pages/ConfirmPassword.jsx"
import SecurityGate from "./components/SecurityGate.jsx"

const temporaryPages = [
  ["documents", "Documents"],
  ["calendar", "Calendar"],
  ["reports", "Reports"],
  ["teams", "Teams"],
  ["clients", "Clients"],
  ["members", "Members"],
  ["access-control", "Access Control"],
  ["audit-trail", "Audit Trail"],
  ["resources", "Resources"],
  ["help", "Help Center"],
]

function getSidebarDefaultOpen() {
  const match = document.cookie.match(/(?:^|;\s*)sidebar_state=(true|false)/)
  return match ? match[1] === "true" : true
}

function AppLayout() {
  return (
    <SidebarProvider defaultOpen={getSidebarDefaultOpen()}>
      <AppSidebar />
      <SidebarInset className="overflow-x-hidden">
        <SiteHeader />
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forbidden" element={<Forbidden />} />
              <Route path="/confirm-password" element={<ProtectedRoute><ConfirmPassword /></ProtectedRoute>} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/projects" element={<Projects />} />
                {temporaryPages.map(([path, title]) => (
                  <Route key={path} path={`/${path}`} element={<TemporaryPage title={title} />} />
                ))}
                <Route path="/settings/profile" element={<SettingsPage />} />
                <Route path="/settings/security" element={<SecurityGate><SettingsPage /></SecurityGate>} />
                <Route path="/settings/appearance" element={<SettingsPage />} />
              </Route>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  )
}
