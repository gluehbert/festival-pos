CREATE TABLE "deposit_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"unit_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"is_trial" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposit_returns_amount_chk" CHECK ("deposit_returns"."unit_cents" >= 1 AND "deposit_returns"."quantity" >= 1 AND "deposit_returns"."amount_cents" = -("deposit_returns"."unit_cents" * "deposit_returns"."quantity"))
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_chk";--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_price_chk";--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "deposit_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "deposit_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deposit_returns" ADD CONSTRAINT "deposit_returns_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_returns" ADD CONSTRAINT "deposit_returns_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deposit_returns_event_idx" ON "deposit_returns" USING btree ("event_id","created_at");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_chk" CHECK ("audit_log"."action" IN ('payment','void','event_activate','menu_availability','staff_create','staff_update','refund','event_trial','cash_open','cash_close','deposit_return'));--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_deposit_chk" CHECK ("menu_items"."deposit_cents" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_price_chk" CHECK ("order_items"."unit_price_cents" >= 0 AND "order_items"."deposit_cents" >= 0);