CREATE TABLE "event_setup" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"confirmed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"qr_downloaded_at" timestamp with time zone,
	"trial_held_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "event_setup" ADD CONSTRAINT "event_setup_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;