CREATE TABLE "station_lane_settings" (
	"event_id" uuid NOT NULL,
	"station" text NOT NULL,
	"lane_count" integer NOT NULL,
	"paused_mask" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "station_lane_settings_event_id_station_pk" PRIMARY KEY("event_id","station"),
	CONSTRAINT "station_lane_settings_count_chk" CHECK ("station_lane_settings"."lane_count" BETWEEN 1 AND 4),
	CONSTRAINT "station_lane_settings_station_chk" CHECK ("station_lane_settings"."station" IN ('kitchen','bar','cafe'))
);
--> statement-breakpoint
ALTER TABLE "station_buzzers" ADD COLUMN "color" varchar(16);--> statement-breakpoint
ALTER TABLE "station_lane_settings" ADD CONSTRAINT "station_lane_settings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;