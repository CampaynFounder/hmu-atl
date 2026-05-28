import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ColorValue } from 'react-native';
import { colors, fonts } from '@/lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(active: IoniconName, inactive: IoniconName) {
  return ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <Ionicons name={focused ? active : inactive} size={22} color={color as string} />
  );
}

export default function RiderLayout() {
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
        name="profile"
        options={{
          title: 'PROFILE',
          tabBarIcon: tabIcon('person', 'person-outline'),
        }}
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
    </Tabs>
  );
}
