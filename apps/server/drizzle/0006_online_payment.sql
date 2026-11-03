ALTER TABLE "web_orders" ADD COLUMN "payment_ref" text;--> statement-breakpoint
ALTER TABLE "web_orders" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "web_orders" ADD COLUMN "invoice_id" text;