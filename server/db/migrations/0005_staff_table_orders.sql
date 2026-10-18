ALTER TABLE "orders" ADD COLUMN "kind" text DEFAULT 'guest' NOT NULL;--> statement-breakpoint
-- Until now every staff-created order was a walk-in.
UPDATE "orders" SET "kind" = 'walkin' WHERE "created_by_staff" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_kind_chk" CHECK (("orders"."kind" = 'guest' AND "orders"."guest_session_id" IS NOT NULL) OR ("orders"."kind" IN ('staff_table','walkin') AND "orders"."created_by_staff" IS NOT NULL));