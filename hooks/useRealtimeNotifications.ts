// src/hooks/useRealtimeNotifications.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  addLiveNotification,
  markAllLiveNotificationsRead,
  markLiveNotificationRead,
  mergeNotificationFeed,
  type NotificationFeedState,
} from "@/lib/notification-feed";

export interface LiveNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  data?: Record<string, unknown> | null;
  sentAt: string;
  readAt: string | null;
}

export function useRealtimeNotifications() {
  const { isLoggedIn } = useAuth();
  const [feed, setFeed] = useState<NotificationFeedState<LiveNotification>>({
    notifications: [],
    unreadCount: 0,
  });
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const liveVersion = useRef(0);
  const fetchSequence = useRef(0);
  const liveNotifications = useRef(new Map<string, { version: number; notification: LiveNotification }>());

  // Initial load: whatever the member already has from before this tab
  // was open (page refresh, or notifications sent while they were
  // offline). SSE only delivers events that happen WHILE connected — it
  // is not a substitute for fetching history.
  const fetchExisting = useCallback(async () => {
    const requestId = ++fetchSequence.current;
    const versionAtStart = liveVersion.current;
    try {
      const res = await fetch("/api/dashboard/notifications", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json() as {
          notifications?: LiveNotification[];
          unreadCount?: number;
        };
        if (requestId !== fetchSequence.current) return;
        setFeed((current) => {
          const pendingLive = [...liveNotifications.current.values()]
            .filter((entry) => entry.version > versionAtStart)
            .map((entry) => entry.notification);
          return mergeNotificationFeed(
            current,
            [...pendingLive, ...(Array.isArray(json.notifications) ? json.notifications : [])],
            Number(json.unreadCount),
            liveVersion.current === versionAtStart
          );
        });
      }
    } catch {
      // The next SSE reconnect or notification change retries the history sync.
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      sourceRef.current?.close();
      sourceRef.current = null;
      fetchSequence.current += 1;
      liveVersion.current = 0;
      liveNotifications.current.clear();
      setFeed({ notifications: [], unreadCount: 0 });
      setConnected(false);
      return;
    }

    fetchExisting();

    // EventSource can't send custom headers, but same-origin requests
    // send cookies automatically, so the httpOnly auth cookie reaches
    // /api/sse without any token needing to travel in the URL.
    const source = new EventSource(`/api/sse`);
    sourceRef.current = source;

    source.onopen = () => {
      setConnected(true);
      void fetchExisting();
    };

    source.addEventListener("notification", (e) => {
      try {
        const notification = JSON.parse((e as MessageEvent).data) as LiveNotification;
        if (!notification?.id || !notification.sentAt) return;
        const version = ++liveVersion.current;
        liveNotifications.current.set(notification.id, { version, notification });
        while (liveNotifications.current.size > 50) {
          const oldest = liveNotifications.current.keys().next().value;
          if (oldest === undefined) break;
          liveNotifications.current.delete(oldest);
        }
        setFeed((current) => addLiveNotification(current, notification));
      } catch {
        void fetchExisting();
      }
    });

    source.onerror = () => {
      // EventSource auto-reconnects on its own after a network blip;
      // we just reflect connection status, nothing to manually retry.
      setConnected(false);
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [isLoggedIn, fetchExisting]);

  useEffect(() => {
    const refresh = () => void fetchExisting();
    window.addEventListener("clubx:notifications-changed", refresh);
    return () => window.removeEventListener("clubx:notifications-changed", refresh);
  }, [fetchExisting]);

  const markAsRead = useCallback(async (id: string) => {
    setFeed((current) => markLiveNotificationRead(current, id));
    try {
      const response = await fetch(`/api/dashboard/notifications/${id}`, {
        method: "PUT",
        credentials: "include",
      });
      if (!response.ok) void fetchExisting();
    } catch {
      void fetchExisting();
    }
  }, [fetchExisting]);

  const markAllAsRead = useCallback(async () => {
    setFeed((current) => markAllLiveNotificationsRead(current));
    try {
      const response = await fetch("/api/dashboard/notifications/read-all", {
        method: "PUT",
        credentials: "include",
      });
      if (!response.ok) void fetchExisting();
    } catch {
      void fetchExisting();
    }
  }, [fetchExisting]);

  return { notifications: feed.notifications, unreadCount: feed.unreadCount, connected, markAsRead, markAllAsRead };
}
