// Home Base — set a label + coordinates shown to riders when driver is offline.
// PATCH /api/drivers/home-area { lat, lng, label }
// DELETE /api/drivers/home-area (clear)

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

interface HomeAreaData {
  homeLat?: number | null;
  homeLng?: number | null;
  homeLabel?: string | null;
}

export default function HomeBaseScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [label, setLabel] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [hasHomeBase, setHasHomeBase] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const t = await getToken();
        const d = await apiClient<HomeAreaData>('/driver/profile', t);
        if (d.homeLat && d.homeLng) {
          setLat(String(d.homeLat));
          setLng(String(d.homeLng));
          setLabel(d.homeLabel ?? '');
          setHasHomeBase(true);
        }
      } catch {}
      finally { setLoading(false); }
    })();
  }, [getToken]);

  async function save() {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) {
      Alert.alert('Invalid coordinates', 'Enter valid latitude and longitude values.');
      return;
    }
    if (!label.trim()) {
      Alert.alert('Label required', 'Add a label like "West End" or "Home".');
      return;
    }
    setSaving(true);
    try {
      const t = await getToken();
      await apiClient('/drivers/home-area', t, {
        method: 'PATCH',
        body: JSON.stringify({ lat: latNum, lng: lngNum, label: label.trim() }),
      });
      setHasHomeBase(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    finally { setSaving(false); }
  }

  async function clearHomeBase() {
    Alert.alert('Clear Home Base?', 'Riders won\'t see a home area on your profile.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive', onPress: async () => {
          setSaving(true);
          try {
            const t = await getToken();
            await apiClient('/drivers/home-area', t, { method: 'DELETE' });
            setLat(''); setLng(''); setLabel(''); setHasHomeBase(false);
            Haptics.selectionAsync();
          } catch {}
          finally { setSaving(false); }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.navbar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.navTitle}>HOME BASE</Text>
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
          {hasHomeBase && (
            <View style={s.currentBanner}>
              <Ionicons name="home" size={16} color={colors.pink} />
              <Text style={s.currentText}>Current: {label || 'Home'} ({parseFloat(lat).toFixed(4)}, {parseFloat(lng).toFixed(4)})</Text>
            </View>
          )}

          <Text style={s.hint}>
            Your home base is shown to riders when you're offline, so they know roughly where you start from. Use a neighborhood name, not your exact address.
          </Text>

          <View style={[s.card, shadow.card]}>
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>LABEL</Text>
              <TextInput
                style={s.textInput}
                value={label}
                onChangeText={setLabel}
                placeholder='e.g. "West End" or "Midtown"'
                placeholderTextColor={colors.textFaint}
                returnKeyType="next"
              />
            </View>
            <View style={s.divider} />
            <View style={s.coordRow}>
              <View style={s.coordField}>
                <Text style={s.fieldLabel}>LATITUDE</Text>
                <TextInput
                  style={s.textInput}
                  value={lat}
                  onChangeText={setLat}
                  placeholder="33.7490"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </View>
              <View style={s.coordDivider} />
              <View style={s.coordField}>
                <Text style={s.fieldLabel}>LONGITUDE</Text>
                <TextInput
                  style={s.textInput}
                  value={lng}
                  onChangeText={setLng}
                  placeholder="-84.3880"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
            </View>
          </View>

          <Text style={s.coordHint}>
            Tip: drop a pin in Google Maps → long press → copy coordinates.
          </Text>

          <TouchableOpacity style={s.saveBtn} onPress={save} activeOpacity={0.8} disabled={saving}>
            <Text style={s.saveBtnText}>SAVE HOME BASE</Text>
          </TouchableOpacity>

          {hasHomeBase && (
            <TouchableOpacity style={s.clearBtn} onPress={clearHomeBase} activeOpacity={0.7}>
              <Text style={s.clearBtnText}>Clear Home Base</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
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
  currentBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.pinkDim, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.pinkBorder,
    padding: spacing.md, marginBottom: spacing.md,
  },
  currentText: { fontFamily: fonts.body, fontSize: 13, color: colors.pink, flex: 1 },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, marginBottom: spacing.lg, lineHeight: 20 },
  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  fieldWrap: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  fieldLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 2, marginBottom: spacing.sm },
  textInput: {
    fontFamily: fonts.body, fontSize: 15, color: colors.textPrimary,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderStrong,
  },
  divider: { height: 1, backgroundColor: colors.border },
  coordRow: { flexDirection: 'row' },
  coordField: { flex: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  coordDivider: { width: 1, backgroundColor: colors.border },
  coordHint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: spacing.sm, lineHeight: 18 },
  saveBtn: {
    marginTop: spacing.xl, backgroundColor: colors.green,
    borderRadius: radius.cardInner, padding: spacing.md + 2, alignItems: 'center',
  },
  saveBtnText: { fontFamily: fonts.mono, fontSize: 12, color: '#000', letterSpacing: 1 },
  clearBtn: { marginTop: spacing.md, padding: spacing.md, alignItems: 'center' },
  clearBtnText: { fontFamily: fonts.body, fontSize: 14, color: colors.red },
});
