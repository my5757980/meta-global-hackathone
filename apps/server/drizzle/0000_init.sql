CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"actor_kind" text NOT NULL,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"summary" text NOT NULL,
	"data" jsonb,
	"conversation_id" text,
	"fte_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"path" text NOT NULL,
	"original_name" text,
	"owner_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "mcp_tokens_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"data" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"area" text NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" text NOT NULL,
	"permission_key" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_key_pk" PRIMARY KEY("role_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"username" text,
	"password_hash" text,
	"role_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"country_code" text,
	"city" text,
	"address" text,
	"company" text,
	"avatar_url" text,
	"title" text,
	"show_in_chat" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"cover_url" text,
	"published_at" timestamp with time zone,
	"seo_title" text,
	"seo_description" text,
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"user_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_user_id_vehicle_id_pk" PRIMARY KEY("user_id","vehicle_id")
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"subject" text,
	"message" text NOT NULL,
	"handled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" text PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "home_sections_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"phone" text,
	"email" text,
	"map_url" text,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"published" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"url" text,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"icon" text,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"text" text NOT NULL,
	"rating" integer DEFAULT 5 NOT NULL,
	"video_url" text,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_images" (
	"id" text PRIMARY KEY NOT NULL,
	"vehicle_id" text NOT NULL,
	"url" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_models" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"stock_no" text NOT NULL,
	"ref_no" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"brand_id" text NOT NULL,
	"model_id" text NOT NULL,
	"model_code" text,
	"chassis_no" text,
	"year" integer NOT NULL,
	"month" integer,
	"price_usd" numeric(12, 2) NOT NULL,
	"discount_price_usd" numeric(12, 2),
	"cost_jpy" integer,
	"mileage_km" integer NOT NULL,
	"fuel" text NOT NULL,
	"transmission" text NOT NULL,
	"body_type" text NOT NULL,
	"engine_cc" integer,
	"color" text NOT NULL,
	"steering" text DEFAULT 'Right' NOT NULL,
	"drive" text DEFAULT '2WD' NOT NULL,
	"doors" integer,
	"seats" integer,
	"length_mm" integer,
	"width_mm" integer,
	"height_mm" integer,
	"m3" numeric(6, 2),
	"location" text DEFAULT 'Yokohama' NOT NULL,
	"origin_country" text DEFAULT 'Japan' NOT NULL,
	"features" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"home_sections" text[] DEFAULT '{}' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"short_desc" text,
	"description" text,
	"video_url" text,
	"seo_title" text,
	"seo_description" text,
	"seo_keywords" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_stockNo_unique" UNIQUE("stock_no"),
	CONSTRAINT "vehicles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "web_order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"vehicle_id" text,
	"title" text NOT NULL,
	"price_usd" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"order_no" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text DEFAULT 'Order request' NOT NULL,
	"total_usd" numeric(12, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "web_orders_orderNo_unique" UNIQUE("order_no")
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"user_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_items_user_id_vehicle_id_pk" PRIMARY KEY("user_id","vehicle_id")
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"inspection_required" boolean DEFAULT false NOT NULL,
	"inspection_fee_usd" numeric(12, 2) DEFAULT 0 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"rhd_allowed" boolean DEFAULT true NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "invoice_vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"position" integer NOT NULL,
	"vehicle_id" text,
	"auction_lot_id" text,
	"unit_label" text NOT NULL,
	"year" integer,
	"color" text,
	"chassis_no" text,
	"engine" text,
	"transmission" text,
	"fuel" text,
	"push_usd" numeric(12, 2) DEFAULT 0 NOT NULL,
	"cnf_usd" numeric(12, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"lead_id" text NOT NULL,
	"requested_by" text,
	"approved_by" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"consignee_name" text NOT NULL,
	"consignee_address" text,
	"consignee_phone" text NOT NULL,
	"consignee_email" text,
	"consignee_country_code" text,
	"consignee_port_id" text,
	"notify_party" text,
	"salesperson" text,
	"m3_rate" numeric(12, 2),
	"exchange_rate" numeric(8, 3),
	"total_push_usd" numeric(12, 2) DEFAULT 0 NOT NULL,
	"total_cnf_usd" numeric(12, 2) DEFAULT 0 NOT NULL,
	"advance_percent" integer DEFAULT 50 NOT NULL,
	"discount_usd" numeric(12, 2) DEFAULT 0 NOT NULL,
	"rejection_note" text,
	"final_pdf_file_id" text,
	"quote_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "lead_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"author_user_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_name" text NOT NULL,
	"contact_person" text NOT NULL,
	"address" text,
	"phone" text NOT NULL,
	"email" text,
	"country_code" text,
	"port_id" text,
	"status" text DEFAULT 'new' NOT NULL,
	"is_customer" boolean DEFAULT false NOT NULL,
	"owner_user_id" text,
	"customer_user_id" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"duplicate_of" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"selling_price_usd" numeric(12, 2),
	"amount_usd" numeric(12, 2) NOT NULL,
	"received_date" date NOT NULL,
	"fx_rate" numeric(8, 3),
	"yen_amount" integer,
	"receipt_file_id" text,
	"recorded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ports" (
	"id" text PRIMARY KEY NOT NULL,
	"country_code" text NOT NULL,
	"name" text NOT NULL,
	"freight_usd_per_m_3" numeric(12, 2) NOT NULL,
	"transit_days" integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text,
	"lead_id" text,
	"vehicle_id" text,
	"auction_lot_id" text,
	"port_id" text,
	"title" text NOT NULL,
	"lines" jsonb NOT NULL,
	"total_cnf_usd" numeric(12, 2) NOT NULL,
	"push_usd" numeric(12, 2) NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
	"fx_jpy_per_usd" numeric(8, 3) NOT NULL,
	"m3" numeric(6, 2),
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "unit_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"folder" text NOT NULL,
	"file_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_financials" (
	"unit_id" text PRIMARY KEY NOT NULL,
	"lot_no" text,
	"auction_name" text,
	"buying_jpy" integer DEFAULT 0 NOT NULL,
	"domestic_jpy" integer DEFAULT 0 NOT NULL,
	"storage_jpy" integer DEFAULT 0 NOT NULL,
	"inspect_jpy" integer DEFAULT 0 NOT NULL,
	"repairs_jpy" integer DEFAULT 0 NOT NULL,
	"misc_jpy" integer DEFAULT 0 NOT NULL,
	"agency_fee_jpy" integer DEFAULT 0 NOT NULL,
	"freight_jpy" integer DEFAULT 0 NOT NULL,
	"dhl_jpy" integer DEFAULT 0 NOT NULL,
	"auction_fee_jpy" integer DEFAULT 0 NOT NULL,
	"parts_jpy" integer DEFAULT 0 NOT NULL,
	"vanning_jpy" integer DEFAULT 0 NOT NULL,
	"doc_jpy" integer DEFAULT 0 NOT NULL,
	"fx_rate" numeric(8, 3),
	"selling_price_usd" numeric(12, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"invoice_vehicle_id" text,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer,
	"color" text,
	"chassis" text,
	"engine_cc" integer,
	"drive" text,
	"fuel" text,
	"mileage_km" integer,
	"transmission" text,
	"steering" text,
	"doors" integer,
	"seats" integer,
	"location" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_vehicle_id" text NOT NULL,
	"stage" text NOT NULL,
	"stage_date" date NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auction_bids" (
	"id" text PRIMARY KEY NOT NULL,
	"lot_id" text NOT NULL,
	"user_id" text NOT NULL,
	"amount_jpy" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auction_enquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"enq_no" text NOT NULL,
	"lot_id" text NOT NULL,
	"user_id" text NOT NULL,
	"message" text NOT NULL,
	"reply" text,
	"replied_by" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replied_at" timestamp with time zone,
	CONSTRAINT "auction_enquiries_enqNo_unique" UNIQUE("enq_no")
);
--> statement-breakpoint
CREATE TABLE "auction_halls" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"region" text NOT NULL,
	CONSTRAINT "auction_halls_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "auction_lots" (
	"id" text PRIMARY KEY NOT NULL,
	"hall_id" text NOT NULL,
	"sale_date" date NOT NULL,
	"lot_no" integer NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"model_code" text NOT NULL,
	"body_type" text NOT NULL,
	"grade" text NOT NULL,
	"interior_grade" text NOT NULL,
	"year" integer NOT NULL,
	"color" text NOT NULL,
	"transmission" text NOT NULL,
	"fuel" text NOT NULL,
	"drive" text NOT NULL,
	"mileage_km" integer NOT NULL,
	"engine_cc" integer NOT NULL,
	"equipment" text DEFAULT '' NOT NULL,
	"start_price_jpy" integer NOT NULL,
	"avg_price_jpy" integer,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"result_price_jpy" integer,
	"high_bid_jpy" integer,
	"photo_count" integer DEFAULT 6 NOT NULL,
	"damage" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sheet_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auction_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"order_no" text NOT NULL,
	"lot_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"price_jpy" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auction_orders_orderNo_unique" UNIQUE("order_no")
);
--> statement-breakpoint
CREATE TABLE "auction_results" (
	"id" text PRIMARY KEY NOT NULL,
	"hall_id" text NOT NULL,
	"sale_date" date NOT NULL,
	"lot_no" integer NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"model_code" text NOT NULL,
	"year" integer NOT NULL,
	"engine_cc" integer NOT NULL,
	"mileage_km" integer NOT NULL,
	"grade" text NOT NULL,
	"color" text NOT NULL,
	"transmission" text NOT NULL,
	"start_price_jpy" integer NOT NULL,
	"final_price_jpy" integer NOT NULL,
	"sold" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sheet_readings" (
	"lot_id" text PRIMARY KEY NOT NULL,
	"result" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"caller_id" text NOT NULL,
	"callee_id" text NOT NULL,
	"media" text DEFAULT 'audio' NOT NULL,
	"status" text DEFAULT 'ringing' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"customer_user_id" text,
	"holder" text DEFAULT 'fte' NOT NULL,
	"assigned_user_id" text,
	"fte_summary" text,
	"channel" text DEFAULT 'web' NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_members" (
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"last_read_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_members_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_user_id" text,
	"kind" text DEFAULT 'text' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" text,
	"conversation_id" text,
	"lead_id" text,
	"lot_id" text,
	"quote_id" text,
	"payload" jsonb NOT NULL,
	"reason" text NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_user_id" text NOT NULL,
	"conversation_id" text,
	"criteria" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"total" integer DEFAULT 0 NOT NULL,
	"passed" integer DEFAULT 0 NOT NULL,
	"provider" text,
	"model" text,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fte_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"conversation_id" text,
	"event_id" text,
	"status" text DEFAULT 'running' NOT NULL,
	"steps" integer DEFAULT 0 NOT NULL,
	"provider" text,
	"model" text,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"first_reply_ms" integer,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasoning_excerpt" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_images" ADD CONSTRAINT "vehicle_images_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_model_id_vehicle_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_order_items" ADD CONSTRAINT "web_order_items_order_id_web_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."web_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_order_items" ADD CONSTRAINT "web_order_items_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_orders" ADD CONSTRAINT "web_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_vehicles" ADD CONSTRAINT "invoice_vehicles_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_vehicles" ADD CONSTRAINT "invoice_vehicles_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_consignee_country_code_countries_code_fk" FOREIGN KEY ("consignee_country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_consignee_port_id_ports_id_fk" FOREIGN KEY ("consignee_port_id") REFERENCES "public"."ports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_final_pdf_file_id_files_id_fk" FOREIGN KEY ("final_pdf_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_port_id_ports_id_fk" FOREIGN KEY ("port_id") REFERENCES "public"."ports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_receipt_file_id_files_id_fk" FOREIGN KEY ("receipt_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ports" ADD CONSTRAINT "ports_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_port_id_ports_id_fk" FOREIGN KEY ("port_id") REFERENCES "public"."ports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_documents" ADD CONSTRAINT "unit_documents_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_documents" ADD CONSTRAINT "unit_documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_financials" ADD CONSTRAINT "unit_financials_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_invoice_vehicle_id_invoice_vehicles_id_fk" FOREIGN KEY ("invoice_vehicle_id") REFERENCES "public"."invoice_vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_progress" ADD CONSTRAINT "vehicle_progress_invoice_vehicle_id_invoice_vehicles_id_fk" FOREIGN KEY ("invoice_vehicle_id") REFERENCES "public"."invoice_vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_progress" ADD CONSTRAINT "vehicle_progress_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_lot_id_auction_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."auction_lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_enquiries" ADD CONSTRAINT "auction_enquiries_lot_id_auction_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."auction_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_enquiries" ADD CONSTRAINT "auction_enquiries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_enquiries" ADD CONSTRAINT "auction_enquiries_replied_by_users_id_fk" FOREIGN KEY ("replied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD CONSTRAINT "auction_lots_hall_id_auction_halls_id_fk" FOREIGN KEY ("hall_id") REFERENCES "public"."auction_halls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_orders" ADD CONSTRAINT "auction_orders_lot_id_auction_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."auction_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_orders" ADD CONSTRAINT "auction_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_results" ADD CONSTRAINT "auction_results_hall_id_auction_halls_id_fk" FOREIGN KEY ("hall_id") REFERENCES "public"."auction_halls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_readings" ADD CONSTRAINT "sheet_readings_lot_id_auction_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."auction_lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_calls" ADD CONSTRAINT "chat_calls_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_calls" ADD CONSTRAINT "chat_calls_caller_id_users_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_calls" ADD CONSTRAINT "chat_calls_callee_id_users_id_fk" FOREIGN KEY ("callee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_requests" ADD CONSTRAINT "buyer_requests_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_conv_idx" ON "audit_log" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "audit_run_idx" ON "audit_log" USING btree ("fte_run_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "events_due_idx" ON "events" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "notif_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uq" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_kind_idx" ON "users" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "vimg_vehicle_idx" ON "vehicle_images" USING btree ("vehicle_id","sort");--> statement-breakpoint
CREATE UNIQUE INDEX "models_brand_slug_uq" ON "vehicle_models" USING btree ("brand_id","slug");--> statement-breakpoint
CREATE INDEX "veh_brand_idx" ON "vehicles" USING btree ("brand_id","model_id");--> statement-breakpoint
CREATE INDEX "veh_price_idx" ON "vehicles" USING btree ("price_usd");--> statement-breakpoint
CREATE INDEX "veh_status_idx" ON "vehicles" USING btree ("status","published");--> statement-breakpoint
CREATE INDEX "invveh_inv_idx" ON "invoice_vehicles" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE INDEX "inv_lead_idx" ON "invoices" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "inv_status_idx" ON "invoices" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "lead_notes_lead_idx" ON "lead_notes" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_owner_idx" ON "leads" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_phone_idx" ON "leads" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "pay_inv_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "ports_country_idx" ON "ports" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "unitdoc_unit_idx" ON "unit_documents" USING btree ("unit_id","folder");--> statement-breakpoint
CREATE INDEX "units_inv_idx" ON "units" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "units_invveh_uq" ON "units" USING btree ("invoice_vehicle_id");--> statement-breakpoint
CREATE INDEX "vprog_iv_idx" ON "vehicle_progress" USING btree ("invoice_vehicle_id","created_at");--> statement-breakpoint
CREATE INDEX "bids_lot_idx" ON "auction_bids" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "bids_user_idx" ON "auction_bids" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lots_identity_uq" ON "auction_lots" USING btree ("sale_date","hall_id","lot_no");--> statement-breakpoint
CREATE INDEX "lots_make_model_idx" ON "auction_lots" USING btree ("make","model","sale_date");--> statement-breakpoint
CREATE INDEX "lots_status_idx" ON "auction_lots" USING btree ("status","sale_date");--> statement-breakpoint
CREATE INDEX "lots_lotno_idx" ON "auction_lots" USING btree ("lot_no");--> statement-breakpoint
CREATE INDEX "lots_modelcode_idx" ON "auction_lots" USING btree ("model_code");--> statement-breakpoint
CREATE UNIQUE INDEX "results_identity_uq" ON "auction_results" USING btree ("sale_date","hall_id","lot_no");--> statement-breakpoint
CREATE INDEX "results_make_model_idx" ON "auction_results" USING btree ("make","model","sale_date");--> statement-breakpoint
CREATE INDEX "calls_conv_idx" ON "chat_calls" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conv_customer_idx" ON "chat_conversations" USING btree ("customer_user_id");--> statement-breakpoint
CREATE INDEX "conv_last_idx" ON "chat_conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "chat_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "msg_conv_idx" ON "chat_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approvals" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "runs_conv_idx" ON "fte_runs" USING btree ("conversation_id","started_at");--> statement-breakpoint
CREATE INDEX "runs_started_idx" ON "fte_runs" USING btree ("started_at");