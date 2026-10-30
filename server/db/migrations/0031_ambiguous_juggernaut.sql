CREATE TABLE "production_lanes" (
	"event_id" uuid NOT NULL,
	"station" text NOT NULL,
	"lane" integer NOT NULL,
	"group_key" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_lanes_event_id_station_lane_pk" PRIMARY KEY("event_id","station","lane"),
	CONSTRAINT "production_lanes_lane_chk" CHECK ("production_lanes"."lane" IN (1, 2)),
	CONSTRAINT "production_lanes_station_chk" CHECK ("production_lanes"."station" IN ('kitchen','bar'))
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "buzzer_key_2" varchar(32);--> statement-breakpoint
ALTER TABLE "production_lanes" ADD CONSTRAINT "production_lanes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "production_lanes_group_uq" ON "production_lanes" USING btree ("event_id","station","group_key");