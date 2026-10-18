CREATE TABLE "event_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"data_base64" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_assets_kind_chk" CHECK ("event_assets"."kind" IN ('logo','flyer'))
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "accent_color" varchar(7);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "welcome_text" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "program" text;--> statement-breakpoint
ALTER TABLE "event_assets" ADD CONSTRAINT "event_assets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_assets_event_kind_uq" ON "event_assets" USING btree ("event_id","kind");