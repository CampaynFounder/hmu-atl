import { useClerk } from '@clerk/clerk-expo';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function Pending() {
  const { signOut } = useClerk();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account Pending</Text>
      <Text style={styles.body}>Your account is under review. We'll notify you when you're approved.</Text>
      <TouchableOpacity style={styles.btn} onPress={() => signOut()}>
        <Text style={styles.btnText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 12 },
  body: { fontSize: 15, color: '#888', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  btn: { backgroundColor: '#27272a', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
