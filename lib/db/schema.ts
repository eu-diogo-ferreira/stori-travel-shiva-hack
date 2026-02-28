import { createId } from '@paralleldrive/cuid2'
import { InferSelectModel, sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  json,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from 'drizzle-orm/pg-core'

// Constants
const ID_LENGTH = 191
const USER_ID_LENGTH = 255
const VARCHAR_LENGTH = 256
const FILENAME_LENGTH = 1024

// ID generation function
export const generateId = () => createId()

// Chats table
export const chats = pgTable(
  'chats',
  {
    id: varchar('id', { length: ID_LENGTH })
      .primaryKey()
      .$defaultFn(() => generateId()),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    title: text('title').notNull(),
    userId: varchar('user_id', { length: USER_ID_LENGTH }).notNull(),
    visibility: varchar('visibility', {
      length: VARCHAR_LENGTH,
      enum: ['public', 'private']
    })
      .notNull()
      .default('private')
  },
  table => [
    // Indexes
    index('chats_user_id_idx').on(table.userId),
    index('chats_user_id_created_at_idx').on(
      table.userId,
      table.createdAt.desc()
    ),
    index('chats_created_at_idx').on(table.createdAt.desc()),
    // Composite index for RLS subqueries in messages and parts tables
    index('chats_id_user_id_idx').on(table.id, table.userId),

    // RLS Policies
    pgPolicy('users_manage_own_chats', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`user_id = current_setting('app.current_user_id', true)`,
      withCheck: sql`user_id = current_setting('app.current_user_id', true)`
    }),
    pgPolicy('public_chats_readable', {
      as: 'permissive',
      for: 'select',
      to: 'public',
      using: sql`visibility = 'public'`
    })
  ]
).enableRLS()

export type Chat = InferSelectModel<typeof chats>

// Messages table (simplified)
export const messages = pgTable(
  'messages',
  {
    id: varchar('id', { length: ID_LENGTH })
      .primaryKey()
      .$defaultFn(() => generateId()),
    chatId: varchar('chat_id', { length: ID_LENGTH })
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: VARCHAR_LENGTH }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
    metadata: jsonb('metadata').$type<Record<string, any>>()
  },
  table => [
    index('messages_chat_id_idx').on(table.chatId),
    index('messages_chat_id_created_at_idx').on(table.chatId, table.createdAt),

    // RLS Policies - allow access to messages if user owns the chat
    pgPolicy('users_manage_chat_messages', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`EXISTS (
        SELECT 1 FROM ${chats}
        WHERE ${chats}.id = chat_id
        AND ${chats}.user_id = current_setting('app.current_user_id', true)
      )`,
      withCheck: sql`EXISTS (
        SELECT 1 FROM ${chats}
        WHERE ${chats}.id = chat_id
        AND ${chats}.user_id = current_setting('app.current_user_id', true)
      )`
    }),
    pgPolicy('public_chat_messages_readable', {
      as: 'permissive',
      for: 'select',
      to: 'public',
      using: sql`EXISTS (
        SELECT 1 FROM ${chats}
        WHERE ${chats}.id = chat_id
        AND ${chats}.visibility = 'public'
      )`
    })
  ]
).enableRLS()

export type Message = InferSelectModel<typeof messages>

// Parts table
export const parts = pgTable(
  'parts',
  {
    id: varchar('id', { length: ID_LENGTH })
      .primaryKey()
      .$defaultFn(() => generateId()),
    messageId: varchar('message_id', { length: ID_LENGTH })
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    order: integer('order').notNull(),
    type: varchar('type', { length: VARCHAR_LENGTH }).notNull(),

    // Text parts
    text_text: text('text_text'),

    // Reasoning parts
    reasoning_text: text('reasoning_text'),

    // File parts
    file_mediaType: varchar('file_media_type', { length: VARCHAR_LENGTH }),
    file_filename: varchar('file_filename', { length: FILENAME_LENGTH }),
    file_url: text('file_url'),

    // Source URL parts
    source_url_sourceId: varchar('source_url_source_id', {
      length: VARCHAR_LENGTH
    }),
    source_url_url: text('source_url_url'),
    source_url_title: text('source_url_title'),

    // Source document parts
    source_document_sourceId: varchar('source_document_source_id', {
      length: VARCHAR_LENGTH
    }),
    source_document_mediaType: varchar('source_document_media_type', {
      length: VARCHAR_LENGTH
    }),
    source_document_title: text('source_document_title'),
    source_document_filename: varchar('source_document_filename', {
      length: FILENAME_LENGTH
    }),
    source_document_url: text('source_document_url'),
    source_document_snippet: text('source_document_snippet'),

    // Tool parts (generic)
    tool_toolCallId: varchar('tool_tool_call_id', { length: VARCHAR_LENGTH }),
    tool_state: varchar('tool_state', { length: VARCHAR_LENGTH }),
    tool_errorText: text('tool_error_text'),

    // Tool-specific columns (all Morphic tools)
    tool_search_input: json('tool_search_input').$type<any>(),
    tool_search_output: json('tool_search_output').$type<any>(),
    tool_fetch_input: json('tool_fetch_input').$type<any>(),
    tool_fetch_output: json('tool_fetch_output').$type<any>(),
    tool_question_input: json('tool_question_input').$type<any>(),
    tool_question_output: json('tool_question_output').$type<any>(),

    // Todo tool columns
    tool_todoWrite_input: json('tool_todoWrite_input').$type<any>(),
    tool_todoWrite_output: json('tool_todoWrite_output').$type<any>(),
    tool_todoRead_input: json('tool_todoRead_input').$type<any>(),
    tool_todoRead_output: json('tool_todoRead_output').$type<any>(),

    // Dynamic tools (includes MCP and other runtime-defined tools)
    tool_dynamic_input: json('tool_dynamic_input').$type<any>(),
    tool_dynamic_output: json('tool_dynamic_output').$type<any>(),
    tool_dynamic_name: varchar('tool_dynamic_name', { length: VARCHAR_LENGTH }),
    tool_dynamic_type: varchar('tool_dynamic_type', { length: VARCHAR_LENGTH }),

    // Data parts (generic support)
    data_prefix: varchar('data_prefix', { length: VARCHAR_LENGTH }),
    data_content: json('data_content').$type<any>(),
    data_id: varchar('data_id', { length: VARCHAR_LENGTH }),

    // Provider metadata
    providerMetadata: json('provider_metadata').$type<Record<string, any>>(),

    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  table => [
    // Indexes
    index('parts_message_id_idx').on(table.messageId),
    index('parts_message_id_order_idx').on(table.messageId, table.order),

    // Constraints
    check('text_text_required', sql`(type != 'text' OR text_text IS NOT NULL)`),
    check(
      'reasoning_text_required',
      sql`(type != 'reasoning' OR reasoning_text IS NOT NULL)`
    ),
    check(
      'file_fields_required',
      sql`(type != 'file' OR (file_media_type IS NOT NULL AND file_filename IS NOT NULL AND file_url IS NOT NULL))`
    ),
    check(
      'tool_state_valid',
      sql`(tool_state IS NULL OR tool_state IN ('input-streaming', 'input-available', 'output-available', 'output-error'))`
    ),
    check(
      'tool_fields_required',
      sql`(type NOT LIKE 'tool-%' OR (tool_tool_call_id IS NOT NULL AND tool_state IS NOT NULL))`
    ),

    // RLS Policies - allow access to parts if user owns the related chat
    pgPolicy('users_manage_message_parts', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`EXISTS (
        SELECT 1 FROM ${messages}
        INNER JOIN ${chats} ON ${chats}.id = ${messages}.chat_id
        WHERE ${messages}.id = message_id
        AND ${chats}.user_id = current_setting('app.current_user_id', true)
      )`,
      withCheck: sql`EXISTS (
        SELECT 1 FROM ${messages}
        INNER JOIN ${chats} ON ${chats}.id = ${messages}.chat_id
        WHERE ${messages}.id = message_id
        AND ${chats}.user_id = current_setting('app.current_user_id', true)
      )`
    }),
    pgPolicy('public_chat_parts_readable', {
      as: 'permissive',
      for: 'select',
      to: 'public',
      using: sql`EXISTS (
        SELECT 1 FROM ${messages}
        INNER JOIN ${chats} ON ${chats}.id = ${messages}.chat_id
        WHERE ${messages}.id = message_id
        AND ${chats}.visibility = 'public'
      )`
    })
  ]
).enableRLS()

export type Part = InferSelectModel<typeof parts>
export type NewPart = typeof parts.$inferInsert

// Travel domain tables
export const trips = pgTable(
  'trips',
  {
    id: varchar('id', { length: ID_LENGTH })
      .primaryKey()
      .$defaultFn(() => generateId()),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    userId: varchar('user_id', { length: USER_ID_LENGTH }).notNull(),
    title: varchar('title', { length: VARCHAR_LENGTH }).notNull(),
    origin: varchar('origin', { length: VARCHAR_LENGTH }),
    destination: varchar('destination', { length: VARCHAR_LENGTH }),
    startDate: varchar('start_date', { length: VARCHAR_LENGTH }),
    endDate: varchar('end_date', { length: VARCHAR_LENGTH }),
    budgetMinCents: integer('budget_min_cents'),
    budgetMaxCents: integer('budget_max_cents'),
    currency: varchar('currency', { length: 3 }),
    tripState: varchar('trip_state', {
      length: VARCHAR_LENGTH,
      enum: ['DISCOVERY', 'SELECTION', 'PLANNING', 'REFINEMENT', 'FINALIZATION']
    })
      .notNull()
      .default('DISCOVERY'),
    preferences: jsonb('preferences')
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    lastVersion: integer('last_version').notNull().default(0)
  },
  table => [
    index('trips_user_id_idx').on(table.userId),
    index('trips_user_id_created_at_idx').on(
      table.userId,
      table.createdAt.desc()
    ),
    index('trips_user_state_idx').on(table.userId, table.tripState),
    check(
      'trips_budget_order_check',
      sql`(
        budget_min_cents IS NULL
        OR budget_max_cents IS NULL
        OR budget_max_cents >= budget_min_cents
      )`
    ),
    pgPolicy('users_manage_own_trips', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`user_id = current_setting('app.current_user_id', true)`,
      withCheck: sql`user_id = current_setting('app.current_user_id', true)`
    })
  ]
).enableRLS()

export type Trip = InferSelectModel<typeof trips>

export const itineraryDays = pgTable(
  'itinerary_days',
  {
    id: varchar('id', { length: ID_LENGTH })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tripId: varchar('trip_id', { length: ID_LENGTH })
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    dayIndex: integer('day_index').notNull(),
    date: varchar('date', { length: VARCHAR_LENGTH }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  table => [
    index('itinerary_days_trip_id_idx').on(table.tripId),
    index('itinerary_days_trip_day_idx').on(table.tripId, table.dayIndex),
    uniqueIndex('itinerary_days_trip_day_unique_idx').on(
      table.tripId,
      table.dayIndex
    ),
    check('itinerary_days_positive_idx', sql`day_index > 0`),
    pgPolicy('users_manage_itinerary_days', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`EXISTS (
        SELECT 1 FROM ${trips}
        WHERE ${trips}.id = trip_id
        AND ${trips}.user_id = current_setting('app.current_user_id', true)
      )`,
      withCheck: sql`EXISTS (
        SELECT 1 FROM ${trips}
        WHERE ${trips}.id = trip_id
        AND ${trips}.user_id = current_setting('app.current_user_id', true)
      )`
    })
  ]
).enableRLS()

export type ItineraryDay = InferSelectModel<typeof itineraryDays>

export const tripSources = pgTable(
  'trip_sources',
  {
    id: varchar('id', { length: ID_LENGTH })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tripId: varchar('trip_id', { length: ID_LENGTH })
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    title: text('title'),
    publisher: varchar('publisher', { length: VARCHAR_LENGTH }),
    snippet: text('snippet'),
    retrievedAt: timestamp('retrieved_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  table => [
    index('trip_sources_trip_id_idx').on(table.tripId),
    pgPolicy('users_manage_trip_sources', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`EXISTS (
        SELECT 1 FROM ${trips}
        WHERE ${trips}.id = trip_id
        AND ${trips}.user_id = current_setting('app.current_user_id', true)
      )`,
      withCheck: sql`EXISTS (
        SELECT 1 FROM ${trips}
        WHERE ${trips}.id = trip_id
        AND ${trips}.user_id = current_setting('app.current_user_id', true)
      )`
    })
  ]
).enableRLS()

export type TripSource = InferSelectModel<typeof tripSources>

export const itineraryItems = pgTable(
  'itinerary_items',
  {
    id: varchar('id', { length: ID_LENGTH })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tripId: varchar('trip_id', { length: ID_LENGTH })
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    dayId: varchar('day_id', { length: ID_LENGTH })
      .notNull()
      .references(() => itineraryDays.id, { onDelete: 'cascade' }),
    itemType: varchar('item_type', {
      length: VARCHAR_LENGTH,
      enum: [
        'attraction',
        'restaurant',
        'hotel',
        'transport',
        'activity',
        'other'
      ]
    }).notNull(),
    title: varchar('title', { length: VARCHAR_LENGTH }).notNull(),
    description: text('description'),
    location: text('location'),
    durationMin: integer('duration_min'),
    position: integer('position').notNull(),
    sourceId: varchar('source_id', { length: ID_LENGTH }).references(
      () => tripSources.id,
      { onDelete: 'set null' }
    ),
    metadata: jsonb('metadata')
      .$type<Record<string, any>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  table => [
    index('itinerary_items_trip_id_idx').on(table.tripId),
    index('itinerary_items_day_id_idx').on(table.dayId),
    index('itinerary_items_day_position_idx').on(table.dayId, table.position),
    uniqueIndex('itinerary_items_day_position_unique_idx').on(
      table.dayId,
      table.position
    ),
    check('itinerary_items_positive_position', sql`position > 0`),
    check(
      'itinerary_items_positive_duration',
      sql`(duration_min IS NULL OR duration_min > 0)`
    ),
    pgPolicy('users_manage_itinerary_items', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`EXISTS (
        SELECT 1 FROM ${trips}
        WHERE ${trips}.id = trip_id
        AND ${trips}.user_id = current_setting('app.current_user_id', true)
      )`,
      withCheck: sql`EXISTS (
        SELECT 1 FROM ${trips}
        WHERE ${trips}.id = trip_id
        AND ${trips}.user_id = current_setting('app.current_user_id', true)
      )`
    })
  ]
).enableRLS()

export type ItineraryItem = InferSelectModel<typeof itineraryItems>

export const itineraryVersions = pgTable(
  'itinerary_versions',
  {
    id: varchar('id', { length: ID_LENGTH })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tripId: varchar('trip_id', { length: ID_LENGTH })
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    baseVersion: integer('base_version').notNull(),
    clientOperationId: varchar('client_operation_id', {
      length: ID_LENGTH
    }).notNull(),
    summary: text('summary'),
    snapshot: jsonb('snapshot').$type<Record<string, any>>().notNull(),
    createdBy: varchar('created_by', { length: USER_ID_LENGTH }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  table => [
    index('itinerary_versions_trip_id_idx').on(table.tripId),
    index('itinerary_versions_trip_version_idx').on(
      table.tripId,
      table.versionNumber
    ),
    index('itinerary_versions_trip_op_idx').on(
      table.tripId,
      table.clientOperationId
    ),
    uniqueIndex('itinerary_versions_trip_version_unique_idx').on(
      table.tripId,
      table.versionNumber
    ),
    uniqueIndex('itinerary_versions_trip_operation_unique_idx').on(
      table.tripId,
      table.clientOperationId
    ),
    pgPolicy('users_manage_itinerary_versions', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`EXISTS (
        SELECT 1 FROM ${trips}
        WHERE ${trips}.id = trip_id
        AND ${trips}.user_id = current_setting('app.current_user_id', true)
      )`,
      withCheck: sql`EXISTS (
        SELECT 1 FROM ${trips}
        WHERE ${trips}.id = trip_id
        AND ${trips}.user_id = current_setting('app.current_user_id', true)
      )`
    })
  ]
).enableRLS()

export type ItineraryVersion = InferSelectModel<typeof itineraryVersions>

export const tripActionLogs = pgTable(
  'trip_action_logs',
  {
    id: varchar('id', { length: ID_LENGTH })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tripId: varchar('trip_id', { length: ID_LENGTH })
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    versionId: varchar('version_id', { length: ID_LENGTH }).references(
      () => itineraryVersions.id,
      { onDelete: 'set null' }
    ),
    clientOperationId: varchar('client_operation_id', {
      length: ID_LENGTH
    }).notNull(),
    actionType: varchar('action_type', { length: VARCHAR_LENGTH }).notNull(),
    payload: jsonb('payload').$type<Record<string, any>>().notNull(),
    status: varchar('status', {
      length: VARCHAR_LENGTH,
      enum: ['pending', 'applied', 'failed']
    })
      .notNull()
      .default('applied'),
    errorText: text('error_text'),
    createdBy: varchar('created_by', { length: USER_ID_LENGTH }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  table => [
    index('trip_action_logs_trip_id_idx').on(table.tripId),
    index('trip_action_logs_trip_op_idx').on(
      table.tripId,
      table.clientOperationId
    ),
    index('trip_action_logs_trip_version_idx').on(
      table.tripId,
      table.versionId
    ),
    pgPolicy('users_manage_trip_action_logs', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`EXISTS (
        SELECT 1 FROM ${trips}
        WHERE ${trips}.id = trip_id
        AND ${trips}.user_id = current_setting('app.current_user_id', true)
      )`,
      withCheck: sql`EXISTS (
        SELECT 1 FROM ${trips}
        WHERE ${trips}.id = trip_id
        AND ${trips}.user_id = current_setting('app.current_user_id', true)
      )`
    })
  ]
).enableRLS()

export type TripActionLog = InferSelectModel<typeof tripActionLogs>

// Feedback table
export const feedback = pgTable(
  'feedback',
  {
    id: varchar('id', { length: ID_LENGTH })
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: varchar('user_id', { length: USER_ID_LENGTH }),
    sentiment: varchar('sentiment', {
      length: VARCHAR_LENGTH,
      enum: ['positive', 'neutral', 'negative']
    }).notNull(),
    message: text('message').notNull(),
    pageUrl: text('page_url').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  table => [
    // Indexes
    index('feedback_user_id_idx').on(table.userId),
    index('feedback_created_at_idx').on(table.createdAt),

    // RLS Policies - Allow reads (for INSERT ... RETURNING and app visibility)
    pgPolicy('feedback_select_policy', {
      as: 'permissive',
      for: 'select',
      to: 'public',
      using: sql`true`
    }),

    // RLS Policy - Allow anyone to insert feedback
    pgPolicy('anyone_can_insert_feedback', {
      for: 'insert',
      to: 'public',
      withCheck: sql`true`
    })
  ]
).enableRLS()

export type Feedback = InferSelectModel<typeof feedback>
