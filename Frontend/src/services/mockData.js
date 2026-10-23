/**
 * Seed for the demo sign-in users only. Books, shelves, staff, flags, notifications and settings
 * come from the Django API (see adminApi.js, staffApi.js, authApi.js, notificationApi.js).
 */

export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR

export const USERS = [
  { id: 'u_admin', name: 'Rachel Morgan', username: 'rachel.morgan', email: 'rachel@bookhero.store', role: 'admin', title: 'Super Admin', hue: 42 },
  { id: 'u_sarah', name: 'Sarah Wilson', username: 'sarah.wilson', email: 'sarah@bookhero.store', role: 'staff', title: 'Inventory Staff', hue: 14 },
  { id: 'u_michael', name: 'Michael Brown', username: 'michael.brown', email: 'michael@bookhero.store', role: 'staff', title: 'Inventory Staff', hue: 205 },
  { id: 'u_david', name: 'David Miller', username: 'david.miller', email: 'david@bookhero.store', role: 'staff', title: 'Inventory Staff', hue: 150 },
  { id: 'u_emma', name: 'Emma Johnson', username: 'emma.johnson', email: 'emma@bookhero.store', role: 'staff', title: 'Inventory Staff', hue: 330 },
  { id: 'u_james', name: 'James Carter', username: 'james.carter', email: 'james@bookhero.store', role: 'staff', title: 'Inventory Staff', hue: 260 },
  { id: 'u_lucas', name: 'Lucas Martin', username: 'lucas.martin', email: 'lucas@bookhero.store', role: 'staff', title: 'Inventory Staff', hue: 100 },
  { id: 'u_aisha', name: 'Aisha Khan', username: 'aisha.khan', email: 'aisha@bookhero.store', role: 'staff', title: 'Inventory Staff', hue: 180 },
]

export function createSeed(now = Date.now()) {
  const users = USERS.map((u, i) => ({
    ...u,
    status: u.id === 'u_aisha' ? 'inactive' : 'active',
    createdAt: now - (180 - i * 12) * DAY,
    lastActive: now - DAY,
  }))
  return {
    version: 4,
    seededAt: now,
    users,
  }
}
