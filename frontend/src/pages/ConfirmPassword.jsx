import { useState } from "react"
import { Eye, KeyRound, Landmark } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { confirmPassword } from "@/api/auth.api"
import { rememberSecurityConfirmation } from "@/components/SecurityGate"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function ConfirmPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const [visible, setVisible] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const requestedDestination = searchParams.get("returnTo")
  const returnTo = requestedDestination?.startsWith("/") && !requestedDestination.startsWith("//")
    ? requestedDestination
    : "/settings/profile"

  const submit = async (event) => {
    event.preventDefault()
    setError("")
    setLoading(true)
    try {
      await confirmPassword(password)
      if (returnTo === "/settings/security") rememberSecurityConfirmation(user?.id)
      navigate(returnTo, { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || "Unable to confirm your password")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mx-auto flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Landmark className="size-4" /></div>
        <h1 className="mt-6 text-center text-xl font-semibold">Confirm password</h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">This is a secure area of the application. Please confirm your password before continuing.</p>
        <Button variant="outline" className="mt-8 w-full"><KeyRound /> Confirm with passkey</Button>
        <div className="my-8 flex items-center gap-3"><div className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">OR CONFIRM WITH PASSWORD</span><div className="h-px flex-1 bg-border" /></div>
        <form onSubmit={submit} className="space-y-5">
          <label className="block space-y-2 text-sm"><span>Password</span><div className="relative"><Input type={visible ? "text" : "password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" aria-invalid={Boolean(error)} required /><button type="button" onClick={() => setVisible(!visible)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground" aria-label="Toggle password visibility"><Eye className="size-4" /></button></div></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Confirming..." : "Confirm password"}</Button>
        </form>
      </div>
    </div>
  )
}
