CREATE TABLE "waiter_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"table_no" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" uuid,
	CONSTRAINT "waiter_calls_reason_chk" CHECK ("waiter_calls"."reason" IN ('pay','order','question'))
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "waiter_calls_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_acknowledged_by_staff_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waiter_calls_open_uq" ON "waiter_calls" USING btree ("event_id","table_no") WHERE "waiter_calls"."acknowledged_at" IS NULL;--> statement-breakpoint
CREATE INDEX "waiter_calls_event_created_idx" ON "waiter_calls" USING btree ("event_id","created_at");