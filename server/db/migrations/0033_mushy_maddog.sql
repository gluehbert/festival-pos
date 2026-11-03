CREATE TABLE "station_buzzers" (
	"event_id" uuid NOT NULL,
	"station" text NOT NULL,
	"lane" integer NOT NULL,
	"key" varchar(32) NOT NULL,
	CONSTRAINT "station_buzzers_event_id_station_lane_pk" PRIMARY KEY("event_id","station","lane"),
	CONSTRAINT "station_buzzers_lane_chk" CHECK ("station_buzzers"."lane" BETWEEN 1 AND 4),
	CONSTRAINT "station_buzzers_station_chk" CHECK ("station_buzzers"."station" IN ('kitchen','bar'))
);
--> statement-breakpoint
ALTER TABLE "production_lanes" DROP CONSTRAINT "production_lanes_lane_chk";--> statement-breakpoint
ALTER TABLE "station_buzzers" ADD CONSTRAINT "station_buzzers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "station_buzzers_key_uq" ON "station_buzzers" USING btree ("event_id","station","key");--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "buzzer_key";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "buzzer_key_2";--> statement-breakpoint
ALTER TABLE "production_lanes" ADD CONSTRAINT "production_lanes_lane_chk" CHECK ("production_lanes"."lane" BETWEEN 1 AND 4);