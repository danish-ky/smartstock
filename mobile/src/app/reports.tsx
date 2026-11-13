import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import ReportsPanel from '../components/ReportsPanel';
import { useAuth } from '../context/AuthContext';

export default function ReportsScreen() {
  const { user, loading } = useAuth();
  if (loading) return <View style={styles.loading}><ActivityIndicator color="#047857" size="large" /></View>;
  if (!user) return <Redirect href="/" />;
  if (user.role !== 'admin' && user.role !== 'manager') return <Redirect href="/(app)/more" />;
  return <ReportsPanel />;
}
const styles = StyleSheet.create({ loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F1F5F9' } });
