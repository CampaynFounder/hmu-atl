// Driver profile — display name, tier, sign out.
// Full profile editing (areas, vehicle, video) is Phase 6.
import { useAuth, useUser } from '@clerk/clerk-expo';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

export default function DriverProfile() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const handle = (user?.unsafeMetadata?.handle as string) ?? user?.fullName ?? 'Driver';
  const phone = user?.phoneNumbers?.[0]?.phoneNumber ?? '—';
  const tier = (user?.publicMetadata?.tier as string) ?? 'free';
  const completedRides = (user?.publicMetadata?.completedRides as number) ?? 0;
  const chillScore = (user?.publicMetadata?.chillScore as number) ?? 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.card}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarLetter}>{handle[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <Text style={styles.handle}>{handle}</Text>
        {tier === 'hmu_first' && (
          <View style={styles.firstBadge}>
            <Text style={styles.firstBadgeText}>HMU FIRST</Text>
          </View>
        )}
        <Text style={styles.phone}>{phone}</Text>
      </View>

      <View style={styles.statsRow}>
        <StatBox label="Rides" value={String(completedRides)} />
        <StatBox label="Chill Score" value={`${Math.round(chillScore)}%`} />
        <StatBox label="Tier" value={tier === 'hmu_first' ? 'First' : 'Free'} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Account</Text>
        <MenuItem label="Edit Profile" onPress={() => {}} />
        <MenuItem label="Payout Setup" onPress={() => router.push('/(driver)/payout-setup')} />
        <MenuItem label="Settings" onPress={() => {}} />
        <MenuItem label="Support" onPress={() => {}} />
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={() => signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MenuItem({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <Text style={styles.menuLabel}>{label}</Text>
      <Text style={styles.menuChevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  content: { padding: 16, paddingTop: 24, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 20 },
  card: { backgroundColor: '#18181b', borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#27272a' },
  avatarCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#27272a', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarLetter: { fontSize: 32, fontWeight: '800', color: '#00E676' },
  handle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  firstBadge: { backgroundColor: '#FFB300', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  firstBadgeText: { fontSize: 10, fontWeight: '800', color: '#000', letterSpacing: 1 },
  phone: { fontSize: 14, color: '#555' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: '#18181b', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#27272a' },
  statValue: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#555' },
  section: { backgroundColor: '#18181b', borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#27272a', overflow: 'hidden' },
  sectionLabel: { fontSize: 11, color: '#555', fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#27272a' },
  menuLabel: { fontSize: 15, color: '#fff' },
  menuChevron: { fontSize: 20, color: '#555' },
  signOutBtn: { paddingVertical: 15, alignItems: 'center', backgroundColor: '#27272a', borderRadius: 14 },
  signOutText: { fontSize: 15, fontWeight: '600', color: '#FF4444' },
});
