import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, ColorValue } from 'react-native';
import { colors, fonts } from '@/lib/theme';
import { useNotifications } from '@/contexts/notifications';
import { PulseDot } from '@/components/PulseDot';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(active: IoniconName, inactive: IoniconName) {
  return ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <Ionicons name={focused ? active : inactive} size={22} color={color as string} />
  );
}

function RequestsTabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
  const { unreadRequestCount } = useNotifications();
  return (
    <View style={{ position: 'relative', width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={focused ? 'layers' : 'layers-outline'} size={22} color={color as string} />
      {unreadRequestCount > 0 && (
        <View style={{ position: 'absolute', top: 0, right: 0 }}>
          <PulseDot />
        </View>
      )}
    </View>
  );
}

export default function DriverLayout() {
  const { markRequestsSeen } = useNotifications();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0e0e0e',
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: {
          fontFamily: fonts.mono,
          fontSize: 9,
          letterSpacing: 0.8,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'HOME',
          tabBarIcon: tabIcon('home', 'home-outline'),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'REQUESTS',
          tabBarIcon: (props) => <RequestsTabIcon {...props} />,
        }}
        listeners={{ tabPress: () => markRequestsSeen() }}
      />
      <Tabs.Screen
        name="rides"
        options={{
          title: 'RIDES',
          tabBarIcon: tabIcon('car', 'car-outline'),
        }}
      />
      <Tabs.Screen
        name="ride/[id]"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="ride/active"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="edit-profile"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="menu"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="payout-setup"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="advanced-settings"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="advanced/rider-quality"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="advanced/pricing"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="advanced/down-bad"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="advanced/availability"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="advanced/home-base"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="advanced/media"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'PROFILE',
          tabBarIcon: tabIcon('person', 'person-outline'),
        }}
      />
    </Tabs>
  );
}
