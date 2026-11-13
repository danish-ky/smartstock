import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';

const tabIcon = (emoji: string) => ({ color }: { color: unknown }) => (
  <Text
    style={{
      fontSize: 20,
      color: typeof color === 'string' ? color : '#64748B',
    }}
  >
    {emoji}
  </Text>
);

export default function PrivateTabs() {
  const { user, loading } = useAuth();

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#059669" /></View>;
  }
  if (!user) return <Redirect href="/" />;

  const canOperate = user.role !== 'user';

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#047857',
      tabBarInactiveTintColor: '#64748B',
      tabBarStyle: { backgroundColor: '#FFFFFF', borderTopColor: '#E2E8F0', height: 62 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600', paddingBottom: 4 },
    }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Home', tabBarIcon: tabIcon('⌂') }} />
      <Tabs.Screen name="products" options={{ title: 'Products', tabBarIcon: tabIcon('▣') }} />
      <Tabs.Screen name="inventory" options={{ title: 'Inventory', href: canOperate ? undefined : null, tabBarIcon: tabIcon('▤') }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: tabIcon('☷') }} />
      <Tabs.Screen name="categories" options={{ href: null }} />
      <Tabs.Screen name="suppliers" options={{ href: null }} />
      <Tabs.Screen name="customers" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ title: 'Account', tabBarIcon: tabIcon('●') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
});
