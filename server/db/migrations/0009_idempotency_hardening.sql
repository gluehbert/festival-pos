ALTER TABLE "payments" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE INDEX "orders_guest_session_idx" ON "orders" USING btree ("guest_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_staff_idem_uq" ON "orders" USING btree ("event_id","created_by_staff","idempotency_key") WHERE "orders"."idempotency_key" IS NOT NULL AND "orders"."guest_session_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idem_uq" ON "payments" USING btree ("event_id","staff_id","idempotency_key") WHERE "payments"."idempotency_key" IS NOT NULL;