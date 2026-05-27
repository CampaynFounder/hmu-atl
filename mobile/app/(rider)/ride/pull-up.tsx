// Rider pull-up detail screen — submit exact pickup + dropoff after driver accepts.
// Route: /(rider)/ride/pull-up?rideId=<uuid>
// Calls POST /api/rides/{rideId}/coo with validated Mapbox addresses.
// Fires the Ably 'coo' event which updates the driver's active ride card in real-time.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, FlatList, Keyboard,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

interface GeoFeature {
  id: string;
  place_name: string;
  text: string;
  geometry: { coordinates: [number, number] };
}

interface ValidatedAddress {
  address: string;
  name: string;
  latitude: number;
  longitude: number;
  mapbox_id: string;
}

async function geocodeSearch(query: string, proximity?: [number, number]): Promise<GeoFeature[]> {
  if (query.length < 3 || !MAPBOX_TOKEN) return [];
  const prox = proximity ? `${proximity[0]},${proximity[1]}` : 'ip';
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&types=address,poi&country=US&limit=5&proximity=${prox}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json() as { features?: GeoFeature[] };
    return json.features ?? [];
  } catch {
    return [];
  }
}

function featureToValidated(f: GeoFeature): ValidatedAddress {
  return {
    address: f.place_name,
    name: f.text,
    latitude: f.geometry.coordinates[1],
    longitude: f.geometry.coordinates[0],
    mapbox_id: f.id,
  };
}

// ── Address input with autocomplete ──────────────────────────────────────────

function AddressInput({
  label,
  placeholder,
  selected,
  onSelect,
  onClear,
  proximity,
  rightSlot,
}: {
  label: string;
  placeholder: string;
  selected: ValidatedAddress | null;
  onSelect: (a: ValidatedAddress) => void;
  onClear: () => void;
  proximity?: [number, number];
  rightSlot?: React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeoFeature[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selected) { setSuggestions([]); return; }
    if (query.length < 3) { setSuggestions([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      const results = await geocodeSearch(query, proximity);
      setSuggestions(results);
      setSearching(false);
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, selected, proximity]);

  if (selected) {
    return (
      <View style={ai.wrap}>
        <Text style={ai.label}>{label}</Text>
        <View style={ai.selectedRow}>
          <Ionicons name="location" size={14} color={colors.green} style={{ marginTop: 1 }} />
          <Text style={ai.selectedAddr} numberOfLines={2}>{selected.address}</Text>
          <TouchableOpacity onPress={() => { onClear(); setQuery(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.textFaint} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={ai.wrap}>
      <Text style={ai.label}>{label}</Text>
      <View style={ai.inputRow}>
        <Ionicons name="search-outline" size={14} color={colors.textFaint} style={{ marginLeft: spacing.md }} />
        <TextInput
          style={ai.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
        />
        {rightSlot}
        {searching && <ActivityIndicator size="small" color={colors.green} style={{ marginRight: spacing.md }} />}
      </View>
      {suggestions.length > 0 && (
        <View style={ai.suggestions}>
          {suggestions.map((f, i) => (
            <TouchableOpacity
              key={f.id}
              style={[ai.suggestion, i === suggestions.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => {
                onSelect(featureToValidated(f));
                setSuggestions([]);
                Keyboard.dismiss();
                Haptics.selectionAsync();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="location-outline" size={12} color={colors.textFaint} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={ai.suggestionName} numberOfLines={1}>{f.text}</Text>
                <Text style={ai.suggestionAddr} numberOfLines={1}>{f.place_name}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PullUpScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();

  const [pickup, setPickup] = useState<ValidatedAddress | null>(null);
  const [dropoff, setDropoff] = useState<ValidatedAddress | null>(null);
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status === 'granted') {
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(pos => {
          setUserCoords([pos.coords.longitude, pos.coords.latitude]);
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  async function useMyLocation() {
    setGettingLocation(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setError('Location permission denied'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = pos.coords;
      // Reverse geocode to get an address
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&types=address&limit=1`;
      const res = await fetch(url);
      const json = await res.json() as { features?: GeoFeature[] };
      const f = json.features?.[0];
      if (f) {
        setPickup(featureToValidated(f));
        setUserCoords([longitude, latitude]);
      } else {
        setPickup({ address: 'Current location', name: 'Current location', latitude, longitude, mapbox_id: 'gps' });
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message ?? 'Could not get location');
    } finally {
      setGettingLocation(false);
    }
  }

  async function submit() {
    if (!pickup || !dropoff || !rideId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const t = await getToken();
      await apiClient(`/rides/${rideId}/coo`, t, {
        method: 'POST',
        body: JSON.stringify({
          lat: pickup.latitude,
          lng: pickup.longitude,
          locationText: pickup.address,
          validatedPickup: pickup,
          validatedDropoff: dropoff,
        }),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/(rider)/ride/${rideId}` as any);
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit details');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !!pickup && !!dropoff && !submitting;

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Navbar */}
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={s.navTitle}>PULL UP DETAILS</Text>
          <Text style={s.navSub}>Share your exact location</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[s.card, shadow.card]}>
          <Text style={s.cardLabel}>YOUR RIDE</Text>
          <Text style={s.cardBody}>
            Your driver accepted — now share your exact pickup and dropoff so they can navigate directly to you.
          </Text>
        </View>

        {/* Pickup */}
        <View style={[s.card, shadow.card]}>
          <AddressInput
            label="PICKUP"
            placeholder="Where are you?"
            selected={pickup}
            onSelect={setPickup}
            onClear={() => setPickup(null)}
            proximity={userCoords ?? undefined}
            rightSlot={
              <TouchableOpacity
                style={s.locationBtn}
                onPress={useMyLocation}
                disabled={gettingLocation}
                activeOpacity={0.7}
              >
                {gettingLocation
                  ? <ActivityIndicator size="small" color={colors.green} />
                  : <Ionicons name="locate" size={16} color={colors.green} />
                }
              </TouchableOpacity>
            }
          />
        </View>

        {/* Dropoff */}
        <View style={[s.card, shadow.card]}>
          <AddressInput
            label="DROPOFF"
            placeholder="Where are you going?"
            selected={dropoff}
            onSelect={setDropoff}
            onClear={() => setDropoff(null)}
            proximity={userCoords ?? undefined}
          />
        </View>

        {error && (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle" size={14} color={colors.red} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

      {/* Submit */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
          onPress={submit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator size="small" color={colors.bg} />
            : <Text style={[s.submitLabel, !canSubmit && { color: colors.textFaint }]}>
                {!pickup ? 'ENTER PICKUP FIRST' : !dropoff ? 'ENTER DROPOFF' : 'SEND TO DRIVER'}
              </Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  navbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.pill, backgroundColor: colors.cardAlt,
    borderWidth: 1, borderColor: colors.border,
  },
  navTitle: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, letterSpacing: 2 },
  navSub: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1, marginTop: 2 },

  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  cardLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 3, marginBottom: spacing.sm },
  cardBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, lineHeight: 22 },

  locationBtn: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.xs,
  },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.redDim, borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1, borderColor: colors.redBorder,
    marginBottom: spacing.md,
  },
  errorText: { fontFamily: fonts.body, fontSize: 13, color: colors.red, flex: 1 },

  footer: {
    paddingHorizontal: spacing.xl, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  submitBtn: {
    backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: 16, alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: colors.cardAlt },
  submitLabel: { fontFamily: fonts.mono, fontSize: 13, color: colors.bg, letterSpacing: 2 },
});

const ai = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 3 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  input: {
    flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary,
    paddingVertical: 12, paddingRight: spacing.md,
  },
  selectedRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.greenDim, borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1, borderColor: colors.greenBorder,
    gap: spacing.sm,
  },
  selectedAddr: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.textPrimary, lineHeight: 20 },
  suggestions: {
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginTop: 4,
  },
  suggestion: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  suggestionName: { fontFamily: fonts.body, fontSize: 13, color: colors.textPrimary },
  suggestionAddr: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, marginTop: 2 },
});
