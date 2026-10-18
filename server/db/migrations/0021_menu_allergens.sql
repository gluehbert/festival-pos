ALTER TABLE "menu_items" ADD COLUMN "allergens" text[];--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "diet" text;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_diet_chk" CHECK ("menu_items"."diet" IS NULL OR "menu_items"."diet" IN ('vegetarian','vegan'));