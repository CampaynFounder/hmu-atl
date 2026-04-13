# Neon Database Schema — All Tables & Columns

**Tables: 53** | **Total columns: 673**

---

### admin_audit_log

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| admin_id | uuid | YES |  |
| action | text | NO |  |
| target_type | text | YES |  |
| target_id | text | YES |  |
| details | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | YES | now() |

### admin_notification_config

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| notification_type | text | NO |  |
| enabled | boolean | YES | true |
| admin_phone | text | YES |  |
| excluded_user_ids | ARRAY | YES | '{}'::text[] |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| signup_after | date | YES |  |
| exclude_before | date | YES |  |

### admin_sms_sent

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| admin_id | uuid | YES |  |
| recipient_id | uuid | YES |  |
| recipient_phone | text | NO |  |
| message | text | NO |  |
| twilio_sid | text | YES |  |
| status | text | YES |  |
| sent_at | timestamp with time zone | YES | now() |

### blocked_users

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| blocker_id | uuid | NO |  |
| blocked_id | uuid | NO |  |
| reason | text | YES |  |
| created_at | timestamp with time zone | YES | now() |

### comments

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | NO |  |
| author_id | uuid | NO |  |
| subject_id | uuid | NO |  |
| content | text | NO |  |
| sentiment_score | numeric(3,2) | YES |  |
| is_visible | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |

### content_prompts

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| created_at | timestamp with time zone | YES | now() |
| created_by | text | NO |  |
| type | text | NO |  |
| inputs | jsonb | NO |  |
| gemini_prompt | text | YES |  |
| timing_sheet | text | YES |  |
| hook_text | text | YES |  |
| trend_context | text | YES |  |
| status | text | YES | 'draft'::text |
| platform | ARRAY | YES |  |
| posted_at | timestamp with time zone | YES |  |
| notes | text | YES |  |

### daily_earnings

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_id | uuid | YES |  |
| earnings_date | date | NO |  |
| week_start_date | date | NO |  |
| gross_earnings | numeric(10,2) | YES | 0 |
| platform_fee_paid | numeric(10,2) | YES | 0 |
| weekly_platform_fee_paid | numeric(10,2) | YES | 0 |
| rides_completed | integer | YES | 0 |
| daily_cap_hit | boolean | YES | false |
| weekly_cap_hit | boolean | YES | false |
| updated_at | timestamp with time zone | YES | now() |

### data_room_access_logs

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| consent_id | uuid | YES |  |
| document_id | uuid | YES |  |
| action | text | NO |  |
| ip_address | text | YES |  |
| accessed_at | timestamp with time zone | YES | now() |

### data_room_consents

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| full_name | text | NO |  |
| email | text | NO |  |
| phone | text | YES |  |
| company | text | YES |  |
| title | text | YES |  |
| ip_address | text | YES |  |
| user_agent | text | YES |  |
| consented_at | timestamp with time zone | YES | now() |
| access_code_used | text | NO |  |
| nda_version | text | NO | '1.0'::text |
| revoked_at | timestamp with time zone | YES |  |

### data_room_documents

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO |  |
| description | text | YES |  |
| category | text | NO |  |
| file_key | text | NO |  |
| file_name | text | NO |  |
| file_type | text | NO |  |
| file_size_bytes | bigint | NO |  |
| version | integer | NO | 1 |
| is_active | boolean | YES | true |
| uploaded_by | text | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### disputes

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | NO |  |
| filed_by | uuid | NO |  |
| reason | text | NO |  |
| status | character varying(20) | YES | 'open'::character varying |
| ably_history_url | text | YES |  |
| resolved_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | YES | now() |

### draft_bookings

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| rider_id | uuid | NO |  |
| driver_handle | text | NO |  |
| booking_data | jsonb | NO |  |
| expires_at | timestamp with time zone | NO | (now() + '48:00:00'::interval) |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### driver_bookings

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_id | uuid | YES |  |
| rider_id | uuid | YES |  |
| ride_id | uuid | YES |  |
| booking_type | text | NO |  |
| start_at | timestamp with time zone | NO |  |
| end_at | timestamp with time zone | NO |  |
| timezone | text | YES | 'America/New_York'::text |
| recurring_group_id | uuid | YES |  |
| status | text | YES | 'confirmed'::text |
| title | text | YES |  |
| notes | text | YES |  |
| market_id | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| details | jsonb | YES | '{}'::jsonb |

### driver_enrollment_offers

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO |  |
| free_rides | integer | NO |  |
| free_earnings_cap | numeric(10,2) | NO |  |
| free_days | integer | NO |  |
| headline | text | NO |  |
| fine_print | text | NO |  |
| is_active | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |

### driver_offer_enrollments

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_id | uuid | YES |  |
| offer_id | uuid | YES |  |
| free_rides | integer | NO |  |
| free_earnings_cap | numeric(10,2) | NO |  |
| free_days | integer | NO |  |
| enrolled_at | timestamp with time zone | YES | now() |
| rides_used | integer | YES | 0 |
| earnings_used | numeric(10,2) | YES | 0 |
| total_waived_fees | numeric(10,2) | YES | 0 |
| status | text | YES | 'active'::text |
| exhausted_at | timestamp with time zone | YES |  |
| exhausted_reason | text | YES |  |

### driver_profiles

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| areas | jsonb | NO |  |
| pricing | jsonb | NO |  |
| schedule | jsonb | NO |  |
| vehicle_info | jsonb | NO |  |
| stripe_account_id | character varying(255) | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| handle | text | YES |  |
| accept_direct_bookings | boolean | NO | true |
| min_rider_chill_score | numeric(5,2) | NO | 0 |
| require_og_status | boolean | NO | false |
| first_name | text | YES |  |
| last_name | text | YES |  |
| display_name | text | YES |  |
| lgbtq_friendly | boolean | YES | false |
| video_url | text | YES |  |
| thumbnail_url | text | YES |  |
| phone | text | YES |  |
| email | text | YES |  |
| stripe_onboarding_complete | boolean | YES | false |
| stripe_external_account_last4 | text | YES |  |
| stripe_external_account_type | text | YES |  |
| stripe_external_account_bank | text | YES |  |
| stripe_instant_eligible | boolean | YES | false |
| payout_method | text | YES |  |
| payout_setup_complete | boolean | YES | false |
| stripe_subscription_id | text | YES |  |
| subscription_status | text | YES | 'free'::text |
| min_ride_price | numeric(10,2) | YES | 10.00 |
| show_video_on_link | boolean | YES | true |
| profile_visible | boolean | YES | true |
| enforce_minimum | boolean | YES | true |
| fwu | boolean | YES | false |
| stripe_customer_id | text | YES |  |
| accepts_cash | boolean | YES | false |
| cash_only | boolean | YES | false |
| cash_rides_remaining | integer | YES | 3 |
| cash_rides_reset_at | timestamp with time zone | YES | now() |
| cash_pack_balance | integer | YES | 0 |
| wait_minutes | integer | YES | 10 |
| advance_notice_hours | integer | YES | 0 |
| vibe_video_url | text | YES |  |
| allow_in_route_stops | boolean | YES | true |

### driver_schedules

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_id | uuid | YES |  |
| day_of_week | integer | NO |  |
| start_time | time without time zone | NO |  |
| end_time | time without time zone | NO |  |
| is_active | boolean | YES | true |
| timezone | text | YES | 'America/New_York'::text |
| market_id | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### driver_service_areas

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_profile_id | uuid | NO |  |
| area_name | character varying(100) | NO |  |
| is_active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |

### driver_service_menu

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_id | uuid | YES |  |
| item_id | text | YES |  |
| custom_name | text | YES |  |
| custom_icon | text | YES |  |
| price | numeric(10,2) | NO |  |
| pricing_type | text | NO |  |
| unit_label | text | YES |  |
| is_active | boolean | YES | true |
| sort_order | integer | YES | 0 |
| created_at | timestamp with time zone | YES | now() |

### hmu_posts

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| post_type | character varying(20) | NO |  |
| areas | ARRAY | NO |  |
| price | numeric(10,2) | NO |  |
| time_window | jsonb | NO |  |
| status | character varying(20) | YES | 'active'::character varying |
| expires_at | timestamp with time zone | NO |  |
| created_at | timestamp with time zone | YES | now() |
| target_driver_id | uuid | YES |  |
| booking_expires_at | timestamp with time zone | YES |  |
| is_cash | boolean | YES | false |
| market_id | uuid | YES |  |

### hold_policy

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| tier | text | NO |  |
| hold_mode | text | YES | 'full'::text |
| hold_percent | numeric(5,4) | YES | NULL::numeric |
| hold_fixed | numeric(10,2) | YES | NULL::numeric |
| hold_minimum | numeric(10,2) | YES | 5.00 |
| cancel_before_otw_refund_pct | numeric(5,4) | YES | 1.0000 |
| cancel_after_otw_driver_pct | numeric(5,4) | YES | 1.0000 |
| cancel_after_otw_platform_pct | numeric(5,4) | YES | 0.0000 |
| no_show_platform_tiers | jsonb | YES | '[]'::jsonb |
| effective_from | date | NO | CURRENT_DATE |
| effective_to | date | YES |  |
| change_reason | text | YES |  |
| changed_by | uuid | YES |  |
| is_active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |

### leads

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| email | text | YES |  |
| phone | text | YES |  |
| lead_type | text | NO |  |
| source | text | NO | 'landing_page'::text |
| utm_source | text | YES |  |
| utm_medium | text | YES |  |
| utm_campaign | text | YES |  |
| converted | boolean | YES | false |
| converted_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | YES | now() |

### market_areas

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| market_id | uuid | YES |  |
| name | text | NO |  |
| slug | text | NO |  |
| center_lat | numeric(10,8) | YES |  |
| center_lng | numeric(11,8) | YES |  |
| radius_miles | numeric(5,1) | YES | 5 |
| sort_order | integer | YES | 0 |
| is_active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |

### markets

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| slug | text | NO |  |
| name | text | NO |  |
| subdomain | text | NO |  |
| state | text | YES |  |
| timezone | text | YES | 'America/New_York'::text |
| center_lat | numeric(10,8) | YES |  |
| center_lng | numeric(11,8) | YES |  |
| radius_miles | integer | YES | 50 |
| status | text | YES | 'setup'::text |
| launch_date | timestamp with time zone | YES |  |
| min_drivers_to_launch | integer | YES | 10 |
| fee_config | jsonb | YES | '{}'::jsonb |
| launch_offer_config | jsonb | YES | '{}'::jsonb |
| sms_did | text | YES |  |
| sms_area_code | text | YES |  |
| branding | jsonb | YES | '{}'::jsonb |
| areas_bbox | text | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### notifications

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| type | character varying(50) | NO |  |
| payload | jsonb | YES |  |
| sent_at | timestamp with time zone | YES | now() |
| read_at | timestamp with time zone | YES |  |

### payouts

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | NO |  |
| driver_id | uuid | NO |  |
| amount | numeric(10,2) | NO |  |
| fee | numeric(10,2) | NO |  |
| timing_tier | character varying(20) | NO |  |
| stripe_transfer_id | character varying(255) | YES |  |
| created_at | timestamp with time zone | YES | now() |
| processed_at | timestamp with time zone | YES |  |

### platform_config

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| config_key | text | NO |  |
| config_value | jsonb | NO | '{}'::jsonb |
| updated_by | text | YES |  |
| updated_at | timestamp with time zone | YES | now() |
| created_at | timestamp with time zone | YES | now() |

### price_negotiations

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | YES |  |
| proposed_by | uuid | YES |  |
| proposed_price | numeric(10,2) | NO |  |
| status | text | YES | 'pending'::text |
| expires_at | timestamp with time zone | YES | (now() + '00:10:00'::interval) |
| created_at | timestamp with time zone | YES | now() |

### pricing_config

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| tier | text | NO |  |
| fee_rate | numeric(5,4) | NO |  |
| daily_cap | numeric(10,2) | NO |  |
| weekly_cap | numeric(10,2) | NO |  |
| progressive_thresholds | jsonb | YES |  |
| peak_multiplier | numeric(4,2) | YES | 1.00 |
| peak_label | text | YES |  |
| effective_from | date | NO | CURRENT_DATE |
| effective_to | date | YES |  |
| change_reason | text | YES |  |
| changed_by | uuid | YES |  |
| is_active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |

### rate_limit_counters

| Column | Type | Nullable | Default |
|---|---|---|---|
| key | text | NO |  |
| count | integer | NO | 0 |
| window_start | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### ratings

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | NO |  |
| rater_id | uuid | NO |  |
| rated_id | uuid | NO |  |
| rating_type | character varying(20) | NO |  |
| created_at | timestamp with time zone | YES | now() |

### ride_add_ons

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | YES |  |
| menu_item_id | uuid | YES |  |
| name | text | NO |  |
| unit_price | numeric(10,2) | NO |  |
| quantity | integer | YES | 1 |
| subtotal | numeric(10,2) | NO |  |
| added_by | text | YES | 'rider'::text |
| status | text | YES | 'pre_selected'::text |
| rider_adjusted_amount | numeric(10,2) | YES |  |
| dispute_reason | text | YES |  |
| final_amount | numeric(10,2) | YES |  |
| added_at | timestamp with time zone | YES | now() |
| confirmed_at | timestamp with time zone | YES |  |

### ride_comments

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | NO |  |
| user_id | uuid | NO |  |
| message | text | NO |  |
| comment_type | character varying(50) | YES | 'general'::character varying |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### ride_interests

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| post_id | uuid | YES |  |
| driver_id | uuid | YES |  |
| status | text | YES | 'interested'::text |
| price_offered | numeric(10,2) | YES |  |
| message | text | YES |  |
| created_at | timestamp with time zone | YES | now() |

### ride_locations

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | NO |  |
| lat | numeric(10,8) | NO |  |
| lng | numeric(11,8) | NO |  |
| recorded_at | timestamp with time zone | YES | now() |
| user_id | uuid | YES |  |

### ride_messages

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | NO |  |
| sender_id | uuid | NO |  |
| content | text | NO |  |
| created_at | timestamp with time zone | YES | now() |
| message_type | text | YES | 'chat'::text |
| quick_key | text | YES |  |
| sms_sent | boolean | YES | false |

### rider_payment_methods

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| rider_id | uuid | YES |  |
| stripe_payment_method_id | text | NO |  |
| type | text | NO |  |
| brand | text | YES |  |
| last4 | text | NO |  |
| exp_month | integer | YES |  |
| exp_year | integer | YES |  |
| is_default | boolean | YES | false |
| apple_pay | boolean | YES | false |
| google_pay | boolean | YES | false |
| cash_app_pay | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |

### rider_profiles

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| price_range | jsonb | YES |  |
| driver_preference | character varying(20) | YES |  |
| stripe_customer_id | character varying(255) | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| first_name | text | YES |  |
| last_name | text | YES |  |
| lgbtq_friendly | boolean | YES | false |
| video_url | text | YES |  |
| thumbnail_url | text | YES |  |
| safety_preferences | jsonb | YES | '{}'::jsonb |
| display_name | text | YES |  |
| handle | text | YES |  |
| avatar_url | text | YES |  |
| vibe_video_url | text | YES |  |
| phone | text | YES |  |

### rides

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_id | uuid | NO |  |
| rider_id | uuid | NO |  |
| status | character varying(20) | YES | 'matched'::character varying |
| pickup | jsonb | YES |  |
| dropoff | jsonb | YES |  |
| stops | jsonb | YES |  |
| amount | numeric(10,2) | NO |  |
| payment_intent_id | character varying(255) | YES |  |
| application_fee | numeric(10,2) | YES |  |
| driver_confirmed_end | boolean | YES | false |
| dispute_window_expires_at | timestamp with time zone | YES |  |
| started_at | timestamp with time zone | YES |  |
| ended_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| price_mode | text | YES | 'proposed'::text |
| proposed_price | numeric(10,2) | YES |  |
| auto_calculated_price | numeric(10,2) | YES |  |
| final_agreed_price | numeric(10,2) | YES |  |
| price_accepted_at | timestamp with time zone | YES |  |
| payment_authorized | boolean | YES | false |
| payment_authorized_at | timestamp with time zone | YES |  |
| payment_captured | boolean | YES | false |
| payment_captured_at | timestamp with time zone | YES |  |
| platform_fee_amount | numeric(10,2) | YES |  |
| driver_payout_amount | numeric(10,2) | YES |  |
| stripe_fee_amount | numeric(10,2) | YES |  |
| funds_held | boolean | YES | false |
| hmu_post_id | uuid | YES |  |
| otw_at | timestamp with time zone | YES |  |
| here_at | timestamp with time zone | YES |  |
| otw_deadline | timestamp with time zone | YES |  |
| agreement_summary | jsonb | YES |  |
| dispute_window_minutes | integer | YES | 15 |
| rider_rating | text | YES |  |
| driver_rating | text | YES |  |
| rider_auto_rated | boolean | YES | false |
| coo_at | timestamp with time zone | YES |  |
| rider_lat | numeric(10,8) | YES |  |
| rider_lng | numeric(11,8) | YES |  |
| rider_location_text | text | YES |  |
| completed_at | timestamp with time zone | YES |  |
| is_cash | boolean | YES | false |
| wait_minutes | integer | YES | 10 |
| rider_start_lat | numeric(10,8) | YES |  |
| rider_start_lng | numeric(11,8) | YES |  |
| driver_start_lat | numeric(10,8) | YES |  |
| driver_start_lng | numeric(11,8) | YES |  |
| driver_end_lat | numeric(10,8) | YES |  |
| driver_end_lng | numeric(11,8) | YES |  |
| rider_end_lat | numeric(10,8) | YES |  |
| rider_end_lng | numeric(11,8) | YES |  |
| rider_confirmed_start | boolean | YES | false |
| pulloff_amount | numeric(10,2) | YES |  |
| pulloff_at | timestamp with time zone | YES |  |
| pulloff_driver_lat | numeric(10,8) | YES |  |
| pulloff_driver_lng | numeric(11,8) | YES |  |
| pulloff_rider_lat | numeric(10,8) | YES |  |
| pulloff_rider_lng | numeric(11,8) | YES |  |
| waived_fee_amount | numeric(10,2) | YES | 0 |
| add_on_reserve | numeric(10,2) | YES | 0 |
| add_on_total | numeric(10,2) | YES | 0 |
| confirm_deadline | timestamp with time zone | YES |  |
| proximity_check_m | numeric(10,2) | YES |  |
| no_show_percent | integer | YES |  |
| no_show_base_charge | numeric(10,2) | YES |  |
| no_show_addon_refund | numeric(10,2) | YES |  |
| capture_idempotency_key | text | YES |  |
| auto_confirmed | boolean | YES | false |
| eta_nudge_sent_at | timestamp with time zone | YES |  |
| driver_here_lat | numeric(10,8) | YES |  |
| driver_here_lng | numeric(11,8) | YES |  |
| here_proximity_ft | integer | YES |  |
| here_verified | boolean | YES |  |
| end_proximity_ft | integer | YES |  |
| end_verified | boolean | YES |  |
| total_distance_miles | numeric(8,2) | YES |  |
| total_duration_minutes | integer | YES |  |
| rate_per_mile | numeric(8,2) | YES |  |
| rate_per_minute | numeric(8,2) | YES |  |
| pickup_address | text | YES |  |
| pickup_lat | numeric(10,8) | YES |  |
| pickup_lng | numeric(11,8) | YES |  |
| dropoff_address | text | YES |  |
| dropoff_lat | numeric(10,8) | YES |  |
| dropoff_lng | numeric(11,8) | YES |  |
| proposed_price_reason | text | YES |  |
| early_end_reason | text | YES |  |
| early_end_notes | text | YES |  |
| market_id | uuid | YES |  |
| proposed_address_update | jsonb | YES |  |
| ref_code | text | YES |  |
| visible_deposit | numeric(10,2) | YES | NULL::numeric |
| hold_policy_id | uuid | YES |  |

### schedule_events

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_id | uuid | YES |  |
| rider_id | uuid | YES |  |
| event_type | text | NO |  |
| details | jsonb | YES | '{}'::jsonb |
| market_id | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |

### search_events

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES |  |
| event | text | NO |  |
| query | text | YES |  |
| result_count | integer | YES |  |
| top_result | text | YES |  |
| no_results | boolean | YES | false |
| selected_label | text | YES |  |
| selected_href | text | YES |  |
| selected_breadcrumb | text | YES |  |
| created_at | timestamp with time zone | YES | now() |

### service_menu_items

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | text | NO |  |
| name | text | NO |  |
| default_price | numeric(10,2) | NO |  |
| pricing_type | text | NO |  |
| unit_label | text | YES |  |
| category | text | NO |  |
| icon | text | YES |  |
| sort_order | integer | YES | 0 |
| is_active | boolean | YES | true |

### sms_inbound

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| from_phone | text | NO |  |
| to_did | text | NO |  |
| message | text | NO |  |
| voipms_id | text | YES |  |
| read | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |

### sms_log

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| to_phone | text | NO |  |
| from_did | text | NO |  |
| message | text | NO |  |
| status | text | NO | 'pending'::text |
| voipms_status | text | YES |  |
| retry_count | integer | YES | 0 |
| error | text | YES |  |
| ride_id | uuid | YES |  |
| user_id | uuid | YES |  |
| event_type | text | YES |  |
| market | text | YES | 'atl'::text |
| created_at | timestamp with time zone | YES | now() |

### support_conversations

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES |  |
| user_role | text | NO |  |
| ride_id | uuid | YES |  |
| category | text | YES |  |
| status | text | YES | 'open'::text |
| messages | jsonb | YES | '[]'::jsonb |
| market_id | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### support_tickets

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES |  |
| conversation_id | uuid | YES |  |
| category | text | YES |  |
| ride_id | uuid | YES |  |
| subject | text | YES |  |
| details | text | YES |  |
| severity | text | YES | 'medium'::text |
| status | text | YES | 'open'::text |
| admin_id | uuid | YES |  |
| admin_notes | text | YES |  |
| market_id | uuid | YES |  |
| resolved_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | YES | now() |

### suspect_usage_events

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES |  |
| event_type | text | NO |  |
| details | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | NO | now() |

### transaction_ledger

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | YES |  |
| user_id | uuid | YES |  |
| user_role | text | YES |  |
| event_type | text | NO |  |
| amount | numeric(10,2) | NO |  |
| direction | text | YES |  |
| description | text | YES |  |
| stripe_reference | text | YES |  |
| created_at | timestamp with time zone | YES | now() |

### user_activity

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| event_name | character varying(100) | NO |  |
| properties | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | YES | now() |

### user_preferences

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| favorite_drivers | ARRAY | YES | ARRAY[]::uuid[] |
| saved_routes | jsonb | YES | '[]'::jsonb |
| notification_settings | jsonb | YES | '{"sms": false, "push": true, "email": true}'::jsonb |
| preferred_vehicle_types | ARRAY | YES | ARRAY['sedan'::text] |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| driver_gender_pref | character varying(50) | YES |  |
| rider_gender_pref | character varying(50) | YES |  |
| require_lgbtq_friendly | boolean | YES | false |
| min_driver_rating | numeric(3,2) | YES | 4.0 |
| min_rider_rating | numeric(3,2) | YES | 4.0 |
| require_verification | boolean | YES | false |
| avoid_disputes | boolean | YES | true |
| share_trip_with_emergency_contact | boolean | YES | false |
| emergency_contact_phone | character varying(20) | YES |  |
| emergency_contact_name | character varying(200) | YES |  |
| max_trip_distance_miles | integer | YES |  |
| matching_priority | character varying(50) | YES | 'safety_first'::character varying |

### user_reports

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| reporter_id | uuid | NO |  |
| reported_id | uuid | NO |  |
| ride_id | uuid | YES |  |
| reason | character varying(100) | NO |  |
| details | text | YES |  |
| status | character varying(50) | YES | 'pending'::character varying |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| resolved_at | timestamp with time zone | YES |  |
| resolved_by | uuid | YES |  |

### users

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| clerk_id | character varying(255) | NO |  |
| profile_type | character varying(20) | NO |  |
| account_status | character varying(20) | NO | 'pending_activation'::character varying |
| tier | character varying(20) | YES | 'free'::character varying |
| og_status | boolean | YES | false |
| chill_score | numeric(5,2) | YES | 100 |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| last_active | timestamp with time zone | YES | now() |
| gender | character varying(50) | YES |  |
| pronouns | character varying(100) | YES |  |
| lgbtq_friendly | boolean | YES | false |
| is_verified | boolean | YES | false |
| background_check_status | character varying(50) | YES | 'pending'::character varying |
| background_check_date | timestamp with time zone | YES |  |
| completed_rides | integer | YES | 0 |
| is_admin | boolean | YES | false |
| market_id | uuid | YES |  |
| signup_source | text | YES |  |
| referred_by_driver_id | uuid | YES |  |
| referred_via_hmu_post_id | uuid | YES |  |
| admin_last_seen_at | timestamp with time zone | YES |  |
| last_sign_in_at | timestamp with time zone | YES |  |
| first_return_at | timestamp with time zone | YES |  |
| sign_in_count | integer | YES | 0 |
| phone | text | YES |  |

### video_configs

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| composition_id | text | NO |  |
| title | text | NO |  |
| recording_file | text | NO |  |
| intro_title | text | NO | ''::text |
| intro_sec | numeric(5,1) | YES | 3 |
| video_sec | numeric(6,1) | NO |  |
| end_sec | numeric(5,1) | YES | 5 |
| title_card_duration_sec | numeric(4,1) | YES | 2 |
| caption_duration_sec | numeric(4,1) | YES | 5 |
| end_tagline | text | YES | 'Your city. Your ride. Your rules.'::text |
| end_cta | text | YES | 'HMU ATL'::text |
| steps | jsonb | NO | '[]'::jsonb |
| is_active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| phone_width | integer | YES | 480 |
| phone_height | integer | YES | 1036 |
