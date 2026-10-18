CREATE TABLE "cash_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"opening_cents" integer NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"expected_cents" integer,
	"counted_cents" integer,
	"note" text,
	CONSTRAINT "cash_sessions_opening_chk" CHECK ("cash_sessions"."opening_cents" >= 0),
	CONSTRAINT "cash_sessions_counted_chk" CHECK ("cash_sessions"."counted_cents" IS NULL OR "cash_sessions"."counted_cents" >= 0),
	CONSTRAINT "cash_sessions_closed_chk" CHECK (("cash_sessions"."closed_at" IS NULL) = ("cash_sessions"."counted_cents" IS NULL) AND ("cash_sessions"."closed_at" IS NULL) = ("cash_sessions"."expected_cents" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_chk";--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_sessions_event_idx" ON "cash_sessions" USING btree ("event_id","opened_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_sessions_open_uq" ON "cash_sessions" USING btree ("event_id","staff_id") WHERE "cash_sessions"."closed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_chk" CHECK ("audit_log"."action" IN ('payment','void','event_activate','menu_availability','staff_create','staff_update','refund','event_trial','cash_open','cash_close'));