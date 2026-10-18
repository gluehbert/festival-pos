CREATE TABLE "guest_scans" (
	"event_id" uuid NOT NULL,
	"table_no" integer NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "guest_scans_event_id_table_no_pk" PRIMARY KEY("event_id","table_no")
);
--> statement-breakpoint
ALTER TABLE "guest_scans" ADD CONSTRAINT "guest_scans_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;