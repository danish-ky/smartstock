import { Redirect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import DirectoryManager from '../components/DirectoryManager';
import { useAuth } from '../context/AuthContext';

// Keep directory screens separate from bottom tabs. The backend remains
// authoritative for permissions; this guard prevents accidental UI access.
export default function ManagementScreen() {
  const { kind: queryKind } = useLocalSearchParams<{ kind?: string }>();
  const { user, loading } = useAuth();

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color="#059669" size="large" /></View>;
  }
  if (!user) return <Redirect href="/" />;
  if (user.role !== 'admin' && user.role !== 'manager' && user.role !== 'staff') {
    return <Redirect href="/(app)/more" />;
  }

  if (queryKind !== 'categories' && queryKind !== 'suppliers' && queryKind !== 'customers') {
    return <Redirect href="/(app)/more" />;
  }

  return <DirectoryManager kind={queryKind} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
});
