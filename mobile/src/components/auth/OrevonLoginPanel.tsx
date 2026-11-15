import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  //SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

export type OrevonLoginPanelProps = {
  /** Wire to AuthContext.login; this component never accesses or persists JWTs. */
  onLogin: (username: string, password: string) => Promise<void> | void;
  error?: string | null;
  isSubmitting?: boolean;
};

const C = {
  navy: '#091E2C',
  navy2: '#103747',
  green: '#087E69',
  mint: '#76E1BE',
  white: '#FFFFFF',
  light: '#F5F9F8',
  slate: '#6A818B',
  dark: '#16323C',
  border: '#DCE8E5',
  danger: '#A52E2C',
  dangerBg: '#FFF0EF',
};

/** Presentational, responsive Android/iOS sign-in. Preserve the app's existing AuthContext and router. */
export default function OrevonLoginPanel({ onLogin, error, isSubmitting = false }: OrevonLoginPanelProps) {
  const { width } = useWindowDimensions();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focus, setFocus] = useState<'username' | 'password' | null>(null);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState('');
  const passwordRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const busy = pending || isSubmitting;

  async function submit() {
    if (busy) return;
    if (!username.trim() || !password) {
      setLocalError('Enter your username and password.');
      return;
    }
    setLocalError('');
    setPending(true);
    try {
      await onLogin(username.trim(), password);
setPassword('');
    } catch {
      setLocalError('Sign-in was unsuccessful. Check your details and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[s.scrollContent, width >= 650 && s.tabletContent]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.hero}>
            <View style={s.halo} />
            <View style={s.brandRow}>
              <View style={s.logo}><Text style={s.logoMark}>O</Text></View>
              <View><Text style={s.brand}>OREVON</Text><Text style={s.brandCaption}>SMART OPERATIONS</Text></View>
            </View>
            <View style={s.heroText}>
              <Text style={s.heroEyebrow}>YOUR WORKSPACE</Text>
              <Text style={s.heroTitle}>Welcome{'\n'}back.</Text>
              <Text style={s.heroSubtitle}>Stay connected to the work that matters.</Text>
            </View>
          </View>

          <View style={[s.formContainer, width >= 650 && s.tabletForm]}>
            <View style={s.formCard}>
              <View style={s.kickerRow}><View style={s.kickerDot} /><Text style={s.kicker}>TEAM ACCESS</Text></View>
              <Text style={s.heading}>Sign in to Orevon</Text>
              <Text style={s.description}>Use your organization account to continue.</Text>

              <Text style={s.label}>Username</Text>
              <View style={[s.inputShell, focus === 'username' && s.inputFocused]}>
                <TextInput
                  accessibilityLabel="Username"
                  placeholder="Enter your username"
                  placeholderTextColor="#97A9AE"
                  value={username}
                  maxLength={150}
                  onChangeText={(text) => { setUsername(text); setLocalError(''); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  returnKeyType="next"
                  editable={!busy}
                  onFocus={() => setFocus('username')}
                  onBlur={() => setFocus(null)}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  style={s.input}
                />
              </View>

              <Text style={s.label}>Password</Text>
              <View style={[s.inputShell, focus === 'password' && s.inputFocused]}>
                <TextInput
                  ref={passwordRef}
                  accessibilityLabel="Password"
                  placeholder="Enter your password"
                  placeholderTextColor="#97A9AE"
                  value={password}
                  onChangeText={(text) => { setPassword(text); setLocalError(''); }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  returnKeyType="go"
                  editable={!busy}
                  onFocus={() => setFocus('password')}
                  onBlur={() => setFocus(null)}
                  onSubmitEditing={submit}
                  style={s.input}
                />
                <Pressable style={s.showButton} hitSlop={10} accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword((value) => !value)} disabled={busy}>
                  <Text style={s.showButtonText}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
                </Pressable>
              </View>

              {Boolean(error || localError) && <View style={s.errorBox} accessibilityRole="alert"><Text style={s.errorText}>{error || localError}</Text></View>}

              <Pressable accessibilityRole="button" accessibilityLabel="Sign in to Orevon" accessibilityState={{ disabled: busy, busy }} style={({ pressed }) => [s.submit, pressed && !busy && s.submitPressed, busy && s.submitDisabled]} onPress={submit} disabled={busy}>
                {busy ? <ActivityIndicator color={C.white} /> : <Text style={s.submitText}>Sign in to Orevon  →</Text>}
              </Pressable>
              <Text style={s.secureNote}>Access is managed by your organization.</Text>
            </View>
            <Text style={s.footer}>OREVON  ·  Inventory & Order Management</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: C.navy },
  scrollContent: { flexGrow: 1, backgroundColor: C.light },
  tabletContent: { justifyContent: 'center', alignItems: 'center', backgroundColor: C.navy },
  hero: { minHeight: 304, paddingHorizontal: 29, paddingTop: 28, paddingBottom: 52, backgroundColor: C.navy, overflow: 'hidden', width: '100%' },
  halo: { position: 'absolute', width: 300, height: 300, right: -144, top: 18, borderRadius: 150, borderWidth: 35, borderColor: '#123A49', opacity: 0.7 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  logo: { height: 45, width: 45, backgroundColor: '#22A88B', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  logoMark: { color: C.white, fontSize: 25, fontWeight: '900' },
  brand: { color: C.white, fontSize: 20, fontWeight: '900', letterSpacing: 2.5 },
  brandCaption: { color: '#93BABB', fontSize: 8, fontWeight: '700', letterSpacing: 2.4, marginTop: 1 },
  heroText: { marginTop: 43 },
  heroEyebrow: { color: C.mint, fontSize: 10, fontWeight: '800', letterSpacing: 2.6 },
  heroTitle: { color: C.white, fontSize: 44, fontWeight: '900', lineHeight: 48, letterSpacing: -1.8, marginTop: 12 },
  heroSubtitle: { color: '#C5D7DA', fontSize: 13, marginTop: 12, lineHeight: 20 },
  formContainer: { flex: 1, backgroundColor: C.light, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -27, paddingHorizontal: 22, paddingTop: 31, paddingBottom: 24, alignItems: 'center' },
  tabletForm: { marginTop: -6, width: '100%', maxWidth: 520, borderRadius: 25, flex: 0, paddingTop: 26 },
  formCard: { width: '100%', maxWidth: 480 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  kickerDot: { height: 8, width: 8, borderRadius: 4, backgroundColor: C.green },
  kicker: { color: C.green, fontSize: 10, fontWeight: '900', letterSpacing: 2.1 },
  heading: { marginTop: 12, color: C.dark, fontSize: 27, fontWeight: '900', letterSpacing: -0.8 },
  description: { color: C.slate, fontSize: 13, marginTop: 7, marginBottom: 27, lineHeight: 21 },
  label: { color: '#23404A', fontSize: 13, fontWeight: '800', marginBottom: 10 },
  inputShell: { width: '100%', height: 56, borderWidth: 1.3, borderColor: C.border, backgroundColor: C.white, borderRadius: 13, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 21 },
  inputFocused: { borderColor: '#159A7F', borderWidth: 2 },
  input: { flex: 1, height: '100%', padding: 0, color: C.dark, fontSize: 15 },
  showButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  showButtonText: { color: C.green, fontWeight: '900', fontSize: 11, letterSpacing: 0.8 },
  errorBox: { backgroundColor: C.dangerBg, borderRadius: 11, padding: 13, marginBottom: 17 },
  errorText: { color: C.danger, fontSize: 12, lineHeight: 19 },
  submit: { backgroundColor: C.green, borderRadius: 13, minHeight: 56, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  submitPressed: { backgroundColor: '#066B5B' },
  submitDisabled: { opacity: 0.65 },
  submitText: { color: C.white, fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  secureNote: { color: C.slate, textAlign: 'center', fontSize: 11, marginTop: 22, lineHeight: 18 },
  footer: { color: '#9AADB1', textAlign: 'center', fontSize: 10, marginTop: 37, marginBottom: 5 },
});
