import { Navigate } from "react-router-dom"

import { useAuth } from "@/hooks/useAuth"

const CONFIRMATION_KEY = "securityPasswordConfirmation"
const CONFIRMATION_TTL = 10 * 60 * 1000

export function rememberSecurityConfirmation(userId) {
  sessionStorage.setItem(CONFIRMATION_KEY, JSON.stringify({ userId, confirmedAt: Date.now() }))
}

export default function SecurityGate({ children }) {
  const { user } = useAuth()
  let confirmation = null

  try {
    confirmation = JSON.parse(sessionStorage.getItem(CONFIRMATION_KEY))
  } catch {
    sessionStorage.removeItem(CONFIRMATION_KEY)
  }

  const confirmed = confirmation?.userId === user?.id && Date.now() - confirmation.confirmedAt < CONFIRMATION_TTL

  if (!confirmed) {
    return <Navigate to="/confirm-password?returnTo=%2Fsettings%2Fsecurity" replace />
  }

  return children
}
