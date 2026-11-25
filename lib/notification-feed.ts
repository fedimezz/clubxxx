export interface NotificationFeedItem {
  id: string;
  sentAt: string;
  isRead: boolean;
}

export interface NotificationFeedState<T extends NotificationFeedItem> {
  notifications: T[];
  unreadCount: number;
}

const FEED_LIMIT = 50;

export function mergeNotificationFeed<T extends NotificationFeedItem>(
  state: NotificationFeedState<T>,
  incoming: T[],
  serverUnreadCount: number,
  useServerUnreadCount: boolean
): NotificationFeedState<T> {
  const byId = new Map(incoming.map((notification) => [notification.id, notification]));
  const notifications = [...byId.values()]
    .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))
    .slice(0, FEED_LIMIT);

  return {
    notifications,
    unreadCount: useServerUnreadCount
      ? Math.max(0, Number.isFinite(serverUnreadCount) ? serverUnreadCount : 0)
      : state.unreadCount,
  };
}

export function addLiveNotification<T extends NotificationFeedItem>(
  state: NotificationFeedState<T>,
  notification: T
): NotificationFeedState<T> {
  if (state.notifications.some((item) => item.id === notification.id)) return state;

  return {
    notifications: [notification, ...state.notifications]
      .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))
      .slice(0, FEED_LIMIT),
    unreadCount: state.unreadCount + (notification.isRead ? 0 : 1),
  };
}

export function markLiveNotificationRead<T extends NotificationFeedItem>(
  state: NotificationFeedState<T>,
  id: string
): NotificationFeedState<T> {
  const notification = state.notifications.find((item) => item.id === id);
  if (!notification || notification.isRead) return state;

  return {
    notifications: state.notifications.map((item) =>
      item.id === id ? { ...item, isRead: true } : item
    ),
    unreadCount: Math.max(0, state.unreadCount - 1),
  };
}

export function markAllLiveNotificationsRead<T extends NotificationFeedItem>(
  state: NotificationFeedState<T>
): NotificationFeedState<T> {
  return {
    notifications: state.notifications.map((item) => ({ ...item, isRead: true })),
    unreadCount: 0,
  };
}
