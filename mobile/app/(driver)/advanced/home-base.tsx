// Home Base — set a label + coordinates shown to riders when driver is offline.
// PATCH /api/drivers/home-area { lat, lng, label }
// DELETE /api/drivers/home-area (clear)
//
// Drivers set their base by moving an interactive Mapbox map under a fixed
// center pin (the standard "drag the map, pin stays centered" picker), by
// tapping "Use my current location", or by typing coordinates manually. If no
// home base is saved yet we default the map to the device's current location.
// Coordinates throughout @rnmapbox are [longitude, latitude].

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
import * as Location from 'expo-location';
import Mapbox, { MapView, Camera, type MapState } from '@rnmapbox/maps';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
const DARK_STYLE = 'mapbox://styles/mapbox/dark-v11';
// Atlanta city center — the fallback frame until we have a real position.
const DEFAULT_CENTER: [number, number] = [-84.388, 33.749];

interface HomeAreaData {
  homeLat?: number | null;
  homeLng?: number | null;
  homeLabel?: string | null;
}

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

export default function HomeBaseScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [locating, setLocating] = useState(false);

  const [label, setLabel] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [hasHomeBase, setHasHomeBase] = useState(false);
  // Initial camera center — known before first paint so the map opens framed.
  const [center, setCenter] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (MAPBOX_TOKEN) Mapbox.setAccessToken(MAPBOX_TOKEN);
  }, []);

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
          setCenter([d.homeLng, d.homeLat]);
          return;
        }
        // No saved base → default to the device's current location.
        await useCurrentLocation(true);
      } catch {}
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken]);

  // Read the map's center coordinate after a pan/zoom settles and treat it as
  // the chosen home base. Fires only on idle, so typing in the fields (which
  // never moves the camera) never fights the map.
  function onMapIdle(state: MapState) {
    const c = state?.properties?.center;
    if (!Array.isArray(c) || c.length < 2) return;
    setLng(String(r5(c[0])));
    setLat(String(r5(c[1])));
  }

  async function useCurrentLocation(silent = false) {
    if (!silent) {
      setLocating(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        if (!silent) Alert.alert('Location off', 'Enable location access to drop your home base on the map.');
        if (!center) setCenter(DEFAULT_CENTER);
        return;
      }
      const loc = (await Location.getLastKnownPositionAsync())
        ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const next: [number, number] = [loc.coords.longitude, loc.coords.latitude];
      setCenter((prev) => prev ?? next);
      setLng(String(r5(next[0])));
      setLat(String(r5(next[1])));
      cameraRef.current?.setCamera({ centerCoordinate: next, zoomLevel: 13, animationDuration: silent ? 0 : 600 });
    } catch {
      if (!center) setCenter(DEFAULT_CENTER);
    } finally {
      if (!silent) setLocating(false);
    }
  }

  // Recenter the map on manually-typed coordinates.
  function centerOnTypedCoords() {
    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    if (isNaN(la) || isNaN(ln)) {
      Alert.alert('Invalid coordinates', 'Enter valid latitude and longitude values first.');
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    cameraRef.current?.setCamera({ centerCoordinate: [ln, la], zoomLevel: 14, animationDuration: 500 });
  }

  async function save() {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) {
      Alert.alert('Invalid coordinates', 'Move the map or enter valid latitude and longitude values.');
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
            setLabel(''); setHasHomeBase(false);
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
          <Text style={s.hint}>
            Move the map to set your home base — riders see roughly where you start
            from when you're offline. Use a neighborhood, not your exact address.
          </Text>

          {/* Interactive map picker — center pin marks the chosen spot. */}
          <View style={[s.mapCard, shadow.card]}>
            {MAPBOX_TOKEN ? (
              <View style={s.mapWrap}>
                <MapView
                  style={StyleSheet.absoluteFill}
                  styleURL={DARK_STYLE}
                  scaleBarEnabled={false}
                  attributionEnabled={false}
                  logoEnabled={false}
                  compassEnabled={false}
                  onMapIdle={onMapIdle}
                >
                  <Camera
                    ref={cameraRef}
                    defaultSettings={{ centerCoordinate: center ?? DEFAULT_CENTER, zoomLevel: 13 }}
                  />
                </MapView>
                {/* Fixed center pin — the map slides beneath it. */}
                <View pointerEvents="none" style={s.pinWrap}>
                  <Ionicons name="location" size={38} color={colors.pink} />
                  <View style={s.pinDot} />
                </View>
                {/* Locate me */}
                <TouchableOpacity style={s.locateBtn} onPress={() => useCurrentLocation()} activeOpacity={0.85} disabled={locating}>
                  {locating
                    ? <ActivityIndicator size="small" color={colors.green} />
                    : <Ionicons name="locate" size={18} color={colors.green} />}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[s.mapWrap, s.mapFallback]}>
                <Ionicons name="map-outline" size={28} color={colors.textFaint} />
                <Text style={s.mapFallbackText}>Map unavailable — enter coordinates below</Text>
              </View>
            )}
            <View style={s.coordReadout}>
              <Ionicons name="navigate" size={13} color={colors.textTertiary} />
              <Text style={s.coordReadoutText}>
                {lat && lng ? `${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}` : 'Move the map to choose'}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={s.currentBtn} onPress={() => useCurrentLocation()} activeOpacity={0.8} disabled={locating}>
            <Ionicons name="locate-outline" size={16} color={colors.green} />
            <Text style={s.currentBtnText}>{locating ? 'LOCATING…' : 'USE MY CURRENT LOCATION'}</Text>
          </TouchableOpacity>

          {/* Label + manual coordinate entry */}
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
                  keyboardType="numbers-and-punctuation"
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
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="done"
                  onSubmitEditing={centerOnTypedCoords}
                />
              </View>
            </View>
          </View>

          <TouchableOpacity style={s.centerCoordBtn} onPress={centerOnTypedCoords} activeOpacity={0.7}>
            <Ionicons name="pin-outline" size={14} color={colors.textTertiary} />
            <Text style={s.centerCoordText}>Center map on typed coordinates</Text>
          </TouchableOpacity>

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
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, marginBottom: spacing.lg, lineHeight: 20 },

  mapCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  mapWrap: { height: 240, backgroundColor: colors.cardAlt },
  mapFallback: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  mapFallbackText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },
  pinWrap: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    // Lift the pin so its tip sits on the true center.
    paddingBottom: 38,
  },
  pinDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.pink, marginTop: -6 },
  locateBtn: {
    position: 'absolute', right: spacing.md, bottom: spacing.md,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.greenBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  coordReadout: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  coordReadoutText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary, letterSpacing: 0.5 },

  currentBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    marginTop: spacing.md, paddingVertical: spacing.md,
    borderRadius: radius.cardInner, backgroundColor: colors.greenDim,
    borderWidth: 1, borderColor: colors.greenBorder,
  },
  currentBtnText: { fontFamily: fonts.mono, fontSize: 12, color: colors.green, letterSpacing: 1 },

  card: {
    marginTop: spacing.lg,
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

  centerCoordBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: spacing.md, paddingVertical: spacing.sm,
  },
  centerCoordText: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary },

  saveBtn: {
    marginTop: spacing.md, backgroundColor: colors.green,
    borderRadius: radius.cardInner, padding: spacing.md + 2, alignItems: 'center',
  },
  saveBtnText: { fontFamily: fonts.mono, fontSize: 12, color: '#000', letterSpacing: 1 },
  clearBtn: { marginTop: spacing.md, padding: spacing.md, alignItems: 'center' },
  clearBtnText: { fontFamily: fonts.body, fontSize: 14, color: colors.red },
});
