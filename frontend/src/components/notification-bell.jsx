import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { DateTime } from "luxon"
import { AlarmClock, Ban, Bell, CalendarClock, CheckCheck, PartyPopper, PauseCircle, Trash2 } from "lucide-react"

import * as notificationsApi from "@/api/notifications.api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"

const TYPE_ICON = {
  event_reminder: AlarmClock,
  event_changed: CalendarClock,
  event_cancelled: Ban,
  event_postponed: PauseCircle,
  event_deleted: Trash2,
  waitlist_promoted: PartyPopper,
}

const POLL_MS = 60_000

/** Header bell: unread count, the latest notifications, and a link to what each is about. */
export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)

  const refreshCount = useCallback(() => {
    notificationsApi
      .getUnreadCount()
      .then((res) => setUnread(res.data.data.unread))
      .catch(() => {}) // the count is a hint; a failed poll keeps the last value
  }, [])

  // Poll while the tab is visible, and catch up when the person comes back to it.
  useEffect(() => {
    refreshCount()
    const timer = setInterval(() => document.visibilityState === "visible" && refreshCount(), POLL_MS)
    const onVisible = () => document.visibilityState === "visible" && refreshCount()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refreshCount])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(null)
    notificationsApi
      .getNotifications({ limit: 20 })
      .then((res) => {
        if (cancelled) return
        setItems(res.data.data.notifications)
        setUnread(res.data.data.unread)
      })
      .catch(() => !cancelled && setError("Couldn't load notifications."))
    return () => {
      cancelled = true
    }
  }, [open])

  const openItem = async (item) => {
    if (!item.read) {
      setItems((list) => list.map((n) => (n.id === item.id ? { ...n, read: true } : n)))
      setUnread((n) => Math.max(0, n - 1))
      notificationsApi.markRead([item.id]).catch(() => {})
    }
    if (item.link) {
      setOpen(false)
      navigate(item.link)
    }
  }

  const markAll = async () => {
    setItems((list) => list?.map((n) => ({ ...n, read: true })))
    setUnread(0)
    try {
      await notificationsApi.markAllRead()
    } catch {
      refreshCount()
    }
  }

  const label = unread ? `Notifications, ${unread} unread` : "Notifications"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} title={label} className="relative">
          <Bell className="size-4" />
          {unread > 0 && (
            <span
              className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] leading-4 font-semibold text-primary-foreground tabular-nums"
              aria-hidden="true"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <h2 className="text-sm font-semibold">Notifications</h2>
          <Button variant="ghost" size="sm" onClick={markAll} disabled={!unread}>
            <CheckCheck data-icon="inline-start" />
            Mark all read
          </Button>
        </div>

        <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
          {error && <p role="alert" className="p-3 text-sm text-destructive">{error}</p>}
          {!items && !error && (
            <div className="space-y-2 p-3" aria-busy="true">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}
          {items?.length === 0 && (
            <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
              <Bell className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">You're all caught up</p>
              <p className="text-xs text-muted-foreground">Reminders and changes to events you reply to show up here.</p>
            </div>
          )}
          {items?.length > 0 && (
            <ul className="divide-y">
              {items.map((item) => {
                const Icon = TYPE_ICON[item.type] || Bell
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className={cn(
                        "flex w-full gap-3 px-3 py-2.5 text-left outline-none hover:bg-accent focus-visible:bg-accent",
                        !item.read && "bg-primary/5"
                      )}
                    >
                      <Icon className={cn("mt-0.5 size-4 shrink-0", item.read ? "text-muted-foreground" : "text-primary")} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm leading-snug", !item.read && "font-medium")}>{item.title}</span>
                        {item.body && <span className="mt-0.5 block text-xs text-muted-foreground">{item.body}</span>}
                        <time className="mt-0.5 block text-[0.7rem] text-muted-foreground" dateTime={item.createdAt}>
                          {DateTime.fromISO(item.createdAt).toRelative()}
                        </time>
                      </span>
                      {!item.read && (
                        <>
                          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                          <span className="sr-only">Unread</span>
                        </>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
