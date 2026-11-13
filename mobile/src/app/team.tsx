import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import TeamPanel from '../components/TeamPanel';
import { useAuth } from '../context/AuthContext';

export default function TeamScreen() {
  const { user, loading } = useAuth();
  if (loading) return <View style={styles.loading}><ActivityIndicator color="#047857" size="large" /></View>;
  if (!user) return <Redirect href="/" />;
  if (user.role !== 'admin') return <Redirect href="/(app)/more" />;
  return <TeamPanel />;
}
const styles = StyleSheet.create({ loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F1F5F9' } });
