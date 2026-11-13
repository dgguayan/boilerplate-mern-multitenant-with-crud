import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Eye, KeyRound, Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const tabs = [
  { label: "Profile", path: "/settings/profile" },
  { label: "Security", path: "/settings/security" },
  { label: "Appearance", path: "/settings/appearance" },
]

function SettingsNav() {
  const { pathname } = useLocation()
  return (
    <nav className="flex gap-1 overflow-x-auto lg:w-48 lg:shrink-0 lg:flex-col">
      {tabs.map((tab) => (
        <Link
          key={tab.path}
          to={tab.path}
          className={cn(
            "rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
            pathname === tab.path && "bg-accent font-medium text-accent-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}

function PasswordInput({ ...props }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className="pr-10" {...props} />
      <button type="button" onClick={() => setVisible(!visible)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground" aria-label={visible ? "Hide password" : "Show password"}>
        <Eye className="size-4" />
      </button>
    </div>
  )
}

function ProfileSettings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({ name: user?.name || "", email: user?.email || "" })

  const submit = (event) => {
    event.preventDefault()
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="w-full max-w-xl space-y-12">
      <section>
        <h2 className="font-medium">Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">Update your name and email address.</p>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <label className="block space-y-2 text-sm"><span>Name</span><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="block space-y-2 text-sm"><span>Email address</span><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <Button type="submit">{saved ? "Saved" : "Save"}</Button>
        </form>
      </section>

      <section>
        <h2 className="font-medium">Delete account</h2>
        <p className="mt-1 text-sm text-muted-foreground">Delete your account and all of its resources.</p>
        <div className="mt-6 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
          <p className="font-medium text-destructive">Warning</p>
          <p className="mt-1 text-sm text-destructive">Please proceed with caution. This action cannot be undone.</p>
          <Button variant="destructive" className="mt-4" onClick={() => navigate("/confirm-password")}>Delete account</Button>
        </div>
      </section>
    </div>
  )
}

function SecuritySettings() {
  const [saved, setSaved] = useState(false)
  const submit = (event) => {
    event.preventDefault()
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="w-full max-w-xl space-y-12">
      <section>
        <h2 className="font-medium">Update password</h2>
        <p className="mt-1 text-sm text-muted-foreground">Use a long, random password to keep your account secure.</p>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <label className="block space-y-2 text-sm"><span>Current password</span><PasswordInput placeholder="Current password" required /></label>
          <label className="block space-y-2 text-sm"><span>New password</span><PasswordInput placeholder="New password" required /></label>
          <label className="block space-y-2 text-sm"><span>Confirm password</span><PasswordInput placeholder="Confirm password" required /></label>
          <Button type="submit">{saved ? "Saved" : "Save"}</Button>
        </form>
      </section>

      <section>
        <h2 className="font-medium">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage your two-factor authentication settings.</p>
        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">When enabled, you will be prompted for a secure code during login from a compatible authenticator application.</p>
        <Button className="mt-4">Enable 2FA</Button>
      </section>

      <section>
        <h2 className="font-medium">Passkeys</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage your passkeys for passwordless sign-in.</p>
        <div className="mt-6 flex min-h-44 flex-col items-center justify-center rounded-lg border text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-muted"><KeyRound className="size-6 text-muted-foreground" /></div>
          <p className="mt-4 text-sm font-medium">No passkeys yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Add a passkey to sign in without a password.</p>
        </div>
        <Button variant="outline" className="mt-4">Add passkey</Button>
      </section>
    </div>
  )
}

function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const options = [{ value: "light", label: "Light", icon: Sun }, { value: "dark", label: "Dark", icon: Moon }, { value: "system", label: "System", icon: Monitor }]
  return (
    <section className="w-full max-w-xl">
      <h2 className="font-medium">Appearance settings</h2>
      <p className="mt-1 text-sm text-muted-foreground">Update the appearance settings for your account.</p>
      <div className="mt-6 inline-flex rounded-lg bg-muted p-1">
        {options.map((option) => (
          <button key={option.value} onClick={() => setTheme(option.value)} className={cn("flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors", theme === option.value && "bg-background text-foreground shadow-sm")}>
            <option.icon className="size-4" />{option.label}
          </button>
        ))}
      </div>
    </section>
  )
}

export default function SettingsPage() {
  const { pathname } = useLocation()
  return (
    <div className="flex-1 p-5 lg:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your profile and account settings.</p>
      </div>
      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:gap-12">
        <SettingsNav />
        {pathname === "/settings/security" ? <SecuritySettings /> : pathname === "/settings/appearance" ? <AppearanceSettings /> : <ProfileSettings />}
      </div>
    </div>
  )
}
