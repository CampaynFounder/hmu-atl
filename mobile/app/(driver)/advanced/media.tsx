// Media & Video — native CRUD for the driver's profile media:
//   • Intro Video      → driver_profiles.video_url
//   • Vibe on File      → driver_profiles.vibe_video_url   (6-sec selfie reel)
//   • Cover Photo / Ad  → driver_profiles.thumbnail_url + vehicle_info.photo_url
//
// READ   GET  /driver/profile           → { media: { videoUrl, vibeVideoUrl, coverPhotoUrl } }
// CREATE/UPDATE  POST /upload/video      (multipart: video, profile_type=driver, media_type)
//                auto-saves the URL to the right column (save_to_profile defaults true)
// DELETE POST /driver/profile { clearMedia: 'video' | 'vibe' | 'cover' }
//
// Upload uses XMLHttpRequest + FormData — RN's fetch+FormData produces a
// malformed multipart body on Hermes. Same proven path as book/down-bad.tsx.

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image,
  ActivityIndicator, Linking, Alert, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient, API_BASE } from '@/lib/api';

// expo-image-picker needs the native module linked (dev/preview build).
let ImagePicker: typeof import('expo-image-picker') | null = null;
try {
  ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
} catch { ImagePicker = null; }

type MediaKind = 'video' | 'vibe' | 'photo';
type ClearKind = 'video' | 'vibe' | 'cover';

interface DriverMedia {
  videoUrl: string | null;
  vibeVideoUrl: string | null;
  coverPhotoUrl: string | null;
}

interface MediaTypeDef {
  kind: MediaKind;
  clear: ClearKind;
  field: keyof DriverMedia;
  pick: 'images' | 'videos';
  maxDurationSec?: number;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  bg: string;
  label: string;
  sub: string;
  isPhoto: boolean;
}

const MEDIA_TYPES: MediaTypeDef[] = [
  {
    kind: 'video', clear: 'video', field: 'videoUrl', pick: 'videos',
    icon: 'videocam', color: colors.blue, bg: colors.blueDim,
    label: 'Intro Video',
    sub: 'Plays on your public HMU link. Show off your vibe, your car, your style.',
    isPhoto: false,
  },
  {
    kind: 'vibe', clear: 'vibe', field: 'vibeVideoUrl', pick: 'videos', maxDurationSec: 6,
    icon: 'sparkles', color: colors.amber, bg: colors.amberDim,
    label: 'Vibe on File',
    sub: 'A 6-second selfie reel. Earns you a Vibe badge on your profile.',
    isPhoto: false,
  },
  {
    kind: 'photo', clear: 'cover', field: 'coverPhotoUrl', pick: 'images',
    icon: 'image', color: colors.pink, bg: colors.pinkDim,
    label: 'Cover Photo / Ad',
    sub: 'Shown on your HMU link. Use your vehicle, a promo, or an ad.',
    isPhoto: true,
  },
];

export default function MediaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();

  const [media, setMedia] = useState<DriverMedia>({ videoUrl: null, vibeVideoUrl: null, coverPhotoUrl: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<MediaKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchMedia = useCallback(async () => {
    try {
      const t = await getToken();
      const d = await apiClient<{ media?: DriverMedia }>('/driver/profile', t);
      if (d.media) setMedia(d.media);
    } catch { /* keep prior */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [getToken]);

  useEffect(() => { void fetchMedia(); }, [fetchMedia]);

  async function pickAndUpload(def: MediaTypeDef) {
    setError(null);
    if (!ImagePicker) {
      Alert.alert('Update needed', 'Media upload needs the latest app build. Try updating from the App Store, or manage media on the web.');
      return;
    }
    try {
      const perm = def.isPhoto
        ? await ImagePicker.requestMediaLibraryPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission required', 'Library access is needed to add media to your profile.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: def.pick === 'images' ? ['images'] : ['videos'],
        allowsEditing: true,
        quality: 0.8,
        ...(def.maxDurationSec ? { videoMaxDuration: def.maxDurationSec } : {}),
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const fallbackMime = def.isPhoto ? 'image/jpeg' : 'video/mp4';
      await uploadMedia(def, asset.uri, asset.mimeType ?? fallbackMime);
    } catch {
      setError('Could not open your library. Try again.');
    }
  }

  async function uploadMedia(def: MediaTypeDef, uri: string, mimeType: string) {
    setBusy(def.kind);
    setError(null);
    try {
      const t = await getToken();
      if (!t) throw new Error('You need to be signed in. Restart the app.');
      const isVideo = mimeType.startsWith('video/');
      const safeType = (mimeType.startsWith('image/') || isVideo) ? mimeType : (def.isPhoto ? 'image/jpeg' : 'video/mp4');
      const fileName = safeType.startsWith('video/') ? 'media.mp4' : 'photo.jpg';

      const data = await new Promise<{ url?: string; videoUrl?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/upload/video`);
        xhr.setRequestHeader('Authorization', `Bearer ${t}`);
        xhr.timeout = 60000;
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); }
            catch { reject(new Error('Upload response was invalid. Try again.')); }
            return;
          }
          let msg = "Couldn't upload that. Try again.";
          if (xhr.status === 401 || xhr.status === 403) msg = "You're not signed in properly. Restart the app.";
          else if (xhr.status === 400 || xhr.status === 413) msg = 'That file is too large (50MB max) or unsupported.';
          else if (xhr.status >= 500) msg = 'Something went wrong on our end. Try again in a sec.';
          else { try { const b = JSON.parse(xhr.responseText); if (b?.error) msg = b.error; } catch {} }
          reject(new Error(msg));
        };
        xhr.onerror = () => reject(new Error('Network error — check your connection.'));
        xhr.ontimeout = () => reject(new Error('Upload timed out. Try a smaller/shorter file.'));

        const formData = new FormData();
        formData.append('video', { uri, type: safeType, name: fileName } as any);
        formData.append('profile_type', 'driver');
        formData.append('media_type', def.kind);
        formData.append('save_to_profile', 'true');
        xhr.send(formData);
      });

      const url = data.url ?? data.videoUrl ?? null;
      setMedia((m) => ({ ...m, [def.field]: url }));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't upload that. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function removeMedia(def: MediaTypeDef) {
    Alert.alert(`Remove ${def.label}?`, 'Riders will no longer see this on your HMU link.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          setBusy(def.kind);
          setError(null);
          try {
            const t = await getToken();
            await apiClient('/driver/profile', t, {
              method: 'POST',
              body: JSON.stringify({ clearMedia: def.clear }),
            });
            setMedia((m) => ({ ...m, [def.field]: null }));
            Haptics.selectionAsync();
          } catch {
            setError('Could not remove that. Try again.');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.navTitle}>MEDIA & VIDEO</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.green} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void fetchMedia(); }} tintColor={colors.green} />}
        >
          <Text style={s.hint}>
            Add media straight from your phone. Riders see these on your public HMU link.
          </Text>

          {error && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={14} color={colors.red} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {MEDIA_TYPES.map((def) => {
            const url = media[def.field];
            const isBusy = busy === def.kind;
            return (
              <View key={def.kind} style={[s.card, shadow.card]}>
                <View style={s.cardHead}>
                  <View style={[s.iconWrap, { backgroundColor: def.bg }]}>
                    <Ionicons name={def.icon} size={18} color={def.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowLabel}>{def.label}</Text>
                    <Text style={s.rowSub}>{def.sub}</Text>
                  </View>
                  {url ? (
                    <View style={s.statusOn}>
                      <Ionicons name="checkmark-circle" size={13} color={colors.green} />
                      <Text style={s.statusOnText}>ADDED</Text>
                    </View>
                  ) : (
                    <Text style={s.statusOff}>NONE</Text>
                  )}
                </View>

                {/* Preview */}
                {url && def.isPhoto && (
                  <Image source={{ uri: url }} style={s.preview} resizeMode="cover" alt="" />
                )}
                {url && !def.isPhoto && (
                  <TouchableOpacity style={s.videoPreview} activeOpacity={0.85} onPress={() => Linking.openURL(url)}>
                    <Ionicons name="play-circle" size={34} color={def.color} />
                    <Text style={s.videoPreviewText}>Tap to preview</Text>
                  </TouchableOpacity>
                )}

                {/* Actions */}
                <View style={s.actions}>
                  <TouchableOpacity
                    style={[s.actionBtn, s.actionPrimary, isBusy && s.disabled]}
                    onPress={() => pickAndUpload(def)}
                    disabled={isBusy}
                    activeOpacity={0.85}
                  >
                    {isBusy
                      ? <ActivityIndicator size="small" color={colors.bg} />
                      : (
                        <>
                          <Ionicons name={url ? 'refresh' : 'add'} size={15} color={colors.bg} />
                          <Text style={s.actionPrimaryText}>{url ? 'REPLACE' : 'ADD'}</Text>
                        </>
                      )}
                  </TouchableOpacity>
                  {url && (
                    <TouchableOpacity
                      style={[s.actionBtn, s.actionDanger, isBusy && s.disabled]}
                      onPress={() => removeMedia(def)}
                      disabled={isBusy}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="trash-outline" size={15} color={colors.red} />
                      <Text style={s.actionDangerText}>REMOVE</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}

          <TouchableOpacity
            style={s.webLink}
            onPress={() => Linking.openURL('https://atl.hmucashride.com/driver/profile')}
            activeOpacity={0.7}
          >
            <Ionicons name="open-outline" size={13} color={colors.textTertiary} />
            <Text style={s.webLinkText}>Also manageable on the web</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, marginBottom: spacing.lg, lineHeight: 20 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.redDim, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.redBorder,
    padding: spacing.md, marginBottom: spacing.md,
  },
  errorText: { fontFamily: fonts.body, fontSize: 13, color: colors.red, flex: 1 },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconWrap: {
    width: 36, height: 36, borderRadius: radius.cardInner,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rowLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  rowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2, lineHeight: 18 },
  statusOn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statusOnText: { fontFamily: fonts.mono, fontSize: 9, color: colors.green, letterSpacing: 1 },
  statusOff: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1 },

  preview: {
    width: '100%', height: 150, borderRadius: radius.cardInner,
    marginTop: spacing.md, backgroundColor: colors.cardAlt,
  },
  videoPreview: {
    height: 88, borderRadius: radius.cardInner, marginTop: spacing.md,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  videoPreviewText: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: radius.pill,
  },
  actionPrimary: { backgroundColor: colors.green },
  actionPrimaryText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.bg, letterSpacing: 1 },
  actionDanger: { backgroundColor: colors.redDim, borderWidth: 1, borderColor: colors.redBorder },
  actionDangerText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.red, letterSpacing: 1 },
  disabled: { opacity: 0.5 },

  webLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: spacing.md, paddingVertical: spacing.sm,
  },
  webLinkText: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary },
});
