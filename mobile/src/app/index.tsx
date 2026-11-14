import { useState } from 'react';
import { Redirect } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { user, loading, signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#059669" /></View>;
  }
  if (user) return <Redirect href="/(app)/dashboard" />;

  async function submit() {
    if (!username.trim() || !password) {
      setError('Enter username and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await signIn(username, password);
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.mark}><Text style={styles.markText}>S</Text></View>
            <Text style={styles.brand}>Orevon</Text>
            <Text style={styles.subtitle}>Inventory & Order Management</Text>
            <Text style={styles.heading}>Welcome back</Text>
            <Text style={styles.label}>Username</Text>
            <TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="Username" placeholderTextColor="#94A3B8" editable={!busy} />
            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" placeholderTextColor="#94A3B8" editable={!busy} onSubmitEditing={submit} returnKeyType="go" />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Pressable style={[styles.button, busy && { opacity: 0.65 }]} disabled={busy} onPress={submit}>
              {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Sign In</Text>}
            </Pressable>
            <Text style={styles.hint}>Sign in using your existing Orevon account.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F1F5F9' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 22 },
  card: { backgroundColor: 'white', borderRadius: 24, padding: 26, elevation: 3 },
  mark: { alignSelf: 'center', width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#059669' },
  markText: { color: 'white', fontSize: 31, fontWeight: '800' },
  brand: { textAlign: 'center', fontSize: 29, fontWeight: '800', color: '#0F172A', marginTop: 14 },
  subtitle: { textAlign: 'center', color: '#64748B', fontSize: 12, marginTop: 4, marginBottom: 30 },
  heading: { color: '#0F172A', fontSize: 20, fontWeight: '700', marginBottom: 18 },
  label: { color: '#334155', fontWeight: '600', marginBottom: 7 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', color: '#0F172A', borderRadius: 12, padding: 14, marginBottom: 15 },
  error: { color: '#DC2626', marginBottom: 12 },
  button: { backgroundColor: '#059669', alignItems: 'center', padding: 16, borderRadius: 12, marginTop: 4 },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 16 },
  hint: { textAlign: 'center', marginTop: 18, color: '#64748B', fontSize: 12 },
});
