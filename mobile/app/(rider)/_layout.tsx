import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Locked visual height of the tab bar content band. The system-bar inset is
// added to BOTH height and paddingBottom below so it cancels out of the usable
// band (stays a constant 46px) and only ever adds dead space beneath the icons
// — keeping content anchored above the Android nav bar without drifting.
const TAB_BASE_HEIGHT = 64;

function tabIcon(active: IoniconName, inactive: IoniconName) {
  return ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <Ionicons name={focused ? active : inactive} size={22} color={color as string} />
  );
}

export default function RiderLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0e0e0e',
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: TAB_BASE_HEIGHT + insets.bottom,
          paddingBottom: 10 + insets.bottom,
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
        name="browse"
        options={{
          title: 'BROWSE',
          tabBarIcon: tabIcon('people', 'people-outline'),
        }}
      />
      <Tabs.Screen
        name="rides"
        options={{
          title: 'RIDES',
          tabBarIcon: tabIcon('car', 'car-outline'),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: 'REQUESTS',
          tabBarIcon: tabIcon('list', 'list-outline'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'PROFILE',
          tabBarIcon: tabIcon('person', 'person-outline'),
        }}
      />
      <Tabs.Screen
        name="onboarding"
        options={{ href: null, headerShown: false, tabBarStyle: { display: 'none' } }}
      />
      <Tabs.Screen
        name="ride/[id]"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="ride/pull-up"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="ride/active"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="support"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="payment-setup"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="payment-methods"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="book/direct"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="book/blast"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="book/down-bad"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="book/blast-board"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="book/blast-deck"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="book/waiting"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="book/[type]"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="book/delivery"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="delivery/[id]"
        options={{ href: null, headerShown: false }}
      />
    </Tabs>
  );
}
