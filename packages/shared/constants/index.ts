export const COMMISSION_RATE_DEFAULT = 0.15;

export const WALKER_RESPONSE_TIMEOUT_MINUTES = 15;

export const MAX_DOGS_PER_GROUP_WALK = 6;

export const SOCKET_EVENTS = {
  WALK_JOIN: "walk:join",
  WALK_LEAVE: "walk:leave",
  WALK_LOCATION: "walk:location",
  WALK_LOCATION_UPDATE: "walk:location:update",
  WALK_STATUS_CHANGED: "walk:status:changed",
  NOTIFICATION_NEW: "notification:new",
  MESSAGE_NEW: "message:new",
} as const;

export const NOTIFICATION_TYPES = {
  WALK_CONFIRMED:         "walk_confirmed",
  WALK_REJECTED:          "walk_rejected",
  WALK_CANCELLED_WALKER:  "walk_cancelled_walker",
  WALK_CANCELLED_OWNER:   "walk_cancelled_owner",
  WALK_WALKER_ON_WAY:     "walk_walker_on_way",
  WALK_IN_PROGRESS:       "walk_in_progress",
  WALK_COMPLETED:         "walk_completed",
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];

export const CONTACT_PATTERNS = [
  /\b\d{10,11}\b/,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  /whatsapp/i,
  /wasap/i,
  /instagram/i,
  /insta\b/i,
  /ig\b/i,
  /@[a-zA-Z0-9._]+/,
] as const;
