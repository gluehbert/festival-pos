ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_chk";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_total_chk";--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "name_de" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "name_en" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_chk" CHECK ("audit_log"."action" IN ('payment','void','event_activate','menu_availability','staff_create','staff_update','refund','event_trial','cash_open','cash_close','deposit_return','staff_meal','price_rule_create','price_rule_update','price_rule_delete','event_trial_data_delete','event_create','event_update','menu_item_create','menu_item_update','menu_import','asset_upload','asset_delete'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_total_chk" CHECK ("payments"."total_cents" >= 0);