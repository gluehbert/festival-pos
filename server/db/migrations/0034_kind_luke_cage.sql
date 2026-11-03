ALTER TABLE "menu_items" DROP CONSTRAINT "menu_items_station_chk";--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_station_chk";--> statement-breakpoint
ALTER TABLE "staff" DROP CONSTRAINT "staff_role_chk";--> statement-breakpoint
ALTER TABLE "production_lanes" DROP CONSTRAINT "production_lanes_station_chk";--> statement-breakpoint
ALTER TABLE "station_buzzers" DROP CONSTRAINT "station_buzzers_station_chk";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cafe_closed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_station_chk" CHECK ("menu_items"."station" IN ('kitchen','bar','cafe'));--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_station_chk" CHECK ("order_items"."station" IN ('kitchen','bar','cafe'));--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_role_chk" CHECK ("staff"."role" IN ('admin','lead','waiter','kitchen','bar','cafe'));--> statement-breakpoint
ALTER TABLE "production_lanes" ADD CONSTRAINT "production_lanes_station_chk" CHECK ("production_lanes"."station" IN ('kitchen','bar','cafe'));--> statement-breakpoint
ALTER TABLE "station_buzzers" ADD CONSTRAINT "station_buzzers_station_chk" CHECK ("station_buzzers"."station" IN ('kitchen','bar','cafe'));