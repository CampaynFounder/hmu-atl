// Onboarding avatar capture — a tappable circle that lets the user add a PHOTO
// or a VIDEO, which becomes their profile avatar (thumbnail_url). Shared by rider
// + driver onboarding so "require a photo or video" is one consistent surface.
//
// Uploads to /upload/video with save_to_profile=false (the profile row doesn't
// exist yet at onboarding) — the onboarding submit then passes the returned URL
// as thumbnail_url / video_url. Uses XMLHttpRequest + FormData: RN fetch+FormData
// produces a malformed multipart body on Hermes (same path as advanced/media.tsx).
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStableToken } from '@/hooks/use-stable-token';
import { API_BASE } from '@/lib/api';
import { colors, fonts, radius, spacing } from '@/lib/theme';

let ImagePicker: typeof import('expo-image-picker') | null = null;
try { ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker'); } catch { ImagePicker = null; }

export interface CapturedMedia {
  url: string;
  isVideo: boolean;
}

export function AvatarMediaPicker({
  profileType,
  value,
  onChange,
}: {
  profileType: 'rider' | 'driver';
  value: CapturedMedia | null;
  onChange: (m: CapturedMedia | null) => void;
}) {
  const getToken = useStableToken();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(kind: 'images' | 'videos') {
    setError(null);
    if (!ImagePicker) {
      Alert.alert('Update needed', 'Adding a photo or video needs the latest app build.');
      return;
    }
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission required', 'Library access is needed to add your photo or video.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: kind === 'images' ? ['images'] : ['videos'],
        allowsEditing: true,
        quality: 0.8,
        ...(kind === 'videos' ? { videoMaxDuration: 30 } : {}),
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await upload(asset.uri, asset.mimeType ?? (kind === 'images' ? 'image/jpeg' : 'video/mp4'));
    } catch {
      setError('Could not open your library. Try again.');
    }
  }

  async function upload(uri: string, mimeType: string) {
    setBusy(true);
    setError(null);
    try {
      const t = await getToken();
      if (!t) throw new Error('You need to be signed in. Restart the app.');
      const isVideo = mimeType.startsWith('video/');
      const safeType = (mimeType.startsWith('image/') || isVideo) ? mimeType : 'image/jpeg';
      const fileName = isVideo ? 'media.mp4' : 'photo.jpg';

      const data = await new Promise<{ url?: string; videoUrl?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/upload/video`);
        xhr.setRequestHeader('Authorization', `Bearer ${t}`);
        xhr.timeout = 60000;
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('Upload response was invalid. Try again.')); }
            return;
          }
          let msg = "Couldn't upload that. Try again.";
          if (xhr.status === 401 || xhr.status === 403) msg = "You're not signed in properly. Restart the app.";
          else if (xhr.status === 400 || xhr.status === 413) msg = 'That file is too large (50MB max) or unsupported.';
          else if (xhr.status >= 500) msg = 'Something went wrong on our end. Try again in a sec.';
          reject(new Error(msg));
        };
        xhr.onerror = () => reject(new Error('Network error — check your connection.'));
        xhr.ontimeout = () => reject(new Error('Upload timed out. Try a smaller/shorter file.'));

        const formData = new FormData();
        // save_to_profile=false: the profile row is created by the onboarding
        // submit, which persists this URL as thumbnail_url / video_url.
        formData.append('video', { uri, type: safeType, name: fileName } as unknown as Blob);
        formData.append('profile_type', profileType);
        formData.append('media_type', 'auto');
        formData.append('save_to_profile', 'false');
        xhr.send(formData);
      });

      const url = data.url ?? data.videoUrl ?? null;
      if (!url) throw new Error("Couldn't upload that. Try again.");
      onChange({ url, isVideo });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't upload that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.wrap}>
      <View style={s.avatarRow}>
        <View style={s.avatar}>
          {busy ? (
            <ActivityIndicator color={colors.green} />
          ) : value && !value.isVideo ? (
            <Image source={{ uri: value.url }} style={s.avatarImg} resizeMode="cover" alt="" />
          ) : value && value.isVideo ? (
            <Ionicons name="videocam" size={28} color={colors.green} />
          ) : (
            <Ionicons name="camera-outline" size={28} color={colors.textFaint} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{value ? (value.isVideo ? 'Video added' : 'Photo added') : 'Add a photo or video'}</Text>
          <Text style={s.sub}>This is your profile picture — what {profileType === 'driver' ? 'riders' : 'drivers'} see.</Text>
        </View>
      </View>

      <View style={s.btnRow}>
        <TouchableOpacity style={s.btn} onPress={() => pick('images')} disabled={busy} activeOpacity={0.85}>
          <Ionicons name="image-outline" size={15} color={colors.textPrimary} />
          <Text style={s.btnText}>{value && !value.isVideo ? 'Change photo' : 'Photo'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btn} onPress={() => pick('videos')} disabled={busy} activeOpacity={0.85}>
          <Ionicons name="videocam-outline" size={15} color={colors.textPrimary} />
          <Text style={s.btnText}>{value && value.isVideo ? 'Change video' : 'Video'}</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: spacing.md },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 72, height: 72, borderRadius: 36, overflow: 'hidden',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%' },
  title: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  sub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2, lineHeight: 17 },
  btnRow: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: radius.pill,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong,
  },
  btnText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  error: { fontFamily: fonts.body, fontSize: 12, color: colors.red },
});
