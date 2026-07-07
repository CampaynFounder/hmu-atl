// Rider profile hub — identity card, stats, account nav.
// Loads from GET /api/rider/profile (handle/gender/avatarUrl) + GET /api/rides/history (stats).
//
// The avatar is tappable so a rider can change their profile photo/video any time
// (parity with driver media). Upload reuses the proven XHR + FormData path to
// POST /upload/video (RN fetch+FormData corrupts multipart on Hermes) with
// profile_type=rider + save_to_profile=true, which persists to
// rider_profiles.avatar_url + thumbnail_url server-side.

import { useCallback, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Image, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useStableToken } from '@/hooks/use-stable-token';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient, API_BASE } from '@/lib/api';
import { useUserContext } from '@/contexts/UserContext';
import { AdminSheet } from '@/components/AdminSheet';

// expo-image-picker needs the native module linked (dev/preview build).
let ImagePicker: typeof import('expo-image-picker') | null = null;
try { ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker'); } catch { ImagePicker = null; }

interface RiderProfile {
  handle: string | null;
  gender: string | null;
  avatarUrl: string | null;
  displayName: string | null;
}

interface RideSummary {
  id: string;
  status: string;
  driver_rating: string | null;
}

export default function RiderProfileScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const getToken = useStableToken();
  const { user: clerkUser } = useUser();
  const router = useRouter();
  const { isSuperAdmin } = useUserContext();
  const [adminVisible, setAdminVisible] = useState(false);
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [rides, setRides] = useState<RideSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const hasLoaded = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      const t = await getToken();
      const [p, r] = await Promise.all([
        apiClient<RiderProfile>('/rider/profile', t),
        apiClient<{ rides: RideSummary[] }>('/rides/history', t),
      ]);
      setProfile(p);
      setRides(r.rides ?? []);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
      hasLoaded.current = true;
    }
  }, [getToken]);

  useFocusEffect(useCallback(() => {
    if (!hasLoaded.current) setLoading(true);
    void fetchData();
  }, [fetchData]));

  const onRefresh = useCallback(() => { setRefreshing(true); void fetchData(); }, [fetchData]);

  // Pick a photo or video from the library and upload it as the rider avatar.
  const pickAndUpload = useCallback(async (kind: 'images' | 'videos') => {
    if (!ImagePicker) {
      Alert.alert('Update needed', 'Changing your photo needs the latest app build. Try updating from the App Store.');
      return;
    }
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission required', 'Library access is needed to update your photo.');
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
      const mimeType = asset.mimeType ?? (kind === 'images' ? 'image/jpeg' : 'video/mp4');
      const isVideo = mimeType.startsWith('video/');
      const safeType = (mimeType.startsWith('image/') || isVideo) ? mimeType : 'image/jpeg';
      const fileName = isVideo ? 'media.mp4' : 'photo.jpg';

      setUploadingPhoto(true);
      const t = await getToken();
      if (!t) throw new Error('You need to be signed in. Restart the app.');

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
        // save_to_profile=true persists to rider_profiles.avatar_url + thumbnail_url.
        formData.append('video', { uri: asset.uri, type: safeType, name: fileName } as unknown as Blob);
        formData.append('profile_type', 'rider');
        formData.append('media_type', 'auto');
        formData.append('save_to_profile', 'true');
        xhr.send(formData);
      });

      const url = data.url ?? data.videoUrl ?? null;
      if (!url) throw new Error("Couldn't upload that. Try again.");
      // Optimistic: reflect the new avatar immediately.
      setProfile(p => (p ? { ...p, avatarUrl: url } : { handle: null, gender: null, displayName: null, avatarUrl: url }));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? "Couldn't update your photo. Try again.");
    } finally {
      setUploadingPhoto(false);
    }
  }, [getToken]);

  const changePhoto = useCallback(() => {
    if (uploadingPhoto) return;
    Alert.alert('Update profile photo', 'This is what drivers see when you book.', [
      { text: 'Choose Photo', onPress: () => void pickAndUpload('images') },
      { text: 'Choose Video', onPress: () => void pickAndUpload('videos') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [uploadingPhoto, pickAndUpload]);

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  const handle = profile?.handle ?? 'rider';
  const displayName = profile?.displayName ?? null;
  const completedRides = rides.filter(r => r.status === 'completed').length;
  const pendingRatings = rides.filter(r => r.status === 'ended' && r.driver_rating == null).length;

  // Avatar: R2 URL from rider_profiles → Clerk imageUrl → initials
  const avatarUri = profile?.avatarUrl ?? clerkUser?.imageUrl ?? null;
  const avatarLetter = handle[0]?.toUpperCase() ?? '?';

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
      >
        <Text style={s.pageTitle}>PROFILE</Text>

        {/* Identity card — long press opens super admin sheet */}
        <TouchableOpacity
          activeOpacity={1}
          onLongPress={() => isSuperAdmin && setAdminVisible(true)}
          delayLongPress={600}
        >
        <View style={[s.card, shadow.card]}>
          <TouchableOpacity
            style={s.avatarWrap}
            onPress={changePhoto}
            disabled={uploadingPhoto}
            activeOpacity={0.85}
            accessibilityLabel="Change profile photo"
          >
            {avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                style={s.avatar}
                resizeMode="cover"
              />
            ) : (
              <View style={[s.avatar, s.avatarFallback]}>
                <Text style={s.avatarLetter}>{avatarLetter}</Text>
              </View>
            )}
            {uploadingPhoto ? (
              <View style={[s.avatar, s.avatarUploading]}>
                <ActivityIndicator color={colors.green} />
              </View>
            ) : (
              <View style={s.cameraBadge}>
                <Ionicons name="camera" size={14} color={colors.bg} />
              </View>
            )}
          </TouchableOpacity>
          {displayName && (
            <Text style={s.displayName}>{displayName}</Text>
          )}
          <Text style={s.handle}>@{handle}</Text>
          <View style={s.tierBadge}>
            <Text style={s.tierText}>RIDER</Text>
          </View>
          {isSuperAdmin && (
            <View style={s.superBadge}>
              <Text style={s.superBadgeText}>⚡ SUPER ADMIN</Text>
            </View>
          )}
        </View>
        </TouchableOpacity>
        <AdminSheet visible={adminVisible} onClose={() => setAdminVisible(false)} />

        {/* Stats */}
        <View style={s.statsRow}>
          <StatBox label="RIDES" value={String(completedRides)} />
          <StatBox
            label="RATE"
            value={pendingRatings > 0 ? `${pendingRatings} DUE` : 'ALL DONE'}
            accent={pendingRatings === 0}
          />
        </View>

        {/* Pending ratings prompt */}
        {pendingRatings > 0 && (
          <TouchableOpacity
            style={s.ratePrompt}
            onPress={() => router.push('/(rider)/rides' as never)}
            activeOpacity={0.8}
          >
            <Ionicons name="star-outline" size={14} color={colors.amber} />
            <Text style={s.ratePromptText}>
              {pendingRatings} ride{pendingRatings > 1 ? 's' : ''} waiting for your rating
            </Text>
            <Ionicons name="chevron-forward" size={13} color={colors.amber} />
          </TouchableOpacity>
        )}

        {/* Account nav */}
        <View style={[s.menu, shadow.card]}>
          <Text style={s.sectionLabel}>ACCOUNT</Text>
          <NavRow
            icon="car-outline"
            label="My Rides"
            onPress={() => router.push('/(rider)/rides' as never)}
          />
          <NavRow
            icon="card-outline"
            label="Payment Methods"
            onPress={() => router.push('/(rider)/payment-methods' as never)}
          />
          <NavRow
            icon="help-circle-outline"
            label="Support"
            onPress={() => router.push('/(rider)/support' as never)}
            last
          />
        </View>

        <TouchableOpacity style={s.signOutBtn} onPress={() => signOut()}>
          <Text style={s.signOutText}>SIGN OUT</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.deleteRow}
          onPress={() => router.push('/(rider)/delete-account' as never)}
          activeOpacity={0.7}
        >
          <Text style={s.deleteRowText}>Delete account</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={[s.statBox, accent && s.statBoxAccent]}>
      <Text style={[s.statValue, accent && { color: colors.green }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function NavRow({
  icon, label, badge, onPress, last,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  badge?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <TouchableOpacity style={[s.navRow, last && s.navRowLast]} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={18} color={colors.textTertiary} />
      <Text style={s.navLabel}>{label}</Text>
      {badge && (
        <View style={s.navBadge}>
          <Text style={s.navBadgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: spacing.lg, paddingBottom: 56 },
  loader: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  pageTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.textPrimary, marginBottom: spacing.xl },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xxl, alignItems: 'center',
    marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong,
  },
  avatarWrap: { marginBottom: spacing.md },
  avatar: { width: 76, height: 76, borderRadius: 38 },
  avatarFallback: {
    backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.borderStrong,
  },
  avatarUploading: {
    position: 'absolute', top: 0, left: 0,
    backgroundColor: 'rgba(20,20,20,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.card,
  },
  avatarLetter: { fontFamily: fonts.display, fontSize: 38, color: colors.green },
  displayName: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.textPrimary, marginBottom: 2 },
  handle: { fontFamily: fonts.display, fontSize: 26, color: colors.textPrimary, marginBottom: spacing.xs },
  tierBadge: {
    borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  tierText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1 },
  superBadge: {
    marginTop: spacing.sm, backgroundColor: colors.greenDim, borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: colors.greenBorder,
  },
  superBadgeText: { fontFamily: fonts.mono, fontSize: 9, color: colors.green, letterSpacing: 1 },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statBox: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.cardInner,
    padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  statBoxAccent: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  statValue: { fontFamily: fonts.display, fontSize: 22, color: colors.textPrimary, marginBottom: 2 },
  statLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1 },

  ratePrompt: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.amberDim, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.amberBorder, marginBottom: spacing.lg,
  },
  ratePromptText: { fontFamily: fonts.body, fontSize: 13, color: colors.amber, flex: 1 },

  menu: {
    backgroundColor: colors.card, borderRadius: radius.card,
    marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  sectionLabel: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 2,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs,
  },
  navRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  navRowLast: {},
  navLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  navBadge: {
    backgroundColor: colors.amber, borderRadius: radius.pill,
    width: 18, height: 18, alignItems: 'center', justifyContent: 'center',
  },
  navBadgeText: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.bg },

  signOutBtn: {
    paddingVertical: 15, alignItems: 'center',
    backgroundColor: colors.redDim, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.redBorder,
  },
  signOutText: { fontFamily: fonts.mono, fontSize: 12, color: colors.red, letterSpacing: 1 },

  deleteRow: { paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  deleteRowText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, textDecorationLine: 'underline' },
});
