ALTER TABLE "event_assets" DROP CONSTRAINT "event_assets_kind_chk";--> statement-breakpoint
ALTER TABLE "event_assets" ADD COLUMN "fits_dark" boolean;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "theme" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_assets" ADD CONSTRAINT "event_assets_kind_chk" CHECK ("event_assets"."kind" IN ('logo','logo_dark','flyer'));--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_theme_chk" CHECK ("staff"."theme" IN ('system','light','dark'));