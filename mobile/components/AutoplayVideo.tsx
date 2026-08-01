// AutoplayVideo — muted, looping, autoplaying video for browse/feed/ad cards.
// Extracted from the blast-deck CardVideo pattern so every surface plays video
// the same way. Only the visible card should mount/activate this (pass
// `active`) to save battery + bandwidth; off-screen cards show the poster only.
//
// Fabric note (see mobile/AGENTS.md): never animate SVG/native props here —
// expo-video's VideoView is a native view and plays fine, but keep it static.

import { useEffect } from 'react';
import { View, Image, StyleSheet, type ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

export function AutoplayVideo({
  uri,
  poster,
  active = true,
  style,
  contentFit = 'cover',
}: {
  uri: string;
  poster?: string | null;
  active?: boolean;
  style?: ViewStyle;
  contentFit?: 'cover' | 'contain';
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // Play only while this card is the on-screen one. Pausing off-screen video
  // keeps a scrolling feed from decoding a dozen streams at once.
  useEffect(() => {
    try {
      if (active) player.play();
      else player.pause();
    } catch { /* player may be released mid-transition */ }
  }, [active, player]);

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      {poster ? (
        <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        nativeControls={false}
      />
    </View>
  );
}
