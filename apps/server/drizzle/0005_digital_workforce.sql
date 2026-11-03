CREATE TABLE "fte_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" integer NOT NULL,
	"worker_key" text NOT NULL,
	"task" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"signature" text NOT NULL,
	"overruled_by" text,
	"overrule_note" text,
	"overruled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fte_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fte_reports_day_unique" UNIQUE("day")
);
--> statement-breakpoint
CREATE TABLE "fte_workers" (
	"key" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"levels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"daily_tokens" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_messages" ADD COLUMN "reply" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "slip_reference" text;--> statement-breakpoint
ALTER TABLE "fte_runs" ADD COLUMN "worker_key" text DEFAULT 'sales' NOT NULL;--> statement-breakpoint
ALTER TABLE "fte_decisions" ADD CONSTRAINT "fte_decisions_overruled_by_users_id_fk" FOREIGN KEY ("overruled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fte_workers" ADD CONSTRAINT "fte_workers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "decisions_seq_uq" ON "fte_decisions" USING btree ("seq");