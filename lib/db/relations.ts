import { relations } from 'drizzle-orm'

import {
  chats,
  itineraryDays,
  itineraryItems,
  itineraryVersions,
  messages,
  parts,
  tripActionLogs,
  trips,
  tripSources
} from './schema'

export const chatsRelations = relations(chats, ({ many }) => ({
  messages: many(messages)
}))

export const messagesRelations = relations(messages, ({ one, many }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id]
  }),
  parts: many(parts)
}))

export const partsRelations = relations(parts, ({ one }) => ({
  message: one(messages, {
    fields: [parts.messageId],
    references: [messages.id]
  })
}))

export const tripsRelations = relations(trips, ({ many }) => ({
  days: many(itineraryDays),
  items: many(itineraryItems),
  sources: many(tripSources),
  versions: many(itineraryVersions),
  actionLogs: many(tripActionLogs)
}))

export const itineraryDaysRelations = relations(
  itineraryDays,
  ({ one, many }) => ({
    trip: one(trips, {
      fields: [itineraryDays.tripId],
      references: [trips.id]
    }),
    items: many(itineraryItems)
  })
)

export const tripSourcesRelations = relations(tripSources, ({ one, many }) => ({
  trip: one(trips, {
    fields: [tripSources.tripId],
    references: [trips.id]
  }),
  items: many(itineraryItems)
}))

export const itineraryItemsRelations = relations(itineraryItems, ({ one }) => ({
  trip: one(trips, {
    fields: [itineraryItems.tripId],
    references: [trips.id]
  }),
  day: one(itineraryDays, {
    fields: [itineraryItems.dayId],
    references: [itineraryDays.id]
  }),
  source: one(tripSources, {
    fields: [itineraryItems.sourceId],
    references: [tripSources.id]
  })
}))

export const itineraryVersionsRelations = relations(
  itineraryVersions,
  ({ one, many }) => ({
    trip: one(trips, {
      fields: [itineraryVersions.tripId],
      references: [trips.id]
    }),
    actionLogs: many(tripActionLogs)
  })
)

export const tripActionLogsRelations = relations(tripActionLogs, ({ one }) => ({
  trip: one(trips, {
    fields: [tripActionLogs.tripId],
    references: [trips.id]
  }),
  version: one(itineraryVersions, {
    fields: [tripActionLogs.versionId],
    references: [itineraryVersions.id]
  })
}))
