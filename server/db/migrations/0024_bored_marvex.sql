CREATE TABLE "staff_join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "staff_join_requests_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "staff_join_requests_status_chk" CHECK ("staff_join_requests"."status" IN ('pending','approved','rejected'))
);
--> statement-breakpoint
ALTER TABLE "staff" DROP CONSTRAINT "staff_username_unique";--> statement-breakpoint
ALTER TABLE "staff" DROP CONSTRAINT "staff_secret_chk";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "join_code" varchar(32);--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "staff_join_requests" ADD CONSTRAINT "staff_join_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_join_requests" ADD CONSTRAINT "staff_join_requests_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_join_requests_event_status_idx" ON "staff_join_requests" USING btree ("event_id","status");--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_username_uq" ON "staff" USING btree ("username") WHERE "staff"."event_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_event_username_uq" ON "staff" USING btree ("event_id","username") WHERE "staff"."event_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_join_code_unique" UNIQUE("join_code");--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_event_role_chk" CHECK ("staff"."event_id" IS NULL OR "staff"."role" <> 'admin');--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_secret_chk" CHECK ("staff"."password_hash" IS NOT NULL OR "staff"."pin_hash" IS NOT NULL OR "staff"."event_id" IS NOT NULL);