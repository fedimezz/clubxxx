"use client";

// Shared state of the member shell: the notification feed + unread counter used by the sidebar
// badge, the header bell and the dropdown. One fetch (and one 60 s poll) for all of them.
// Pages that change notifications (read / delete / clear) call `notifyNotificationsChanged()` so
// the badge updates immediately instead of waiting for the next poll.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

export interface ShellNotification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  sentAt: string;
}

interface ShellValue {
  notifications: ShellNotification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<ShellValue>({ notifications: [], unreadCount: 0, loading: false, refresh: async () => {} });

export const NOTIFICATIONS_CHANGED_EVENT = "clubx:notifications-changed";

export function notifyNotificationsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

export function useMemberShell() {
  return useContext(Ctx);
}

export function MemberShellProvider({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth();
  const [notifications, setNotifications] = useState<ShellNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!isLoggedIn) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    const mine = ++seq.current; // latest request wins
    try {
      const res = await fetch("/api/dashboard/notifications?limit=5", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (mine !== seq.current) return;
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number.isFinite(data.unreadCount) ? Math.max(0, data.unreadCount) : 0);
    } catch {
      if (mine !== seq.current) return;
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [isLoggedIn]);

  // Data synchronisation with the server (initial fetch + poll), not derived state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    const onChanged = () => void refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    };
  }, [refresh]);

  const value = useMemo(() => ({ notifications, unreadCount, loading, refresh }), [notifications, unreadCount, loading, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
