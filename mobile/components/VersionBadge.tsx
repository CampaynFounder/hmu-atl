// VersionBadge — shows the app version in rider/driver profiles.
// `Constants.expoConfig.version` is the marketing version (app.json `version`),
// which is also the OTA runtimeVersion (policy: appVersion). When an OTA update
// is active we append a short update id so support can confirm a device picked
// up an over-the-air JS update on top of its store build.

import { Text, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { colors, fonts, spacing } from '@/lib/theme';

export function VersionBadge() {
  const version = Constants.expoConfig?.version ?? '—';
  // updateId is null when running the embedded (store) bundle with no OTA applied.
  const otaId = Updates.updateId ? Updates.updateId.slice(0, 8) : null;

  return (
    <Text style={s.text}>
      HMU v{version}{otaId ? ` · ${otaId}` : ''}
    </Text>
  );
}

const s = StyleSheet.create({
  text: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textFaint,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
});
