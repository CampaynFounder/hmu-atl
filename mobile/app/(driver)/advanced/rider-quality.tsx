// Rider Quality Gates — min chill score, OG-only, advance notice.
// All fields PATCH /api/drivers/booking-settings.

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Switch, ActivityIndicator, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, spacing, shadow, toggle } from '@/lib/theme';
import { apiClient } from '@/lib/api';

const NOTICE_OPTS = [0, 1, 2, 3, 4, 6, 8, 12, 24];
const CHILL_STEPS = [0, 50, 60, 70, 80, 90, 100];

interface BookingSettings {
  minRiderChillScore: number;
  requireOgStatus: boolean;
  advanceNoticeHours: number;
}

export default function RiderQualityScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [minChill, setMinChill] = useState(0);
  const [ogOnly, setOgOnly] = useState(false);
  const [advanceHours, setAdvanceHours] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const t = await getToken();
        const d = await apiClient<BookingSettings>('/drivers/booking-settings', t);
        setMinChill(d.minRiderChillScore ?? 0);
        setOgOnly(d.requireOgStatus ?? false);
        setAdvanceHours(d.advanceNoticeHours ?? 0);
      } catch {}
      finally { setLoading(false); }
    })();
  }, [getToken]);

  async function save(patch: Partial<{ min_rider_chill_score: number; require_og_status: boolean; advance_notice_hours: number }>) {
    setSaving(true);
    try {
      const t = await getToken();
      await apiClient('/drivers/booking-settings', t, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      Haptics.selectionAsync();
    } catch {}
    finally { setSaving(false); }
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
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.navTitle}>RIDER QUALITY</Text>
        <View style={s.savingSlot}>
          {saving && <ActivityIndicator size="small" color={colors.green} />}
          {!saving && saved && <Text style={s.savedText}>SAVED</Text>}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Min Chill Score */}
        <SectionHeader label="MIN CHILL SCORE" hint="Only show your profile to riders at or above this score. 0 = no gate." />
        <View style={[s.card, shadow.card]}>
          <View style={s.chillDisplay}>
            <Text style={s.chillValue}>{minChill === 0 ? 'OFF' : `${minChill}%`}</Text>
            <Text style={s.chillSub}>{minChill === 0 ? 'All riders can book you' : `Only riders ${minChill}%+ Chill Score`}</Text>
          </View>
          <View style={s.chillRow}>
            {CHILL_STEPS.map((v) => (
              <Pressable
                key={v}
                style={[s.chip, minChill === v && s.chipActive]}
                onPress={() => { setMinChill(v); save({ min_rider_chill_score: v }); }}
              >
                <Text style={[s.chipText, minChill === v && s.chipTextActive]}>
                  {v === 0 ? 'OFF' : `${v}%`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* OG Riders Only */}
        <SectionHeader label="OG RIDERS ONLY" hint="Require 10+ completed rides and zero disputes." />
        <View style={[s.card, shadow.card]}>
          <View style={s.toggleRow}>
            <View style={s.toggleLabelCol}>
              <Text style={s.toggleLabel}>OG Riders Only</Text>
              <Text style={s.toggleSub}>10+ rides, 0 disputes</Text>
            </View>
            <Switch
              value={ogOnly}
              onValueChange={(v) => { setOgOnly(v); save({ require_og_status: v }); }}
              trackColor={{ false: toggle.trackOff, true: toggle.green.trackOn }}
              thumbColor={ogOnly ? toggle.green.thumbOn : toggle.thumbOff}
              ios_backgroundColor={toggle.trackOff}
            />
          </View>
        </View>

        {/* Advance Notice */}
        <SectionHeader label="ADVANCE NOTICE" hint="How far ahead riders must book. 0 = instant bookings OK." />
        <View style={[s.card, shadow.card]}>
          <View style={s.noticeGrid}>
            {NOTICE_OPTS.map((h) => (
              <Pressable
                key={h}
                style={[s.noticeChip, advanceHours === h && s.chipActive]}
                onPress={() => { setAdvanceHours(h); save({ advance_notice_hours: h }); }}
              >
                <Text style={[s.chipText, advanceHours === h && s.chipTextActive]}>
                  {h === 0 ? 'Now' : h === 1 ? '1 hr' : `${h} hrs`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionLabel}>{label}</Text>
      {hint && <Text style={s.sectionHint}>{hint}</Text>}
    </View>
  );
}

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
  sectionHint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 4, lineHeight: 18 },
  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  chillDisplay: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.md },
  chillValue: { fontFamily: fonts.display, fontSize: 48, color: colors.green },
  chillSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, marginTop: 4 },
  chillRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.lg,
    justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  toggleLabelCol: { flex: 1, marginRight: spacing.lg },
  toggleLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  toggleSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2 },
  noticeGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    padding: spacing.lg,
  },
  chip: {
    backgroundColor: colors.cardAlt, borderRadius: radius.pill,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  noticeChip: {
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  chipText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary },
  chipTextActive: { color: colors.green },
});
