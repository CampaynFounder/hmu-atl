// Rider home — Phase 2. Placeholder until rider screens are built.
import { View, Text, StyleSheet } from 'react-native';

export default function RiderHome() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Rider home — coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  text: { color: '#555', fontSize: 16 },
});
