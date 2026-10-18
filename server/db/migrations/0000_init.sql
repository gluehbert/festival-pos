CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"staff_id" uuid,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_action_chk" CHECK ("audit_log"."action" IN ('payment','void','event_activate','menu_availability'))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"pin_code" varchar(10) NOT NULL,
	"table_range_from" integer NOT NULL,
	"table_range_to" integer NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	CONSTRAINT "events_pin_code_unique" UNIQUE("pin_code"),
	CONSTRAINT "events_table_range_chk" CHECK ("events"."table_range_from" >= 1 AND "events"."table_range_to" >= "events"."table_range_from")
);
--> statement-breakpoint
CREATE TABLE "guest_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"table_no" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"ip" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name_de" text NOT NULL,
	"name_en" text NOT NULL,
	"price_cents" integer NOT NULL,
	"category" text NOT NULL,
	"station" text NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_price_chk" CHECK ("menu_items"."price_cents" >= 0),
	CONSTRAINT "menu_items_station_chk" CHECK ("menu_items"."station" IN ('kitchen','bar'))
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"station" text NOT NULL,
	"production_status" text DEFAULT 'pending' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"void_reason" text,
	"voided_by_staff" uuid,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_chk" CHECK ("order_items"."quantity" >= 1),
	CONSTRAINT "order_items_price_chk" CHECK ("order_items"."unit_price_cents" >= 0),
	CONSTRAINT "order_items_station_chk" CHECK ("order_items"."station" IN ('kitchen','bar')),
	CONSTRAINT "order_items_prod_status_chk" CHECK ("order_items"."production_status" IN ('pending','in_progress','done','cancelled')),
	CONSTRAINT "order_items_pay_status_chk" CHECK ("order_items"."payment_status" IN ('unpaid','paid'))
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"table_no" integer NOT NULL,
	"guest_session_id" uuid,
	"created_by_staff" uuid,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_origin_chk" CHECK (("orders"."guest_session_id" IS NOT NULL AND "orders"."created_by_staff" IS NULL) OR ("orders"."guest_session_id" IS NULL AND "orders"."created_by_staff" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "payment_items" (
	"payment_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	CONSTRAINT "payment_items_order_item_id_unique" UNIQUE("order_item_id")
);
--> statement-breakpoint
CREATE TABLE "payment_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"table_no" integer NOT NULL,
	"order_id" uuid,
	"staff_id" uuid NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"total_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_total_chk" CHECK ("payments"."total_cents" >= 1)
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text,
	"pin_hash" text,
	"role" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_username_unique" UNIQUE("username"),
	CONSTRAINT "staff_role_chk" CHECK ("staff"."role" IN ('admin','waiter','kitchen','bar')),
	CONSTRAINT "staff_secret_chk" CHECK ("staff"."password_hash" IS NOT NULL OR "staff"."pin_hash" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_voided_by_staff_staff_id_fk" FOREIGN KEY ("voided_by_staff") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_guest_session_id_guest_sessions_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "public"."guest_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_staff_staff_id_fk" FOREIGN KEY ("created_by_staff") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_locks" ADD CONSTRAINT "payment_locks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_locks" ADD CONSTRAINT "payment_locks_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_action_created_idx" ON "audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_staff_idx" ON "audit_log" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_only_one_active" ON "events" USING btree ("is_active") WHERE "events"."is_active" = true;--> statement-breakpoint
CREATE INDEX "guest_sessions_event_table_idx" ON "guest_sessions" USING btree ("event_id","table_no");--> statement-breakpoint
CREATE INDEX "guest_sessions_expires_idx" ON "guest_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "login_attempts_username_created_idx" ON "login_attempts" USING btree ("username","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_created_idx" ON "login_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "menu_items_event_sort_idx" ON "menu_items" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE INDEX "menu_items_event_avail_idx" ON "menu_items" USING btree ("event_id","is_available");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_station_status_idx" ON "order_items" USING btree ("station","production_status");--> statement-breakpoint
CREATE INDEX "order_items_payment_status_idx" ON "order_items" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "orders_event_table_idx" ON "orders" USING btree ("event_id","table_no");--> statement-breakpoint
CREATE INDEX "orders_event_created_idx" ON "orders" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idem_uq" ON "orders" USING btree ("event_id","guest_session_id","idempotency_key") WHERE "orders"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payment_items_payment_idx" ON "payment_items" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_locks_active_uq" ON "payment_locks" USING btree ("event_id","table_no",COALESCE("order_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "payment_locks_expires_idx" ON "payment_locks" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "payments_event_created_idx" ON "payments" USING btree ("event_id","created_at");