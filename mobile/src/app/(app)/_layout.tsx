import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';

const theme = { navy: '#11263B', mint: '#6CE3B8', muted: '#AFC1D1' };

type GlyphName = 'home' | 'products' | 'inventory' | 'orders' | 'account';

function TabGlyph({ name, focused }: { name: GlyphName; focused: boolean }) {
  const glyph: Record<GlyphName, string> = {
    home: '⌂', products: '▦', inventory: '▤', orders: '≡', account: '◉',
  };
  return (
    <View style={[styles.iconShell, focused && styles.activeIconShell]}>
      <Text style={[styles.glyph, focused && styles.activeGlyph]}>{glyph[name]}</Text>
    </View>
  );
}

export default function PrivateTabs() {
  const { user, loading } = useAuth();
  const insets = useSafeAreaInsets();

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#059A75" /></View>;
  }
  if (!user) return <Redirect href="/" />;

  const canOperate = user.role !== 'user';

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: theme.mint,
      tabBarInactiveTintColor: theme.muted,
      tabBarStyle: [styles.tabBar, { height: 70 + insets.bottom, paddingBottom: Math.max(insets.bottom, 7) }],
      tabBarItemStyle: styles.tabItem,
      tabBarLabelStyle: styles.tabLabel,
      tabBarHideOnKeyboard: true,
    }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Home', tabBarIcon: ({ focused }) => <TabGlyph name="home" focused={focused} /> }} />
      <Tabs.Screen name="products" options={{ title: 'Products', tabBarIcon: ({ focused }) => <TabGlyph name="products" focused={focused} /> }} />
      <Tabs.Screen name="inventory" options={{ title: 'Inventory', href: canOperate ? undefined : null, tabBarIcon: ({ focused }) => <TabGlyph name="inventory" focused={focused} /> }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ focused }) => <TabGlyph name="orders" focused={focused} /> }} />
      <Tabs.Screen name="categories" options={{ href: null }} />
      <Tabs.Screen name="suppliers" options={{ href: null }} />
      <Tabs.Screen name="customers" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ title: 'Account', tabBarIcon: ({ focused }) => <TabGlyph name="account" focused={focused} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F7FB' },
  tabBar: {
    backgroundColor: theme.navy,
    borderTopWidth: 0,
    borderTopLeftRadius: 19,
    borderTopRightRadius: 19,
    paddingTop: 6,
    elevation: 12,
    shadowColor: '#081727',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 14,
  },
  tabItem: { paddingTop: 3 },
  tabLabel: { fontSize: 10, fontWeight: '700', marginTop: 0, marginBottom: 0 },
  iconShell: { width: 41, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  activeIconShell: { backgroundColor: '#204C4B' },
  glyph: { fontSize: 23, fontWeight: '700', color: theme.muted, lineHeight: 28 },
  activeGlyph: { color: theme.mint },
});
