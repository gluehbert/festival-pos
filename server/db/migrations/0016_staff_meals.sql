ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_chk";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_kind_chk";--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "list_price_cents" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "staff_meal_reason" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_chk" CHECK ("audit_log"."action" IN ('payment','void','event_activate','menu_availability','staff_create','staff_update','refund','event_trial','cash_open','cash_close','deposit_return','staff_meal'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_staff_meal_chk" CHECK (("orders"."kind" = 'staff_meal') = ("orders"."staff_meal_reason" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_kind_chk" CHECK (("orders"."kind" = 'guest' AND "orders"."guest_session_id" IS NOT NULL) OR ("orders"."kind" IN ('staff_table','walkin','staff_meal') AND "orders"."created_by_staff" IS NOT NULL));