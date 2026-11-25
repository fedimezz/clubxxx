import { describe, expect, it } from "vitest";
import {
  addLiveNotification,
  markAllLiveNotificationsRead,
  markLiveNotificationRead,
  mergeNotificationFeed,
  type NotificationFeedItem,
  type NotificationFeedState,
} from "../notification-feed";

interface Item extends NotificationFeedItem {
  title: string;
}

const item = (id: string, sentAt: string, isRead = false, title = id): Item => ({
  id,
  sentAt,
  isRead,
  title,
});

const initial: NotificationFeedState<Item> = {
  notifications: [],
  unreadCount: 0,
};

describe("notification feed state", () => {
  it("uses the server's full unread count even when only the latest 50 items are loaded", () => {
    const latest = Array.from({ length: 50 }, (_, index) =>
      item(String(index), new Date(2026, 0, index + 1).toISOString())
    );

    const state = mergeNotificationFeed(initial, latest, 83, true);

    expect(state.notifications).toHaveLength(50);
    expect(state.unreadCount).toBe(83);
  });

  it("keeps live events that arrive while a stale history response is in flight", () => {
    const live = item("live", "2026-11-25T10:00:00.000Z");
    const withLive = addLiveNotification(initial, live);
    const merged = mergeNotificationFeed(
      withLive,
      [live, item("older", "2026-11-25T09:00:00.000Z")],
      0,
      false
    );

    expect(merged.notifications.map(({ id }) => id)).toEqual(["live", "older"]);
    expect(merged.unreadCount).toBe(1);
    expect(withLive.unreadCount).toBe(1);
  });

  it("removes notifications deleted by another open view", () => {
    const current = {
      notifications: [item("deleted", "2026-11-25T10:00:00.000Z")],
      unreadCount: 1,
    };

    expect(mergeNotificationFeed(current, [], 0, true)).toEqual({
      notifications: [],
      unreadCount: 0,
    });
  });

  it("does not count or display the same live event twice", () => {
    const notification = item("same", "2026-11-25T10:00:00.000Z");
    const once = addLiveNotification(initial, notification);

    expect(addLiveNotification(once, notification)).toBe(once);
    expect(once.unreadCount).toBe(1);
  });

  it("keeps unread counts consistent when marking one or all items read", () => {
    const state = mergeNotificationFeed(
      initial,
      [item("unread", "2026-11-25T10:00:00.000Z"), item("read", "2026-11-25T09:00:00.000Z", true)],
      1,
      true
    );

    const oneRead = markLiveNotificationRead(state, "unread");
    expect(oneRead.unreadCount).toBe(0);
    expect(markLiveNotificationRead(oneRead, "unread")).toBe(oneRead);
    expect(markAllLiveNotificationsRead(state)).toMatchObject({
      unreadCount: 0,
      notifications: [{ isRead: true }, { isRead: true }],
    });
  });
});
