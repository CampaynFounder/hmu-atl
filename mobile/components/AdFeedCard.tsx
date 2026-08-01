// AdFeedCard — a seed advertisement rendered as a promo card in the browse feeds.
// Fed by GET /api/ads/feed. Two layouts: full-bleed `feed` (rider TikTok feed)
// and `compact` (driver find-riders list). Media autoplays via AutoplayVideo.

import { View, Text, TouchableOpacity, StyleSheet, Image, Linking, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { AutoplayVideo } from '@/components/AutoplayVideo';

const { width: SCREEN_W } = Dimensions.get('window');

export interface AdCardData {
  _ad: true;
  id: string;
  headline: string;
  body: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  mediaUrl: string | null;
  posterUrl: string | null;
  mediaType: 'photo' | 'video' | null;
  frequency: number;
}

/** Raw ad shape returned by /api/ads/feed. */
export interface AdApiRow {
  id: string;
  headline: string;
  body: string | null;
  cta_label: string | null;
  cta_url: string | null;
  media_url: string | null;
  poster_url: string | null;
  media_type: 'photo' | 'video' | null;
  frequency: number;
}

export function toAdCard(r: AdApiRow): AdCardData {
  return {
    _ad: true,
    id: r.id,
    headline: r.headline,
    body: r.body,
    ctaLabel: r.cta_label,
    ctaUrl: r.cta_url,
    mediaUrl: r.media_url,
    posterUrl: r.poster_url,
    mediaType: r.media_type,
    frequency: r.frequency,
  };
}

export type FeedItem<T> = T | AdCardData;

export function isAdItem<T>(item: FeedItem<T>): item is AdCardData {
  return (item as AdCardData)._ad === true;
}

/**
 * Interleave ads into a list of items. An ad is inserted after every `cadence`
 * real items, cycling through the available ads. `cadence` is the smallest
 * per-ad frequency so no ad is starved.
 */
export function interleaveAds<T>(items: T[], ads: AdCardData[]): FeedItem<T>[] {
  if (!ads.length || !items.length) return items;
  const cadence = Math.max(1, Math.min(...ads.map((a) => a.frequency || 6)));
  const out: FeedItem<T>[] = [];
  let adIdx = 0;
  items.forEach((item, i) => {
    out.push(item);
    if ((i + 1) % cadence === 0) {
      out.push(ads[adIdx % ads.length]);
      adIdx++;
    }
  });
  return out;
}

export function AdFeedCard({
  ad, height, active = true, compact = false, onPress,
}: {
  ad: AdCardData;
  height?: number;
  active?: boolean;
  compact?: boolean;
  onPress?: (ad: AdCardData) => void;
}) {
  const isVideo = ad.mediaType === 'video' && !!ad.mediaUrl;
  const poster = ad.posterUrl ?? (ad.mediaType === 'photo' ? ad.mediaUrl : null);

  function handlePress() {
    if (onPress) onPress(ad);
    else if (ad.ctaUrl) Linking.openURL(ad.ctaUrl).catch(() => {});
  }

  if (compact) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={handlePress} style={cs.row}>
        {ad.mediaUrl ? (
          isVideo
            ? <View style={cs.thumb}><AutoplayVideo uri={ad.mediaUrl} poster={poster} active={active} /></View>
            : <Image source={{ uri: ad.mediaUrl }} style={cs.thumb} />
        ) : <View style={[cs.thumb, cs.thumbFallback]}><Ionicons name="megaphone" size={18} color={colors.amber} /></View>}
        <View style={{ flex: 1 }}>
          <Text style={cs.badge}>SPONSORED</Text>
          <Text style={cs.headline} numberOfLines={1}>{ad.headline}</Text>
          {ad.body ? <Text style={cs.body} numberOfLines={1}>{ad.body}</Text> : null}
        </View>
        {ad.ctaLabel ? <Text style={[cs.cta, { color: colors.amber }]}>{ad.ctaLabel} →</Text> : null}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[fs.card, { height, width: SCREEN_W }]}>
      {ad.mediaUrl ? (
        isVideo
          ? <AutoplayVideo uri={ad.mediaUrl} poster={poster} active={active} />
          : <Image source={{ uri: ad.mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : <View style={[StyleSheet.absoluteFill, fs.fallback]} />}

      <View style={fs.scrim} />
      <View style={fs.badge}><Ionicons name="megaphone" size={11} color={colors.amber} /><Text style={fs.badgeText}>SPONSORED</Text></View>

      <View style={fs.panel}>
        <Text style={fs.headline}>{ad.headline}</Text>
        {ad.body ? <Text style={fs.body}>{ad.body}</Text> : null}
        {ad.ctaLabel ? (
          <TouchableOpacity style={fs.ctaBtn} activeOpacity={0.85} onPress={handlePress}>
            <Text style={fs.ctaText}>{ad.ctaLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const fs = StyleSheet.create({
  card: { backgroundColor: colors.card, justifyContent: 'flex-end' },
  fallback: { backgroundColor: '#1a1207' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  badge: {
    position: 'absolute', top: spacing.lg, left: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.tag, paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.amberBorder,
  },
  badgeText: { fontFamily: fonts.monoBold, fontSize: 9, color: colors.amber, letterSpacing: 1 },
  panel: { padding: spacing.xl, gap: spacing.sm },
  headline: { fontFamily: fonts.display, fontSize: 30, color: colors.textPrimary, letterSpacing: 0.5 },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, lineHeight: 19 },
  ctaBtn: { marginTop: spacing.sm, backgroundColor: colors.amber, borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: 'center' },
  ctaText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: '#000', letterSpacing: 0.3 },
});

const cs = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md,
    backgroundColor: colors.card, borderRadius: radius.cardInner, borderWidth: 1, borderColor: colors.amberBorder,
  },
  thumb: { width: 52, height: 52, borderRadius: radius.tag, overflow: 'hidden', backgroundColor: '#000' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.amberDim },
  badge: { fontFamily: fonts.monoBold, fontSize: 8, color: colors.amber, letterSpacing: 1, marginBottom: 2 },
  headline: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  body: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary },
  cta: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 0.5 },
});
