CREATE TABLE "table_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"table_no" integer NOT NULL,
	"staff_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_chk";--> statement-breakpoint
ALTER TABLE "table_assignments" ADD CONSTRAINT "table_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_assignments" ADD CONSTRAINT "table_assignments_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "table_assignments_event_table_uq" ON "table_assignments" USING btree ("event_id","table_no");--> statement-breakpoint
CREATE INDEX "table_assignments_staff_idx" ON "table_assignments" USING btree ("staff_id");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_chk" CHECK ("audit_log"."action" IN ('payment','void','event_activate','menu_availability','staff_create','staff_update','refund','event_trial','cash_open','cash_close','deposit_return','staff_meal','price_rule_create','price_rule_update','price_rule_delete','event_trial_data_delete','event_create','event_update','menu_item_create','menu_item_update','menu_import','asset_upload','asset_delete','table_takeover','table_release'));