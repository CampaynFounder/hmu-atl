// Shared Mapbox address autocomplete input — used across all booking forms.
// Handles debounced search, suggestion dropdown, selected state, and optional
// "use my location" button (reverse-geocodes GPS to a validated address).

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Keyboard, ViewStyle, StyleProp,
} from 'react-native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '@/lib/theme';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

export interface ValidatedAddress {
  address: string;
  name: string;
  latitude: number;
  longitude: number;
  mapbox_id: string;
}

interface GeoFeature {
  id: string;
  place_name: string;
  text: string;
  geometry: { coordinates: [number, number] };
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

interface Props {
  label: string;
  placeholder: string;
  value: ValidatedAddress | null;
  onChange: (v: ValidatedAddress | null) => void;
  proximity?: [number, number];
  showLocateMe?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AddressInput({ label, placeholder, value, onChange, proximity, showLocateMe, style }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeoFeature[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value) { setSuggestions([]); return; }
    if (query.length < 3) { setSuggestions([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      const results = await geocodeSearch(query, proximity);
      setSuggestions(results);
      setSearching(false);
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, value, proximity]);

  async function useMyLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = pos.coords;
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&types=address&limit=1`;
      const res = await fetch(url);
      const json = await res.json() as { features?: GeoFeature[] };
      const f = json.features?.[0];
      if (f) {
        onChange(featureToValidated(f));
      } else {
        onChange({ address: 'Current location', name: 'Current location', latitude, longitude, mapbox_id: 'gps' });
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    finally { setLocating(false); }
  }

  if (value) {
    return (
      <View style={[s.wrap, style]}>
        <Text style={s.label}>{label}</Text>
        <View style={s.selectedRow}>
          <Ionicons name="location" size={14} color={colors.green} style={{ marginTop: 1 }} />
          <Text style={s.selectedAddr} numberOfLines={2}>{value.address}</Text>
          <TouchableOpacity onPress={() => { onChange(null); setQuery(''); }} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={colors.textFaint} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.wrap, style]}>
      <Text style={s.label}>{label}</Text>
      <View style={s.inputRow}>
        <Ionicons name="search-outline" size={14} color={colors.textFaint} style={{ marginLeft: spacing.md }} />
        <TextInput
          style={s.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
        />
        {searching && <ActivityIndicator size="small" color={colors.green} style={{ marginRight: spacing.sm }} />}
        {showLocateMe && !searching && (
          <TouchableOpacity
            style={s.locateBtn}
            onPress={useMyLocation}
            disabled={locating}
            hitSlop={8}
          >
            {locating
              ? <ActivityIndicator size="small" color={colors.green} />
              : <Ionicons name="locate" size={17} color={colors.green} />
            }
          </TouchableOpacity>
        )}
      </View>
      {suggestions.length > 0 && (
        <View style={s.suggestions}>
          {suggestions.map((f, i) => (
            <TouchableOpacity
              key={f.id}
              style={[s.suggestion, i === suggestions.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => {
                onChange(featureToValidated(f));
                setSuggestions([]);
                Keyboard.dismiss();
                void Haptics.selectionAsync();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="location-outline" size={12} color={colors.textFaint} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.suggestionName} numberOfLines={1}>{f.text}</Text>
                <Text style={s.suggestionAddr} numberOfLines={1}>{f.place_name}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 3 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.border,
  },
  input: {
    flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary,
    paddingVertical: 12, paddingRight: spacing.md,
  },
  locateBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.xs,
  },
  selectedRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.greenDim, borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1, borderColor: colors.greenBorder, gap: spacing.sm,
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
