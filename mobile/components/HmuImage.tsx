// HmuImage — drop-in Image replacement with memory+disk caching via expo-image.
// Falls back to RN Image on older builds that predate the native module.
// Usage: <HmuImage uri={url} style={...} />

import { Image as RNImage, ImageStyle, StyleProp, View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '@/lib/theme';

// Guard: expo-image requires a native rebuild; safely degrade if not yet linked.
let ExpoImage: typeof import('expo-image').Image | null = null;
try {
  ExpoImage = require('expo-image').Image;
} catch {
  // Not yet in native build — fall back to RN Image.
}

interface Props {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  // Shown when uri is absent — first 1-2 chars of a name
  fallbackInitials?: string;
  fallbackBg?: string;
}

export function HmuImage({ uri, style, resizeMode = 'cover', fallbackInitials, fallbackBg }: Props) {
  if (!uri) {
    if (fallbackInitials) {
      return (
        <View style={[style as any, s.fallback, fallbackBg ? { backgroundColor: fallbackBg } : {}]}>
          <Text style={s.initials}>{fallbackInitials.slice(0, 2).toUpperCase()}</Text>
        </View>
      );
    }
    return <View style={[style as any, s.fallback]} />;
  }

  if (ExpoImage) {
    return (
      <ExpoImage
        source={{ uri }}
        style={style as any}
        contentFit={resizeMode === 'contain' ? 'contain' : 'cover'}
        cachePolicy="memory-disk"
        transition={150}
        recyclingKey={uri}
      />
    );
  }

  // Fallback to standard RN Image
  return <RNImage source={{ uri }} style={style} resizeMode={resizeMode} />;
}

const s = StyleSheet.create({
  fallback: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.textFaint,
  },
});
