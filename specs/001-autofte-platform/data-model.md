# Data Model — AutoFTE (Postgres, Drizzle pg-core)

Conventions:
- **Keys**: ids are `text` (random 12-byte hex). Timestamps are `timestamptz`.
- **Money**: stored as `numeric(12,2)` (USD) or `bigint` (JPY).
- **Status columns**: `text` with an app-level enum (zod), checked in services.

## Platform & access
| Table | Key fields | Notes |
|---|---|---|
| users | id, kind(staff/customer/visitor/fte), name, email (unique when present), phone, password_hash, role_id, is_active, language, country_code, city, address, company, avatar_file_id, last_seen_at, created_at | One table for everyone; Sora is `kind=fte` |
| roles | id, slug (unique), name, is_system | Default roles: admin, manager, supervisor, agent, accounts, customer, fte |
| permissions | key (pk), area, label | e.g. `crm.invoices.approve`, `auction.bids.view_all`, `website.customers.view_all` |
| role_permissions | role_id, permission_key | Editable in Admin |
| sessions | id (sha256 of token), user_id, expires_at, created_at, user_agent | Cookie holds the token |
| settings | key (pk), value jsonb, updated_at | Site settings, pricing policy, envelope, demo clock |
| audit_log | id, actor_user_id, actor_kind(human/fte/system), action, entity, entity_id, summary, data jsonb, conversation_id, fte_run_id, created_at | Written in the same transaction as the change |
| notifications | id, user_id, type, title, body, link, data jsonb, read_at, created_at | Bell + SSE |
| files | id, kind, mime, size, path, original_name, owner_user_id, created_at | Bytes in `.data/files`; served via access checks |
| events | id, type, payload jsonb, due_at, status(pending/done/failed/skipped), attempts, last_error, created_at, processed_at | Outbox for Sora's proactive work |
| mcp_tokens | id, name, token_hash, user_id, created_at, revoked_at | Bearer tokens for `/mcp` |

## Website
| Table | Key fields |
|---|---|
| brands | id, name, slug, logo_url, sort |
| vehicle_models | id, brand_id, name, slug |
| vehicles | id, stock_no (unique), ref_no, slug (unique), title, brand_id, model_id, model_code, chassis_no, year, month, price_usd, discount_price_usd, cost_jpy (internal), mileage_km, fuel, transmission, body_type, engine_cc, color, steering, drive, doors, seats, length_mm, width_mm, height_mm, m3, location, origin_country, features text[], tags text[], home_sections text[], featured, status(available/reserved/sold), published, sort, short_desc, description, video_url, seo_title, seo_description, seo_keywords, created_at, updated_at |
| vehicle_images | id, vehicle_id, url, sort |
| pages | id, slug, title, body, seo_title, seo_description, published |
| blog_posts | id, slug, title, excerpt, body, cover_url, published_at, seo_title, seo_description |
| services | id, title, body, icon, sort |
| faqs | id, question, answer, category, sort |
| testimonials | id, name, country, text, rating, video_url, sort |
| home_sections | id, key, title, subtitle, data jsonb, sort, enabled |
| partners | id, name, logo_url, url, sort |
| locations | id, name, address, phone, email, map_url, sort |
| contact_messages | id, name, email, phone, subject, message, handled, created_at |
| cart_items | user_id, vehicle_id, created_at (pk user_id+vehicle_id) |
| wishlist_items | user_id, vehicle_id, created_at |
| web_orders | id, order_no, user_id, status(pending/confirmed/cancelled/completed), payment_method, total_usd, notes, created_at |
| web_order_items | id, order_id, vehicle_id, title, price_usd |

## CRM
| Table | Key fields | Notes |
|---|---|---|
| countries | code (pk), name, region, inspection_required, inspection_fee_usd, timezone | Public facts + demo fees |
| ports | id, country_code, name, freight_usd_per_m3, transit_days | Demo freight |
| leads | id, customer_name, contact_person, address, phone, email, country_code, port_id, status(new/in_progress/invoice_requested/invoiced/closed), is_customer, owner_user_id, customer_user_id, source(manual/excel/web_chat/app_chat/fte), duplicate_of, created_by, created_at, updated_at | Agents see own only |
| lead_notes | id, lead_id, author_user_id, body, created_at | Append-only |
| invoices | id, number, lead_id, requested_by, approved_by, status(pending/approved/rejected/sent), consignee_name/address/phone/email/country_code/port_id, notify_party, salesperson, m3_rate, exchange_rate, total_push_usd, total_cnf_usd, advance_percent (default 50), discount_usd, rejection_note, final_pdf_file_id, quote_id, created_at, approved_at, sent_at | Duplicate-request guard: one pending per lead |
| invoice_vehicles | id, invoice_id, position, vehicle_id, auction_lot_id, unit_label, year, color, chassis_no, engine, transmission, fuel, push_usd, cnf_usd | ≤ 50 per invoice |
| payments | id, invoice_id, selling_price_usd, amount_usd, received_date, fx_rate, yen_amount, receipt_file_id, recorded_by, created_at | |
| units | id, invoice_id, invoice_vehicle_id, make, model, year, color, chassis, engine_cc, drive, fuel, mileage_km, transmission, steering, doors, seats, location, created_by, created_at | |
| unit_financials | unit_id (pk), lot_no, auction_name, buying_jpy, domestic_jpy, storage_jpy, inspect_jpy, repairs_jpy, misc_jpy, agency_fee_jpy, freight_jpy, dhl_jpy, auction_fee_jpy, parts_jpy, vanning_jpy, doc_jpy, fx_rate, selling_price_usd, updated_at | Profit computed; blank FX = "needs FX" |
| unit_documents | id, unit_id, folder (6 fixed), file_id, created_at | |
| vehicle_progress | id, invoice_vehicle_id, stage, stage_date, note, created_by, created_at | Append-only |
| quotes | id, conversation_id, lead_id, vehicle_id, auction_lot_id, port_id, lines jsonb, total_cnf_usd, discount_pct, fx_rate, created_by, created_at, expires_at | Produced by `quote_cnf` |

## Auction
| Table | Key fields |
|---|---|
| auction_halls | id, name, code, region |
| auction_lots | id, hall_id, sale_date, lot_no, make, model, model_code, body_type, grade, interior_grade, year, color, transmission, fuel, drive, mileage_km, engine_cc, equipment, start_price_jpy, avg_price_jpy, status(upcoming/sold/unsold/withdrawn), result_price_jpy, high_bid_jpy, photo_count, damage jsonb, created_at |
| auction_bids | id, lot_id, user_id, amount_jpy, status(active/won/lost/cancelled), note, created_at |
| auction_orders | id, order_no (ORD-YYYY-XXXXXX), lot_id, user_id, status(pending/approved/confirmed/paid/shipped/delivered/cancelled), price_jpy, created_at, updated_at |
| auction_enquiries | id, enq_no (INQ-YYYY-XXXXXX), lot_id, user_id, message, reply, replied_by, status(open/answered/closed), created_at, replied_at |
| auction_results | id, hall_id, sale_date, lot_no, make, model, model_code, year, engine_cc, mileage_km, grade, color, transmission, start_price_jpy, final_price_jpy, sold |
| sheet_readings | lot_id (pk), result jsonb, model, created_at |

## Chat
| Table | Key fields |
|---|---|
| chat_conversations | id, kind(customer/staff_dm/group), title, customer_user_id, holder(fte/human), assigned_user_id, fte_summary, last_message_at, created_at |
| chat_members | conversation_id, user_id, role(member/admin), last_read_at, joined_at |
| chat_messages | id, conversation_id, sender_user_id, kind(text/image/voice/call/system/card), body, file_ids jsonb, meta jsonb, created_at |
| chat_calls | id, conversation_id, caller_id, callee_id, media(audio/video), status(ringing/answered/declined/missed/busy/ended/cancelled), started_at, answered_at, ended_at |

## Sora (FTE)
| Table | Key fields |
|---|---|
| fte_runs | id, trigger(message/event/approval/eval), conversation_id, event_id, status(ok/error/fallback/handover), steps, provider, model, prompt_tokens, completion_tokens, latency_ms, reasoning_excerpt, error, started_at, finished_at |
| approvals | id, kind(discount/bid/other), status(pending/approved/rejected/expired), requested_by, conversation_id, lead_id, lot_id, quote_id, payload jsonb, reason, decided_by, decided_at, decision_note, created_at |
| buyer_requests | id, customer_user_id, conversation_id, criteria jsonb, active, last_notified_at, created_at |
| eval_runs | id, started_at, finished_at, total, passed, provider, model, results jsonb |

## State machines
- **Lead**: new → in_progress → invoice_requested → invoiced → closed. A rejected invoice moves the lead back to in_progress.
- **Invoice**: pending → approved → sent; pending → rejected (re-request allowed). Deleting an invoice moves the lead
  back to in_progress.
- **Auction order**: pending → approved → confirmed → paid → shipped → delivered (or cancelled).
- **Vehicle progress**: Not started → Vehicle Reserved → Invoice Generated → First Payment Received → Car Booked →
  Inspection/Yard → In Yard → Final Payment → Shipped → Delivered to port.
- **Approval**: pending → approved | rejected | expired.
- **Conversation holder**: fte ⇄ human (take over / hand back).
