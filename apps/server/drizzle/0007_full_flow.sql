ALTER TABLE "auction_bids" ALTER COLUMN "status" SET DEFAULT 'placed';--> statement-breakpoint
ALTER TABLE "auction_enquiries" ALTER COLUMN "status" SET DEFAULT 'new';--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "spec_rows" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "web_orders" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "web_orders" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "web_orders" ADD COLUMN "port" text;--> statement-breakpoint
ALTER TABLE "web_orders" ADD COLUMN "pay_percent" integer;--> statement-breakpoint
ALTER TABLE "web_orders" ADD COLUMN "pay_now_usd" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "web_orders" ADD COLUMN "paid_usd" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "duplicate_attempt_by" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "duplicate_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "unit_financials" ADD COLUMN "currency" text DEFAULT 'JPY' NOT NULL;--> statement-breakpoint
ALTER TABLE "unit_financials" ADD COLUMN "cost_usd" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "cover_file_id" text;--> statement-breakpoint
ALTER TABLE "auction_bids" ADD COLUMN "bid_no" text;--> statement-breakpoint
ALTER TABLE "auction_bids" ADD COLUMN "over_bid_jpy" integer;--> statement-breakpoint
ALTER TABLE "auction_bids" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD COLUMN "sale_time" text;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD COLUMN "engine_hp" integer;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD COLUMN "model_grade" text;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD COLUMN "feed" text DEFAULT 'A' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_duplicate_attempt_by_users_id_fk" FOREIGN KEY ("duplicate_attempt_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "auction_bids" SET "status" = 'placed' WHERE "status" = 'active';
