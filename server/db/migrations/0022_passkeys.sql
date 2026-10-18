CREATE TABLE "staff_passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "staff_passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "webauthn_challenges" (
	"challenge" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"staff_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "webauthn_challenges_kind_chk" CHECK ("webauthn_challenges"."kind" IN ('register','login'))
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_chk";--> statement-breakpoint
ALTER TABLE "staff_passkeys" ADD CONSTRAINT "staff_passkeys_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_passkeys_staff_idx" ON "staff_passkeys" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "webauthn_challenges_expires_idx" ON "webauthn_challenges" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_chk" CHECK ("audit_log"."action" IN ('payment','void','event_activate','menu_availability','staff_create','staff_update','refund','event_trial','cash_open','cash_close','deposit_return','staff_meal','price_rule_create','price_rule_update','price_rule_delete','event_trial_data_delete','event_create','event_update','menu_item_create','menu_item_update','menu_import','asset_upload','asset_delete','table_takeover','table_release','passkey_add','passkey_remove'));