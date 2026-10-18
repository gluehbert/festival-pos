ALTER TABLE "staff" DROP CONSTRAINT "staff_role_chk";--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_role_chk" CHECK ("staff"."role" IN ('admin','lead','waiter','kitchen','bar'));