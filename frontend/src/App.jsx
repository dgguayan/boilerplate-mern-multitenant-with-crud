import { lazy, Suspense } from "react"
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom"
import { ThemeProvider } from "next-themes"

import { AuthProvider } from "./context/AuthContext.jsx"
import { AppSidebar } from "./components/app-sidebar.jsx"
import { SiteHeader } from "./components/site-header.jsx"
import ProtectedRoute from "./components/ProtectedRoute.jsx"
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar.jsx"
import { TooltipProvider } from "./components/ui/tooltip.jsx"
import { Toaster } from "./components/ui/sonner.jsx"
import Login from "./pages/Login.jsx"
import Register from "./pages/Register.jsx"
import Dashboard from "./pages/Dashboard.jsx"
import Projects from "./pages/Projects.jsx"
import Documents from "./pages/Documents.jsx"
import Forbidden from "./pages/Forbidden.jsx"
import TemporaryPage from "./pages/TemporaryPage.jsx"
import SettingsPage from "./pages/Settings.jsx"
import ConfirmPassword from "./pages/ConfirmPassword.jsx"
import SecurityGate from "./components/SecurityGate.jsx"

// Public pages: no sign-in, loaded only when visited.
const PublicCalendarPage = lazy(() => import("./pages/public/PublicCalendar.jsx"))
const PublicEventPage = lazy(() => import("./pages/public/PublicEvent.jsx"))
const EmbedWidgetPage = lazy(() => import("./pages/public/EmbedWidget.jsx"))

/**
 * The embed widget sits on other websites, so its colours come from its own ?theme= (auto follows
 * the visitor's system), never from the theme this browser saved for the app.
 */
function embedTheme() {
  if (!window.location.pathname.startsWith("/embed/")) return undefined
  const theme = new URLSearchParams(window.location.search).get("theme")
  if (theme === "light" || theme === "dark") return theme
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

// The calendar (and FullCalendar) load only when the page is visited.
const CalendarPage = lazy(() => import("./pages/Calendar.jsx"))
const CalendarInsightsPage = lazy(() => import("./pages/CalendarInsights.jsx"))
// Administration pages (administrators only)
const UserManagementPage = lazy(() => import("./pages/UserManagement.jsx"))
const RolesPermissionsPage = lazy(() => import("./pages/RolesPermissions.jsx"))
const LogsPage = lazy(() => import("./pages/Logs.jsx"))

const adminPages = [
  ["members", UserManagementPage],
  ["access-control", RolesPermissionsPage],
  ["audit-trail", LogsPage],
]

const temporaryPages = [
  ["reports", "Reports"],
  ["teams", "Teams"],
  ["clients", "Clients"],
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
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange forcedTheme={embedTheme()}>
      <TooltipProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forbidden" element={<Forbidden />} />
              <Route path="/p/:tenant" element={<Suspense fallback={null}><PublicCalendarPage /></Suspense>} />
              <Route path="/p/:tenant/events/:slug" element={<Suspense fallback={null}><PublicEventPage /></Suspense>} />
              <Route path="/embed/:tenant" element={<Suspense fallback={null}><EmbedWidgetPage /></Suspense>} />
              <Route path="/confirm-password" element={<ProtectedRoute><ConfirmPassword /></ProtectedRoute>} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/calendar" element={<Suspense fallback={null}><CalendarPage /></Suspense>} />
                <Route path="/calendar/insights" element={<ProtectedRoute requiredRole="manager"><Suspense fallback={null}><CalendarInsightsPage /></Suspense></ProtectedRoute>} />
                {adminPages.map(([path, Page]) => (
                  <Route
                    key={path}
                    path={`/${path}`}
                    element={<ProtectedRoute requiredRole="admin"><Suspense fallback={null}><Page /></Suspense></ProtectedRoute>}
                  />
                ))}
                {temporaryPages.map(([path, title, description]) => (
                  <Route key={path} path={`/${path}`} element={<TemporaryPage title={title} description={description} />} />
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
        <Toaster position="bottom-right" richColors closeButton />
      </TooltipProvider>
    </ThemeProvider>
  )
}
