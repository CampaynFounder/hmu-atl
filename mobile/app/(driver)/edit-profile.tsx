// Driver edit profile — identity, areas, booking settings, visibility.
// Sections save independently: text fields on blur, toggles immediately.
// APIs: GET /api/driver/profile, POST /api/driver/profile (identity),
//       PATCH /api/users/profile (areas + lgbtq),
//       PATCH /api/drivers/booking-settings (booking prefs)

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Switch, ActivityIndicator, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, spacing, shadow, toggle } from '@/lib/theme';
import { apiClient } from '@/lib/api';

// ── Atlanta areas ──────────────────────────────────────────────────────────────

const ATL_AREAS = [
  { slug: 'northside',       name: 'Northside',       group: 'NORTHSIDE' },
  { slug: 'buckhead',        name: 'Buckhead',         group: 'NORTHSIDE' },
  { slug: 'sandy-springs',   name: 'Sandy Springs',    group: 'NORTHSIDE' },
  { slug: 'marietta',        name: 'Marietta',         group: 'NORTHSIDE' },
  { slug: 'central',         name: 'Central',          group: 'CENTRAL'   },
  { slug: 'midtown',         name: 'Midtown',          group: 'CENTRAL'   },
  { slug: 'downtown',        name: 'Downtown',         group: 'CENTRAL'   },
  { slug: 'westside',        name: 'Westside',         group: 'WESTSIDE'  },
  { slug: 'west-end',        name: 'West End',         group: 'WESTSIDE'  },
  { slug: 'eastside',        name: 'Eastside',         group: 'EASTSIDE'  },
  { slug: 'east-atlanta',    name: 'East Atlanta',     group: 'EASTSIDE'  },
  { slug: 'decatur',         name: 'Decatur',          group: 'EASTSIDE'  },
  { slug: 'north-druid-hills', name: 'N. Druid Hills', group: 'EASTSIDE'  },
  { slug: 'stone-mountain',  name: 'Stone Mtn',        group: 'EASTSIDE'  },
  { slug: 'southside',       name: 'Southside',        group: 'SOUTHSIDE' },
  { slug: 'south-atlanta',   name: 'South Atlanta',    group: 'SOUTHSIDE' },
  { slug: 'college-park',    name: 'College Park',     group: 'SOUTHSIDE' },
  { slug: 'airport',         name: 'Airport',          group: 'SOUTHSIDE' },
];

const AREA_GROUPS = ['NORTHSIDE', 'CENTRAL', 'WESTSIDE', 'EASTSIDE', 'SOUTHSIDE'];

const WAIT_OPTS = [5, 7, 10, 15, 20];

// ── Types ──────────────────────────────────────────────────────────────────────

interface Profile {
  displayName: string;
  phone: string | null;
  gender: string | null;
  pronouns: string | null;
  lgbtqFriendly: boolean;
  areaSlugs: string[];
  servicesEntireMarket: boolean;
  acceptsLongDistance: boolean;
  acceptCash: boolean;
  cashOnly: boolean;
  waitMinutes: number;
  acceptDirectBookings: boolean;
  allowInRouteStops: boolean;
  profileVisible: boolean;
  fwu: boolean;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // section key being saved
  const [saved, setSaved] = useState<string | null>(null);   // section key last saved

  // Form state — all fields live here
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [areaSlugs, setAreaSlugs] = useState<string[]>([]);
  const [servicesEntireMarket, setServicesEntireMarket] = useState(false);
  const [acceptsLongDistance, setAcceptsLongDistance] = useState(false);
  const [lgbtqFriendly, setLgbtqFriendly] = useState(false);
  const [acceptsCash, setAcceptsCash] = useState(false);
  const [cashOnly, setCashOnly] = useState(false);
  const [waitMinutes, setWaitMinutes] = useState(10);
  const [acceptDirectBookings, setAcceptDirectBookings] = useState(true);
  const [allowInRouteStops, setAllowInRouteStops] = useState(true);
  const [profileVisible, setProfileVisible] = useState(true);
  const [fwu, setFwu] = useState(false);

  // Load
  useEffect(() => {
    (async () => {
      try {
        const t = await getToken();
        const p = await apiClient<Profile>('/driver/profile', t);
        setDisplayName(p.displayName ?? '');
        setPhone(p.phone ?? '');
        setAreaSlugs(p.areaSlugs ?? []);
        setServicesEntireMarket(p.servicesEntireMarket ?? false);
        setAcceptsLongDistance(p.acceptsLongDistance ?? false);
        setLgbtqFriendly(p.lgbtqFriendly ?? false);
        setAcceptsCash(p.acceptCash ?? false);
        setCashOnly(p.cashOnly ?? false);
        setWaitMinutes(p.waitMinutes ?? 10);
        setAcceptDirectBookings(p.acceptDirectBookings ?? true);
        setAllowInRouteStops(p.allowInRouteStops ?? true);
        setProfileVisible(p.profileVisible ?? true);
        setFwu(p.fwu ?? false);
      } catch {}
      finally { setLoading(false); }
    })();
  }, [getToken]);

  function flash(key: string) {
    setSaved(key);
    setTimeout(() => setSaved(null), 2000);
  }

  // ── Save helpers ──────────────────────────────────────────────────────────

  async function saveIdentity() {
    if (!displayName.trim()) return;
    setSaving('identity');
    try {
      const t = await getToken();
      await apiClient('/driver/profile', t, {
        method: 'POST',
        body: JSON.stringify({ displayName: displayName.trim(), phone: phone.trim() || null }),
      });
      flash('identity');
    } catch {}
    finally { setSaving(null); }
  }

  async function saveAreas(patch: {
    areaSlugs?: string[];
    servicesEntireMarket?: boolean;
    acceptsLongDistance?: boolean;
    lgbtqFriendly?: boolean;
  }) {
    setSaving('areas');
    try {
      const t = await getToken();
      await apiClient('/users/profile', t, {
        method: 'PATCH',
        body: JSON.stringify({
          profile_type: 'driver',
          area_slugs: patch.areaSlugs ?? areaSlugs,
          services_entire_market: patch.servicesEntireMarket ?? servicesEntireMarket,
          accepts_long_distance: patch.acceptsLongDistance ?? acceptsLongDistance,
          lgbtq_friendly: patch.lgbtqFriendly ?? lgbtqFriendly,
        }),
      });
      flash('areas');
    } catch {}
    finally { setSaving(null); }
  }

  async function saveBookingSettings(patch: Partial<{
    accepts_cash: boolean;
    cash_only: boolean;
    wait_minutes: number;
    accept_direct_bookings: boolean;
    allow_in_route_stops: boolean;
    profile_visible: boolean;
    fwu: boolean;
  }>) {
    setSaving('booking');
    try {
      const t = await getToken();
      await apiClient('/drivers/booking-settings', t, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      flash('booking');
      Haptics.selectionAsync();
    } catch {}
    finally { setSaving(null); }
  }

  // ── Toggle helpers (optimistic) ────────────────────────────────────────────

  function toggleAreaSlug(slug: string) {
    const next = areaSlugs.includes(slug)
      ? areaSlugs.filter((s) => s !== slug)
      : [...areaSlugs, slug];
    setAreaSlugs(next);
    void saveAreas({ areaSlugs: next });
  }

  function toggleEntireMarket(v: boolean) {
    setServicesEntireMarket(v);
    void saveAreas({ servicesEntireMarket: v });
  }

  function toggleLongDistance(v: boolean) {
    setAcceptsLongDistance(v);
    void saveAreas({ acceptsLongDistance: v });
  }

  function toggleLgbtq(v: boolean) {
    setLgbtqFriendly(v);
    void saveAreas({ lgbtqFriendly: v });
  }

  function toggleCash(v: boolean) {
    setAcceptsCash(v);
    if (!v) setCashOnly(false);
    void saveBookingSettings({ accepts_cash: v, ...(v ? {} : { cash_only: false }) });
  }

  function toggleCashOnly(v: boolean) {
    setCashOnly(v);
    void saveBookingSettings({ cash_only: v });
  }

  function toggleDirectBookings(v: boolean) {
    setAcceptDirectBookings(v);
    void saveBookingSettings({ accept_direct_bookings: v });
  }

  function toggleInRouteStops(v: boolean) {
    setAllowInRouteStops(v);
    void saveBookingSettings({ allow_in_route_stops: v });
  }

  function toggleProfileVisible(v: boolean) {
    setProfileVisible(v);
    void saveBookingSettings({ profile_visible: v });
  }

  function toggleFwu(v: boolean) {
    setFwu(v);
    void saveBookingSettings({ fwu: v });
  }

  function selectWaitTime(min: number) {
    setWaitMinutes(min);
    void saveBookingSettings({ wait_minutes: min });
  }

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Navbar */}
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.navTitle}>EDIT PROFILE</Text>
        <View style={s.savingSlot}>
          {saving && <ActivityIndicator size="small" color={colors.green} />}
          {!saving && saved && <Text style={s.savedText}>SAVED</Text>}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── IDENTITY ── */}
        <SectionHeader label="IDENTITY" />
        <View style={[s.card, shadow.card]}>
          <FieldRow label="DISPLAY NAME">
            <TextInput
              style={s.textInput}
              value={displayName}
              onChangeText={setDisplayName}
              onBlur={saveIdentity}
              placeholder="Your name"
              placeholderTextColor={colors.textFaint}
              returnKeyType="done"
            />
          </FieldRow>
          <Divider />
          <FieldRow label="PHONE">
            <TextInput
              style={s.textInput}
              value={phone}
              onChangeText={setPhone}
              onBlur={saveIdentity}
              placeholder="+1 (404) 000-0000"
              placeholderTextColor={colors.textFaint}
              keyboardType="phone-pad"
              returnKeyType="done"
            />
          </FieldRow>
        </View>

        {/* ── MY AREAS ── */}
        <SectionHeader label="MY AREAS" hint="Where do you drive?" />
        <View style={[s.card, shadow.card]}>
          <ToggleRow
            label="Serve Entire Market"
            sub="Atlanta + all suburbs"
            value={servicesEntireMarket}
            onChange={toggleEntireMarket}
          />
          {!servicesEntireMarket && (
            <>
              <Divider />
              <View style={s.areaSection}>
                <Text style={s.areaHint}>TAP TO TOGGLE YOUR COVERAGE AREAS</Text>
                {AREA_GROUPS.map((group) => {
                  const groupAreas = ATL_AREAS.filter((a) => a.group === group);
                  return (
                    <View key={group} style={s.areaGroup}>
                      <Text style={s.areaGroupLabel}>{group}</Text>
                      <View style={s.areaChips}>
                        {groupAreas.map((area) => {
                          const selected = areaSlugs.includes(area.slug);
                          return (
                            <Pressable
                              key={area.slug}
                              style={[s.chip, selected && s.chipActive]}
                              onPress={() => toggleAreaSlug(area.slug)}
                            >
                              <Text style={[s.chipText, selected && s.chipTextActive]}>
                                {area.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}
          <Divider />
          <ToggleRow
            label="Accept Long Distance"
            sub="Rides outside Atlanta area"
            value={acceptsLongDistance}
            onChange={toggleLongDistance}
          />
        </View>

        {/* ── RIDE SETTINGS ── */}
        <SectionHeader label="RIDE SETTINGS" />
        <View style={[s.card, shadow.card]}>
          <View style={s.fieldRow}>
            <View style={s.fieldLabelCol}>
              <Text style={s.fieldLabel}>WAIT TIME</Text>
              <Text style={s.fieldSub}>How long you'll wait at pickup</Text>
            </View>
          </View>
          <View style={s.waitRow}>
            {WAIT_OPTS.map((min) => (
              <Pressable
                key={min}
                style={[s.waitChip, waitMinutes === min && s.waitChipActive]}
                onPress={() => selectWaitTime(min)}
              >
                <Text style={[s.waitChipText, waitMinutes === min && s.waitChipTextActive]}>
                  {min}m
                </Text>
              </Pressable>
            ))}
          </View>
          <Divider />
          <ToggleRow
            label="Accept Direct Bookings"
            sub="Riders can book you directly"
            value={acceptDirectBookings}
            onChange={toggleDirectBookings}
          />
          <Divider />
          <ToggleRow
            label="Allow In-Route Stops"
            sub="Riders can add stops during the ride"
            value={allowInRouteStops}
            onChange={toggleInRouteStops}
          />
        </View>

        {/* ── CASH SETTINGS ── */}
        <SectionHeader label="CASH SETTINGS" />
        <View style={[s.card, shadow.card]}>
          <ToggleRow
            label="Accept Cash Rides"
            sub="Riders can pay in cash"
            value={acceptsCash}
            onChange={toggleCash}
          />
          {acceptsCash && (
            <>
              <Divider />
              <ToggleRow
                label="Cash Only"
                sub="Only accept cash payments"
                value={cashOnly}
                onChange={toggleCashOnly}
              />
            </>
          )}
        </View>

        {/* ── VISIBILITY ── */}
        <SectionHeader label="VISIBILITY" />
        <View style={[s.card, shadow.card]}>
          <ToggleRow
            label="Profile Visible"
            sub="Show your profile in the feed"
            value={profileVisible}
            onChange={toggleProfileVisible}
          />
          <Divider />
          <ToggleRow
            label="LGBTQ+ Friendly"
            sub="Show pride badge on your profile"
            value={lgbtqFriendly}
            onChange={toggleLgbtq}
          />
          <Divider />
          <ToggleRow
            label="FWU"
            sub="Flexible Without Ultimatum — negotiable on price"
            value={fwu}
            onChange={toggleFwu}
          />
        </View>

        {/* ── ADVANCED SETTINGS ── */}
        <SectionHeader label="ADVANCED" />
        <TouchableOpacity
          style={[s.card, s.advancedRow, shadow.card]}
          onPress={() => router.push('/(driver)/advanced-settings')}
          activeOpacity={0.7}
        >
          <View style={s.advancedIcon}>
            <Ionicons name="settings" size={16} color={colors.textFaint} />
          </View>
          <View style={s.advancedText}>
            <Text style={s.advancedLabel}>Advanced Settings</Text>
            <Text style={s.advancedSub}>Pricing, rider gates, Down Bad, schedule, home base</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionLabel}>{label}</Text>
      {hint && <Text style={s.sectionHint}>{hint}</Text>}
    </View>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.fieldRow}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ToggleRow({
  label, sub, value, onChange,
}: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.toggleRow}>
      <View style={s.toggleLabelCol}>
        <Text style={s.toggleLabel}>{label}</Text>
        {sub && <Text style={s.toggleSub}>{sub}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: toggle.trackOff, true: toggle.green.trackOn }}
        thumbColor={value ? toggle.green.thumbOn : toggle.thumbOff}
        ios_backgroundColor={toggle.trackOff}
      />
    </View>
  );
}

function Divider() {
  return <View style={s.divider} />;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  navbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  navTitle: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, letterSpacing: 2 },
  savingSlot: { width: 60, alignItems: 'flex-end' },
  savedText: { fontFamily: fonts.mono, fontSize: 10, color: colors.green, letterSpacing: 1 },

  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },

  sectionHeader: { marginTop: spacing.xl, marginBottom: spacing.sm, paddingHorizontal: 2 },
  sectionLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 3 },
  sectionHint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2 },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },

  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg },

  fieldRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  fieldLabelCol: {},
  fieldLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 2, marginBottom: spacing.sm },
  fieldSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginBottom: spacing.xs },
  textInput: {
    fontFamily: fonts.body, fontSize: 15, color: colors.textPrimary,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderStrong,
  },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  toggleLabelCol: { flex: 1, marginRight: spacing.lg },
  toggleLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  toggleSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2 },

  areaSection: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
  areaHint: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1.5, marginBottom: spacing.lg },
  areaGroup: { marginBottom: spacing.md },
  areaGroupLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2, marginBottom: spacing.sm },
  areaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    backgroundColor: colors.cardAlt, borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  chipText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary },
  chipTextActive: { color: colors.green },

  advancedRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md,
  },
  advancedIcon: {
    width: 32, height: 32, borderRadius: radius.cardInner,
    backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  advancedText: { flex: 1 },
  advancedLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  advancedSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2 },

  waitRow: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
  },
  waitChip: {
    flex: 1, paddingVertical: 10, borderRadius: radius.cardInner,
    alignItems: 'center', backgroundColor: colors.cardAlt,
    borderWidth: 1, borderColor: colors.border,
  },
  waitChipActive: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  waitChipText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary },
  waitChipTextActive: { color: colors.green },
});
