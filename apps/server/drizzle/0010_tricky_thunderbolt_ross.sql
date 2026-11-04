ALTER TABLE "files" ADD COLUMN "alt_text" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "caption" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "subtitle" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "seo_keywords" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "cta_label" text;