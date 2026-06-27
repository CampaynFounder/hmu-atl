// Availability Schedule — day-by-day toggles.
// PATCH /api/users/profile { profile_type: 'driver', schedule: { mon: { available }, ... } }

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Switch, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, spacing, shadow, toggle } from '@/lib/theme';
import { apiClient } from '@/lib/api';

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

type Schedule = Record<string, { available: boolean }>;

interface ProfileData {
  schedule?: Schedule;
}

export default function AvailabilityScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [schedule, setSchedule] = useState<Schedule>({});

  useEffect(() => {
    (async () => {
      try {
        const t = await getToken();
        const d = await apiClient<ProfileData>('/driver/profile', t);
        // Initialise with all days defaulting to available=true if not set
        const base: Schedule = {};
        DAYS.forEach(({ key }) => {
          base[key] = { available: (d.schedule?.[key] as { available?: boolean } | undefined)?.available ?? true };
        });
        setSchedule(base);
      } catch {}
      finally { setLoading(false); }
    })();
  }, [getToken]);

  async function toggleDay(key: string, val: boolean) {
    const next = { ...schedule, [key]: { available: val } };
    setSchedule(next);
    Haptics.selectionAsync();
    setSaving(true);
    try {
      const t = await getToken();
      await apiClient('/users/profile', t, {
        method: 'PATCH',
        body: JSON.stringify({ profile_type: 'driver', schedule: next }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    finally { setSaving(false); }
  }

  const activeDays = DAYS.filter((d) => schedule[d.key]?.available).length;

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
        <Text style={s.navTitle}>AVAILABILITY</Text>
        <View style={s.savingSlot}>
          {saving && <ActivityIndicator size="small" color={colors.green} />}
          {!saving && saved && <Text style={s.savedText}>SAVED</Text>}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.summary}>
          <Text style={s.summaryNum}>{activeDays}</Text>
          <Text style={s.summarySub}>days per week</Text>
        </View>

        <Text style={s.hint}>Shown on your public HMU link so riders know when you drive.</Text>

        <View style={[s.card, shadow.card]}>
          {DAYS.map((day, i) => {
            const active = schedule[day.key]?.available ?? true;
            return (
              <View key={day.key}>
                {i > 0 && <View style={s.divider} />}
                <View style={s.dayRow}>
                  <Text style={[s.dayLabel, !active && s.dayLabelOff]}>{day.label}</Text>
                  <Switch
                    value={active}
                    onValueChange={(v) => toggleDay(day.key, v)}
                    trackColor={{ false: toggle.trackOff, true: toggle.green.trackOn }}
                    thumbColor={active ? toggle.green.thumbOn : toggle.thumbOff}
                    ios_backgroundColor={toggle.trackOff}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
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
  summary: { alignItems: 'center', paddingVertical: spacing.xl },
  summaryNum: { fontFamily: fonts.display, fontSize: 64, color: colors.green, lineHeight: 68 },
  summarySub: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, letterSpacing: 2, marginTop: 4 },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, marginBottom: spacing.lg, lineHeight: 20, textAlign: 'center' },
  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg },
  dayRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  dayLabel: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.textPrimary },
  dayLabelOff: { color: colors.textFaint },
});
