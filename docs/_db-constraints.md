# Database Constraints Reference

Auto-generated from Neon Postgres `information_schema.table_constraints` + `constraint_column_usage`.

### admin_audit_log

**Primary Key:** id

**Foreign Keys:**
- admin_id -> users(id)

### admin_notification_config

**Primary Key:** id

**Unique Constraints:**
- (notification_type)

### admin_sms_sent

**Primary Key:** id

**Foreign Keys:**
- admin_id -> users(id)
- recipient_id -> users(id)

### blocked_users

**Primary Key:** id

**Foreign Keys:**
- blocked_id -> users(id)
- blocker_id -> users(id)

**Unique Constraints:**
- (blocked_id, blocker_id)

### comments

**Primary Key:** id

**Foreign Keys:**
- author_id -> users(id)
- ride_id -> rides(id)
- subject_id -> users(id)

### content_prompts

**Primary Key:** id

### daily_earnings

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)

**Unique Constraints:**
- (driver_id, earnings_date)

### data_room_access_logs

**Primary Key:** id

**Foreign Keys:**
- consent_id -> data_room_consents(id)
- document_id -> data_room_documents(id)

**Check Constraints:**
- `(action = ANY (ARRAY['view'::text, 'download'::text]))`

### data_room_consents

**Primary Key:** id

### data_room_documents

**Primary Key:** id

**Check Constraints:**
- `(category = ANY (ARRAY['pitch_deck'::text, 'financials'::text, 'one_pager'::text, 'legal'::text, 'other'::text]))`

### disputes

**Primary Key:** id

**Foreign Keys:**
- filed_by -> users(id)
- ride_id -> rides(id)

**Check Constraints:**
- `((status)::text = ANY ((ARRAY['open'::character varying, 'under_review'::character varying, 'resolved'::character varying, 'closed'::character varying])::text[]))`

### draft_bookings

**Primary Key:** id

**Foreign Keys:**
- rider_id -> users(id)

**Unique Constraints:**
- (rider_id, driver_handle)

### driver_bookings

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)
- market_id -> markets(id)
- ride_id -> rides(id)
- rider_id -> users(id)

**Check Constraints:**
- `(booking_type = ANY (ARRAY['ride'::text, 'recurring_ride'::text, 'blocked'::text, 'break'::text]))`
- `(status = ANY (ARRAY['confirmed'::text, 'pending'::text, 'cancelled'::text]))`

### driver_enrollment_offers

**Primary Key:** id

### driver_offer_enrollments

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)
- offer_id -> driver_enrollment_offers(id)

**Unique Constraints:**
- (driver_id)

**Check Constraints:**
- `(status = ANY (ARRAY['active'::text, 'exhausted'::text, 'expired'::text]))`

### driver_profiles

**Primary Key:** id

**Foreign Keys:**
- user_id -> users(id)

**Unique Constraints:**
- (handle)
- (user_id)

**Check Constraints:**
- `(payout_method = ANY (ARRAY['bank'::text, 'debit'::text, 'cash_app'::text, 'venmo'::text, 'zelle'::text, 'paypal'::text]))`
- `(subscription_status = ANY (ARRAY['free'::text, 'hmu_first'::text, 'past_due'::text]))`

### driver_schedules

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)
- market_id -> markets(id)

**Unique Constraints:**
- (driver_id, day_of_week)

**Check Constraints:**
- `((day_of_week >= 0) AND (day_of_week <= 6))`

### driver_service_areas

**Primary Key:** id

**Foreign Keys:**
- driver_profile_id -> driver_profiles(id)

### driver_service_menu

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)
- item_id -> service_menu_items(id)

**Unique Constraints:**
- (driver_id, item_id)

**Check Constraints:**
- `(pricing_type = ANY (ARRAY['flat'::text, 'per_unit'::text, 'per_minute'::text]))`

### hmu_posts

**Primary Key:** id

**Foreign Keys:**
- market_id -> markets(id)
- target_driver_id -> users(id)
- user_id -> users(id)

**Check Constraints:**
- `((post_type)::text = ANY ((ARRAY['driver_available'::character varying, 'rider_request'::character varying, 'direct_booking'::character varying])::text[]))`
- `((status)::text = ANY ((ARRAY['active'::character varying, 'matched'::character varying, 'expired'::character varying, 'cancelled'::character varying, 'completed'::character varying])::text[]))`

### hold_policy

**Primary Key:** id

**Check Constraints:**
- `(hold_mode = ANY (ARRAY['full'::text, 'deposit_percent'::text, 'deposit_fixed'::text]))`
- `(tier = ANY (ARRAY['free'::text, 'hmu_first'::text]))`

### leads

**Primary Key:** id

**Check Constraints:**
- `(lead_type = ANY (ARRAY['driver'::text, 'rider'::text]))`

### market_areas

**Primary Key:** id

**Foreign Keys:**
- market_id -> markets(id)

**Unique Constraints:**
- (market_id, slug)

### markets

**Primary Key:** id

**Unique Constraints:**
- (slug)
- (subdomain)

**Check Constraints:**
- `(status = ANY (ARRAY['setup'::text, 'soft_launch'::text, 'live'::text, 'paused'::text]))`

### notifications

**Primary Key:** id

**Foreign Keys:**
- user_id -> users(id)

### payouts

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)
- ride_id -> rides(id)

**Check Constraints:**
- `((timing_tier)::text = ANY ((ARRAY['free'::character varying, 'hmu_first'::character varying])::text[]))`

### platform_config

**Primary Key:** id

**Unique Constraints:**
- (config_key)

### price_negotiations

**Primary Key:** id

**Foreign Keys:**
- proposed_by -> users(id)
- ride_id -> rides(id)

**Check Constraints:**
- `(status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'expired'::text]))`

### pricing_config

**Primary Key:** id

**Foreign Keys:**
- changed_by -> users(id)

### rate_limit_counters

**Primary Key:** key

### ratings

**Primary Key:** id

**Foreign Keys:**
- rated_id -> users(id)
- rater_id -> users(id)
- ride_id -> rides(id)

**Check Constraints:**
- `((rating_type)::text = ANY ((ARRAY['chill'::character varying, 'cool_af'::character varying, 'kinda_creepy'::character varying, 'weirdo'::character varying])::text[]))`

### ride_add_ons

**Primary Key:** id

**Foreign Keys:**
- menu_item_id -> driver_service_menu(id)
- ride_id -> rides(id)

**Check Constraints:**
- `(added_by = ANY (ARRAY['rider'::text, 'system'::text]))`
- `(status = ANY (ARRAY['pre_selected'::text, 'confirmed'::text, 'disputed'::text, 'adjusted'::text, 'removed'::text]))`

### ride_comments

**Primary Key:** id

**Foreign Keys:**
- ride_id -> rides(id)
- user_id -> users(id)

**Check Constraints:**
- `((comment_type)::text = ANY ((ARRAY['offer_counter'::character varying, 'question'::character varying, 'update'::character varying, 'general'::character varying])::text[]))`
- `(length(message) <= 500)`

### ride_interests

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)
- post_id -> hmu_posts(id)

**Unique Constraints:**
- (post_id, driver_id)

**Check Constraints:**
- `(status = ANY (ARRAY['interested'::text, 'selected'::text, 'passed'::text, 'expired'::text]))`

### ride_locations

**Primary Key:** id

**Foreign Keys:**
- ride_id -> rides(id)
- user_id -> users(id)

### ride_messages

**Primary Key:** id

**Foreign Keys:**
- ride_id -> rides(id)
- sender_id -> users(id)

### rider_payment_methods

**Primary Key:** id

**Foreign Keys:**
- rider_id -> users(id)

### rider_profiles

**Primary Key:** id

**Foreign Keys:**
- user_id -> users(id)

**Unique Constraints:**
- (handle)
- (user_id)

**Check Constraints:**
- `((driver_preference)::text = ANY ((ARRAY['male'::character varying, 'female'::character varying, 'no_preference'::character varying, 'women_only'::character varying, 'men_only'::character varying, 'prefer_women'::character varying, 'prefer_men'::character varying, 'any'::character varying])::text[]))`

### rides

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)
- market_id -> markets(id)
- rider_id -> users(id)

**Unique Constraints:**
- (ref_code)

**Check Constraints:**
- `((status)::text = ANY ((ARRAY['matched'::character varying, 'otw'::character varying, 'here'::character varying, 'confirming'::character varying, 'active'::character varying, 'ended'::character varying, 'disputed'::character varying, 'completed'::character varying, 'cancelled'::character varying, 'refunded'::character varying])::text[]))`

### schedule_events

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)
- market_id -> markets(id)
- rider_id -> users(id)

**Check Constraints:**
- `(event_type = ANY (ARRAY['hours_set'::text, 'hours_updated'::text, 'booking_created'::text, 'booking_cancelled'::text, 'conflict_blocked'::text, 'time_blocked'::text, 'time_unblocked'::text]))`

### search_events

**Primary Key:** id

**Foreign Keys:**
- user_id -> users(id)

### service_menu_items

**Primary Key:** id

**Check Constraints:**
- `(pricing_type = ANY (ARRAY['flat'::text, 'per_unit'::text, 'per_minute'::text]))`

### sms_inbound

**Primary Key:** id

### sms_log

**Primary Key:** id

### support_conversations

**Primary Key:** id

**Foreign Keys:**
- market_id -> markets(id)
- ride_id -> rides(id)
- user_id -> users(id)

**Check Constraints:**
- `(status = ANY (ARRAY['open'::text, 'resolved'::text, 'escalated'::text]))`
- `(user_role = ANY (ARRAY['driver'::text, 'rider'::text]))`

### support_tickets

**Primary Key:** id

**Foreign Keys:**
- admin_id -> users(id)
- conversation_id -> support_conversations(id)
- market_id -> markets(id)
- ride_id -> rides(id)
- user_id -> users(id)

**Check Constraints:**
- `(category = ANY (ARRAY['rider_no_show'::text, 'rider_aggressive'::text, 'rider_damage'::text, 'payment_question'::text, 'payment_missing'::text, 'dispute_response'::text, 'driver_no_show'::text, 'driver_inappropriate'::text, 'driver_unsafe'::text, 'overcharged'::text, 'route_issue'::text, 'refund_request'::text, 'other'::text]))`
- `(severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))`
- `(status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text]))`

### suspect_usage_events

**Primary Key:** id

**Foreign Keys:**
- user_id -> users(id)

### transaction_ledger

**Primary Key:** id

**Foreign Keys:**
- ride_id -> rides(id)
- user_id -> users(id)

**Check Constraints:**
- `(direction = ANY (ARRAY['debit'::text, 'credit'::text, 'hold'::text, 'release'::text, 'pending'::text]))`
- `(user_role = ANY (ARRAY['rider'::text, 'driver'::text, 'platform'::text]))`

### user_activity

**Primary Key:** id

**Foreign Keys:**
- user_id -> users(id)

### user_preferences

**Primary Key:** id

**Foreign Keys:**
- user_id -> users(id)

**Unique Constraints:**
- (user_id)

**Check Constraints:**
- `((driver_gender_pref)::text = ANY ((ARRAY['no_preference'::character varying, 'women_only'::character varying, 'men_only'::character varying, 'prefer_women'::character varying, 'prefer_men'::character varying])::text[]))`
- `((matching_priority)::text = ANY ((ARRAY['safety_first'::character varying, 'proximity_first'::character varying, 'price_first'::character varying, 'rating_first'::character varying])::text[]))`
- `((min_driver_rating >= (0)::numeric) AND (min_driver_rating <= 5.0))`
- `((min_rider_rating >= (0)::numeric) AND (min_rider_rating <= 5.0))`
- `((rider_gender_pref)::text = ANY ((ARRAY['no_preference'::character varying, 'women_only'::character varying, 'men_only'::character varying, 'prefer_women'::character varying, 'prefer_men'::character varying])::text[]))`

### user_reports

**Primary Key:** id

**Foreign Keys:**
- reported_id -> users(id)
- reporter_id -> users(id)
- resolved_by -> users(id)
- ride_id -> rides(id)

**Check Constraints:**
- `((reason)::text = ANY ((ARRAY['inappropriate_behavior'::character varying, 'safety_concern'::character varying, 'harassment'::character varying, 'discrimination'::character varying, 'dangerous_driving'::character varying, 'fraud'::character varying, 'other'::character varying])::text[]))`
- `((status)::text = ANY ((ARRAY['pending'::character varying, 'reviewing'::character varying, 'resolved'::character varying, 'dismissed'::character varying])::text[]))`

### users

**Primary Key:** id

**Foreign Keys:**
- market_id -> markets(id)
- referred_by_driver_id -> users(id)
- referred_via_hmu_post_id -> hmu_posts(id)

**Unique Constraints:**
- (clerk_id)

**Check Constraints:**
- `((account_status)::text = ANY ((ARRAY['pending_activation'::character varying, 'active'::character varying, 'suspended'::character varying, 'banned'::character varying])::text[]))`
- `((background_check_status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'expired'::character varying])::text[]))`
- `((profile_type)::text = ANY ((ARRAY['rider'::character varying, 'driver'::character varying])::text[]))`
- `((tier)::text = ANY ((ARRAY['free'::character varying, 'hmu_first'::character varying])::text[]))`

### video_configs

**Primary Key:** id

**Unique Constraints:**
- (composition_id)
