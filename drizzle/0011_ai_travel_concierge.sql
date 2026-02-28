CREATE TABLE "trips" (
  "id" varchar(191) PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "user_id" varchar(255) NOT NULL,
  "title" varchar(256) NOT NULL,
  "origin" varchar(256),
  "destination" varchar(256),
  "start_date" varchar(256),
  "end_date" varchar(256),
  "budget_min_cents" integer,
  "budget_max_cents" integer,
  "currency" varchar(3),
  "trip_state" varchar(256) DEFAULT 'DISCOVERY' NOT NULL,
  "preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_version" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "trips_budget_order_check" CHECK (
    budget_min_cents IS NULL
    OR budget_max_cents IS NULL
    OR budget_max_cents >= budget_min_cents
  )
);

ALTER TABLE "trips" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_trips" ON "trips"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE INDEX "trips_user_id_idx" ON "trips" USING btree ("user_id");
CREATE INDEX "trips_user_id_created_at_idx" ON "trips" USING btree ("user_id", "created_at" DESC);
CREATE INDEX "trips_user_state_idx" ON "trips" USING btree ("user_id", "trip_state");

CREATE TABLE "itinerary_days" (
  "id" varchar(191) PRIMARY KEY NOT NULL,
  "trip_id" varchar(191) NOT NULL REFERENCES "trips"("id") ON DELETE cascade,
  "day_index" integer NOT NULL,
  "date" varchar(256),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "itinerary_days_positive_idx" CHECK (day_index > 0)
);

ALTER TABLE "itinerary_days" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_itinerary_days" ON "itinerary_days"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM "trips"
      WHERE "trips"."id" = trip_id
      AND "trips"."user_id" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "trips"
      WHERE "trips"."id" = trip_id
      AND "trips"."user_id" = current_setting('app.current_user_id', true)
    )
  );

CREATE INDEX "itinerary_days_trip_id_idx" ON "itinerary_days" USING btree ("trip_id");
CREATE INDEX "itinerary_days_trip_day_idx" ON "itinerary_days" USING btree ("trip_id", "day_index");
CREATE UNIQUE INDEX "itinerary_days_trip_day_unique_idx" ON "itinerary_days" USING btree ("trip_id", "day_index");

CREATE TABLE "trip_sources" (
  "id" varchar(191) PRIMARY KEY NOT NULL,
  "trip_id" varchar(191) NOT NULL REFERENCES "trips"("id") ON DELETE cascade,
  "url" text NOT NULL,
  "title" text,
  "publisher" varchar(256),
  "snippet" text,
  "retrieved_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "trip_sources" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_trip_sources" ON "trip_sources"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM "trips"
      WHERE "trips"."id" = trip_id
      AND "trips"."user_id" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "trips"
      WHERE "trips"."id" = trip_id
      AND "trips"."user_id" = current_setting('app.current_user_id', true)
    )
  );

CREATE INDEX "trip_sources_trip_id_idx" ON "trip_sources" USING btree ("trip_id");

CREATE TABLE "itinerary_items" (
  "id" varchar(191) PRIMARY KEY NOT NULL,
  "trip_id" varchar(191) NOT NULL REFERENCES "trips"("id") ON DELETE cascade,
  "day_id" varchar(191) NOT NULL REFERENCES "itinerary_days"("id") ON DELETE cascade,
  "item_type" varchar(256) NOT NULL,
  "title" varchar(256) NOT NULL,
  "description" text,
  "location" text,
  "duration_min" integer,
  "position" integer NOT NULL,
  "source_id" varchar(191) REFERENCES "trip_sources"("id") ON DELETE set null,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "itinerary_items_positive_position" CHECK (position > 0),
  CONSTRAINT "itinerary_items_positive_duration" CHECK (duration_min IS NULL OR duration_min > 0)
);

ALTER TABLE "itinerary_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_itinerary_items" ON "itinerary_items"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM "trips"
      WHERE "trips"."id" = trip_id
      AND "trips"."user_id" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "trips"
      WHERE "trips"."id" = trip_id
      AND "trips"."user_id" = current_setting('app.current_user_id', true)
    )
  );

CREATE INDEX "itinerary_items_trip_id_idx" ON "itinerary_items" USING btree ("trip_id");
CREATE INDEX "itinerary_items_day_id_idx" ON "itinerary_items" USING btree ("day_id");
CREATE INDEX "itinerary_items_day_position_idx" ON "itinerary_items" USING btree ("day_id", "position");
CREATE UNIQUE INDEX "itinerary_items_day_position_unique_idx" ON "itinerary_items" USING btree ("day_id", "position");

CREATE TABLE "itinerary_versions" (
  "id" varchar(191) PRIMARY KEY NOT NULL,
  "trip_id" varchar(191) NOT NULL REFERENCES "trips"("id") ON DELETE cascade,
  "version_number" integer NOT NULL,
  "base_version" integer NOT NULL,
  "client_operation_id" varchar(191) NOT NULL,
  "summary" text,
  "snapshot" jsonb NOT NULL,
  "created_by" varchar(255) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "itinerary_versions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_itinerary_versions" ON "itinerary_versions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM "trips"
      WHERE "trips"."id" = trip_id
      AND "trips"."user_id" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "trips"
      WHERE "trips"."id" = trip_id
      AND "trips"."user_id" = current_setting('app.current_user_id', true)
    )
  );

CREATE INDEX "itinerary_versions_trip_id_idx" ON "itinerary_versions" USING btree ("trip_id");
CREATE INDEX "itinerary_versions_trip_version_idx" ON "itinerary_versions" USING btree ("trip_id", "version_number");
CREATE INDEX "itinerary_versions_trip_op_idx" ON "itinerary_versions" USING btree ("trip_id", "client_operation_id");
CREATE UNIQUE INDEX "itinerary_versions_trip_version_unique_idx" ON "itinerary_versions" USING btree ("trip_id", "version_number");
CREATE UNIQUE INDEX "itinerary_versions_trip_operation_unique_idx" ON "itinerary_versions" USING btree ("trip_id", "client_operation_id");

CREATE TABLE "trip_action_logs" (
  "id" varchar(191) PRIMARY KEY NOT NULL,
  "trip_id" varchar(191) NOT NULL REFERENCES "trips"("id") ON DELETE cascade,
  "version_id" varchar(191) REFERENCES "itinerary_versions"("id") ON DELETE set null,
  "client_operation_id" varchar(191) NOT NULL,
  "action_type" varchar(256) NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar(256) DEFAULT 'applied' NOT NULL,
  "error_text" text,
  "created_by" varchar(255) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "trip_action_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_trip_action_logs" ON "trip_action_logs"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM "trips"
      WHERE "trips"."id" = trip_id
      AND "trips"."user_id" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "trips"
      WHERE "trips"."id" = trip_id
      AND "trips"."user_id" = current_setting('app.current_user_id', true)
    )
  );

CREATE INDEX "trip_action_logs_trip_id_idx" ON "trip_action_logs" USING btree ("trip_id");
CREATE INDEX "trip_action_logs_trip_op_idx" ON "trip_action_logs" USING btree ("trip_id", "client_operation_id");
CREATE INDEX "trip_action_logs_trip_version_idx" ON "trip_action_logs" USING btree ("trip_id", "version_id");
