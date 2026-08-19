// Avatar — the one place profile avatars render. If the avatar URL is a VIDEO
// (a user uploaded a video avatar → stored as an .mp4 in thumbnail_url), it
// autoplays muted + looping in the round frame; otherwise it's a normal image
// with an initials fallback. Use this everywhere an avatar is shown so a video
// avatar plays consistently (profile, comments, find-riders, active ride, chat).

import { View, StyleSheet, type StyleProp, type ViewStyle, type ImageStyle } from 'react-native';
import { HmuImage } from '@/components/HmuImage';
import { AutoplayVideo } from '@/components/AutoplayVideo';
import { colors } from '@/lib/theme';

/** True when the URL points at a video the avatar should autoplay. */
export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const path = url.split('?')[0].toLowerCase();
  return /\.(mp4|mov|m4v|webm|3gp)$/.test(path) || path.includes('/videos/');
}

export function Avatar({
  uri, size = 40, fallbackInitials, active = true, style,
}: {
  uri: string | null | undefined;
  size?: number;
  fallbackInitials?: string;
  /** Only the on-screen avatar should play video (battery/bandwidth). Default true. */
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const round: ViewStyle = { width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colors.cardAlt };

  if (isVideoUrl(uri)) {
    return (
      <View style={[round, style]}>
        <AutoplayVideo uri={uri as string} active={active} />
      </View>
    );
  }

  return (
    <HmuImage
      uri={uri ?? undefined}
      style={[round, style] as unknown as StyleProp<ImageStyle>}
      fallbackInitials={fallbackInitials}
    />
  );
}

// (kept for callers that want just the round frame style)
export const avatarStyles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: colors.cardAlt },
});
