ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_chk";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ends_on" date;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "trial_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "is_trial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "is_trial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_chk" CHECK ("audit_log"."action" IN ('payment','void','event_activate','menu_availability','staff_create','staff_update','refund','event_trial'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_dates_chk" CHECK ("events"."ends_on" IS NULL OR "events"."starts_on" IS NULL OR "events"."ends_on" >= "events"."starts_on");