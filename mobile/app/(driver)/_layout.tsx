import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';

function TabIcon({ focused, active, inactive }: { focused: boolean; active: string; inactive: string }) {
  // Simple text-based icons until we add a proper icon library
  return (
    <View style={styles.iconWrap}>
      <View style={[styles.dot, focused && styles.dotActive]} />
    </View>
  );
}

export default function DriverLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0e0e0e',
          borderTopColor: '#18181b',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: '#00E676',
        tabBarInactiveTintColor: '#555',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="feed" options={{ title: 'Requests' }} />
      <Tabs.Screen name="dashboard" options={{ title: 'Earnings' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: { alignItems: 'center', justifyContent: 'center', width: 24, height: 24 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#555' },
  dotActive: { backgroundColor: '#00E676', width: 8, height: 8, borderRadius: 4 },
});
