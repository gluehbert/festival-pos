CREATE TABLE "price_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"weekdays" integer DEFAULT 127 NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"menu_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_rules_kind_chk" CHECK ("price_rules"."kind" IN ('fixed','percent','amount')),
	CONSTRAINT "price_rules_value_chk" CHECK (("price_rules"."kind" = 'fixed' AND "price_rules"."value" >= 0) OR ("price_rules"."kind" = 'percent' AND "price_rules"."value" BETWEEN 1 AND 100) OR ("price_rules"."kind" = 'amount' AND "price_rules"."value" >= 1)),
	CONSTRAINT "price_rules_minutes_chk" CHECK ("price_rules"."start_minute" BETWEEN 0 AND 1439 AND "price_rules"."end_minute" BETWEEN 0 AND 1439),
	CONSTRAINT "price_rules_weekdays_chk" CHECK ("price_rules"."weekdays" BETWEEN 1 AND 127),
	CONSTRAINT "price_rules_dates_chk" CHECK ("price_rules"."valid_to" IS NULL OR "price_rules"."valid_from" IS NULL OR "price_rules"."valid_to" >= "price_rules"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_chk";--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "price_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "price_rule_name" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "regular_price_cents" integer;--> statement-breakpoint
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_rules_event_idx" ON "price_rules" USING btree ("event_id");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_chk" CHECK ("audit_log"."action" IN ('payment','void','event_activate','menu_availability','staff_create','staff_update','refund','event_trial','cash_open','cash_close','deposit_return','staff_meal','price_rule_create','price_rule_update','price_rule_delete'));