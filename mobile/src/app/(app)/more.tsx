import { useState } from 'react';
import { router, type Href } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Page, SectionTitle } from '../../components/MobileUI';
import { useAuth } from '../../context/AuthContext';

export default function AccountScreen() {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const canOperate = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'staff';
  const canManage = user?.role === 'admin' || user?.role === 'manager';
  const isAdmin = user?.role === 'admin';

  async function logout() {
    setBusy(true);
    try {
      const revoked = await signOut();
      if (!revoked) Alert.alert('Signed out on this device', 'Server-side token revocation could not be confirmed.');
    } catch (e) {
      Alert.alert('Sign-out failed', e instanceof Error ? e.message : 'Could not clear stored credentials.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Account" subtitle="SmartStock mobile profile">
      <SectionTitle>Signed in as</SectionTitle>
      <View style={styles.card}>
        <Text style={styles.name}>{user?.full_name || user?.name || user?.username || 'SmartStock User'}</Text>
        <Text style={styles.meta}>{user?.email || user?.username || ''}</Text>
        <Text style={styles.role}>{user?.role || 'User'}</Text>
      </View>
      {canOperate && (
        <>
          <SectionTitle>Management</SectionTitle>
          <Pressable accessibilityRole="button" style={styles.link} onPress={() => router.push('/purchase-orders' as Href)}>
            <Text style={styles.linkTitle}>Purchase orders</Text>
            <Text style={styles.linkSubtitle}>Supplier orders and received stock</Text>
          </Pressable>
          <View style={styles.links}>
            <Pressable accessibilityRole="button" style={styles.link} onPress={() => router.push('/management?kind=categories' as Href)}>
              <Text style={styles.linkTitle}>Categories</Text>
              <Text style={styles.linkSubtitle}>Manage product categories</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.link} onPress={() => router.push('/management?kind=suppliers' as Href)}>
              <Text style={styles.linkTitle}>Suppliers</Text>
              <Text style={styles.linkSubtitle}>View and manage supplier contacts</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.link} onPress={() => router.push('/management?kind=customers' as Href)}>
              <Text style={styles.linkTitle}>Customers</Text>
              <Text style={styles.linkSubtitle}>View and manage customer contacts</Text>
            </Pressable>
          </View>
        </>
      )}
      {canManage && (
        <>
          <SectionTitle>Bulk catalog tools</SectionTitle>
          <View style={styles.links}>
            <Pressable accessibilityRole="button" style={styles.link} onPress={() => router.push('/bulk-products' as Href)}>
              <Text style={styles.linkTitle}>Import / Export products</Text>
              <Text style={styles.linkSubtitle}>CSV and Excel · preview &amp; download</Text>
            </Pressable>
          </View>
          <SectionTitle>Analytics</SectionTitle>
          <View style={styles.links}>
            <Pressable accessibilityRole="button" style={styles.link} onPress={() => router.push('/reports' as Href)}>
              <Text style={styles.linkTitle}>Reports & Analytics</Text>
              <Text style={styles.linkSubtitle}>Sales, top products and stock by category</Text>
            </Pressable>
          </View>
        </>
      )}
      {isAdmin && (
        <>
          <SectionTitle>Administration</SectionTitle>
          <View style={styles.links}>
            <Pressable accessibilityRole="button" style={styles.link} onPress={() => router.push('/team' as Href)}>
              <Text style={styles.linkTitle}>Team & Access</Text>
              <Text style={styles.linkSubtitle}>Manage login accounts, roles and permissions</Text>
            </Pressable>
          </View>
        </>
      )}
      <SectionTitle>Session</SectionTitle>
      <Pressable accessibilityRole="button" style={styles.logout} onPress={logout} disabled={busy}>
        {busy ? <ActivityIndicator color="white" /> : <Text style={styles.logoutText}>Sign Out</Text>}
      </Pressable>
    </Page>
  );
}

const styles = StyleSheet.create({
  links: { gap: 10 },
  link: { backgroundColor: '#FFFFFF', borderRadius: 13, padding: 17 },
  linkTitle: { color: '#0F172A', fontWeight: '800', fontSize: 16 },
  linkSubtitle: { color: '#64748B', marginTop: 5, fontSize: 12 },
  card: { padding: 21, backgroundColor: 'white', borderRadius: 17 },
  name: { fontSize: 21, fontWeight: '800', color: '#0F172A' },
  meta: { color: '#64748B', marginTop: 8 },
  role: { color: '#047857', fontWeight: '700', marginTop: 12, textTransform: 'capitalize' },
  logout: { padding: 16, backgroundColor: '#334155', borderRadius: 12, alignItems: 'center' },
  logoutText: { color: 'white', fontWeight: '700' },
});
