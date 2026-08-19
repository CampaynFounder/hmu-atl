// BottomScrim — a bottom-anchored darkening gradient for full-bleed feed cards,
// approximated with a few stacked bands (no native gradient dep, so it ships
// OTA). Fades from dark at the very bottom (behind the text) up to transparent,
// so it never greys out the photo/video the way a tall flat scrim does.

import { View } from 'react-native';

export function BottomScrim({ height = 190 }: { height?: number }) {
  const bands: { h: number; o: number }[] = [
    { h: 0.46, o: 0.68 }, // bottom, darkest — sits behind the text
    { h: 0.30, o: 0.38 },
    { h: 0.24, o: 0.16 }, // top, nearly clear — feathers into the media
  ];
  let acc = 0;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
      {bands.map((b, i) => {
        const bottom = acc;
        acc += b.h * height;
        return (
          <View
            key={i}
            style={{
              position: 'absolute', left: 0, right: 0,
              bottom, height: b.h * height,
              backgroundColor: `rgba(0,0,0,${b.o})`,
            }}
          />
        );
      })}
    </View>
  );
}
