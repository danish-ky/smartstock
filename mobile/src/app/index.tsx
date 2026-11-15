import { useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import OrevonLoginPanel from '../components/auth/OrevonLoginPanel';

/** Keep the existing AuthContext, session loading and authenticated redirect. */
export default function LoginScreen() {
  const { user, loading, signIn } = useAuth();
  const [error, setError] = useState('');

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#059669" /></View>;
  }
  if (user) return <Redirect href="/(app)/dashboard" />;

  async function handleLogin(username: string, password: string) {
    setError('');
    try {
      await signIn(username, password);
    } catch (err) {
  setError(err instanceof Error ? err.message : 'Unable to sign in.');
  throw err;
}
  }

  return <OrevonLoginPanel onLogin={handleLogin} error={error} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
});
