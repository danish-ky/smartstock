import React, { useMemo } from 'react';
import {
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Orevon Account screen — visual layer only.
 *
 * The existing Account route must supply the exact existing onPress handlers
 * and apply its existing role/permission filters BEFORE passing `sections`.
 * No API requests, auth state, navigation, or new permissions are defined here.
 */
export type OrevonAccountAction = {
  key: string;
  title: string;
  description?: string;
  onPress: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
};

export type OrevonAccountSection = {
  key: string;
  title: string;
  actions: readonly OrevonAccountAction[];
};

export type OrevonAccountViewProps = {
  displayName: string;
  email?: string | null;
  role: string;
  sections: readonly OrevonAccountSection[];
  onSignOut: () => void;
  signOutDisabled?: boolean;
  signOutLoading?: boolean;
  subtitle?: string;
};

const P = {
  navy: '#091F2D',
  deep: '#062B37',
  teal: '#087E73',
  green: '#12A98D',
  mint: '#CFF8EA',
  background: '#F3F7F8',
  line: '#E5EDF0',
  text: '#183340',
  muted: '#748892',
  white: '#FFFFFF',
};

function initials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'O';
  return words.length === 1
    ? words[0].slice(0, 2).toUpperCase()
    : (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function ActionRow({ action, last }: { action: OrevonAccountAction; last: boolean }) {
  return (
    <Pressable
      key={action.key}
      onPress={action.onPress}
      disabled={action.disabled}
      accessibilityRole="button"
      accessibilityLabel={action.title}
      accessibilityHint={action.accessibilityHint || action.description}
      accessibilityState={{ disabled: Boolean(action.disabled) }}
      testID={action.testID}
      style={({ pressed }) => [
        s.action,
        !last && s.actionBorder,
        pressed && !action.disabled && s.actionPressed,
        action.disabled && s.actionDisabled,
      ]}
    >
      <View style={s.actionIcon} accessible={false}>
        {action.icon || <Text style={s.actionIconText}>{action.title.slice(0, 1).toUpperCase()}</Text>}
      </View>
      <View style={s.actionText}>
        <Text style={s.actionTitle}>{action.title}</Text>
        {Boolean(action.description) && <Text style={s.actionDescription}>{action.description}</Text>}
      </View>
      <Text style={s.chevron} accessibilityElementsHidden>›</Text>
    </Pressable>
  );
}

export default function OrevonAccountView({
  displayName,
  email,
  role,
  sections,
  onSignOut,
  signOutDisabled = false,
  signOutLoading = false,
  subtitle = 'Manage your workspace',
}: OrevonAccountViewProps) {
  const { width } = useWindowDimensions();
  const tablet = width >= 700;
  const avatarLetters = useMemo(() => initials(displayName), [displayName]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollBody} showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <View style={s.heroGlow} />
          <View style={[s.container, tablet && s.tabletContainer]}>
            <View style={s.heroLabelRow}>
              <View style={s.brandMark}><Text style={s.brandMarkText}>O</Text></View>
              <Text style={s.heroOverline}>OREVON  /  ACCOUNT</Text>
            </View>
            <Text style={s.heroTitle}>Your workspace.{'\n'}Your account.</Text>
            <Text style={s.heroSubtitle}>{subtitle}</Text>
          </View>
        </View>
        <View style={[s.content, tablet && s.tabletContainer]}>
          <View style={s.profileCard}>
            <View style={s.avatar}><Text style={s.avatarLetters}>{avatarLetters}</Text></View>
            <View style={s.profileText}>
              <Text style={s.profileLabel}>SIGNED IN AS</Text>
              <Text style={s.profileName}>{displayName}</Text>
              {!!email && <Text style={s.profileEmail}>{email}</Text>}
              <View style={s.rolePill}><View style={s.roleDot}/><Text style={s.roleText}>{role}</Text></View>
            </View>
          </View>

          {sections.filter(section => section.actions.length > 0).map(section => (
            <View key={section.key} style={s.section}>
              <View style={s.sectionHeadingRow}>
                <Text style={s.sectionTitle}>{section.title}</Text>
                <View style={s.sectionLine}/>
              </View>
              <View style={s.sectionCard}>
                {section.actions.map((action, i) => <ActionRow key={action.key} action={action} last={i === section.actions.length - 1}/>)}
              </View>
            </View>
          ))}

          <View style={s.section}>
            <View style={s.sectionHeadingRow}>
              <Text style={s.sectionTitle}>Session</Text>
              <View style={s.sectionLine}/>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              accessibilityState={{ disabled: signOutDisabled }}
              onPress={onSignOut}
              disabled={signOutDisabled}
              style={({ pressed }) => [s.signOut, pressed && !signOutDisabled && s.signOutPressed, signOutDisabled && s.signOutDisabled]}
            >
              {signOutLoading ? <ActivityIndicator color={P.white} /> : (
                <>
                  <Text style={s.signOutIcon}>↪</Text>
                  <Text style={s.signOutText}>Sign Out</Text>
                </>
              )}
            </Pressable>
          </View>
          <Text style={s.footer}>OREVON  ·  INVENTORY & ORDER MANAGEMENT</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: P.navy },
  scroll: { flex: 1, backgroundColor: P.background },
  scrollBody: { flexGrow: 1, paddingBottom: 24 },
  hero: { backgroundColor: P.navy, minHeight: 208, overflow: 'hidden', paddingHorizontal: 20, paddingTop: 25, paddingBottom: 51 },
  heroGlow: { width: 225, height: 225, borderRadius: 150, backgroundColor: '#125C60', opacity: .28, position: 'absolute', right: -70, top: -95 },
  container: { width: '100%' },
  tabletContainer: { maxWidth: 760, alignSelf: 'center', width: '100%' },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 33, height: 33, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: P.green },
  brandMarkText: { color: P.white, fontWeight: '900', fontSize: 21 },
  heroOverline: { color: '#A5D9D2', fontWeight: '800', letterSpacing: 1.8, fontSize: 10 },
  heroTitle: { marginTop: 23, color: P.white, fontWeight: '900', fontSize: 29, lineHeight: 36, letterSpacing: -.8 },
  heroSubtitle: { marginTop: 9, color: '#AFC9CE', fontSize: 13 },
  content: { marginTop: -30, paddingHorizontal: 17, width: '100%' },
  profileCard: { backgroundColor: P.white, borderRadius: 21, padding: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 14, borderWidth: 1, borderColor: '#DFEAE8', elevation: 2, shadowColor: '#0D2634', shadowOpacity: .08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } },
  avatar: { width: 55, height: 55, backgroundColor: P.mint, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarLetters: { color: P.teal, fontSize: 19, fontWeight: '900' },
  profileText: { flex: 1, minWidth: 0 },
  profileLabel: { fontSize: 10, letterSpacing: 1.25, color: '#748C96', fontWeight: '900', marginBottom: 5 },
  profileName: { color: P.text, fontWeight: '900', fontSize: 20 },
  profileEmail: { color: P.muted, fontSize: 12, marginTop: 3, flexWrap: 'wrap' },
  rolePill: { alignSelf: 'flex-start', marginTop: 11, borderRadius: 30, backgroundColor: '#E8F8F0', paddingHorizontal: 11, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 6 },
  roleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: P.teal },
  roleText: { color: P.teal, textTransform: 'capitalize', fontSize: 11, fontWeight: '800' },
  section: { marginTop: 24 },
  sectionHeadingRow: { marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 3 },
  sectionTitle: { color: P.text, fontSize: 14, fontWeight: '900' },
  sectionLine: { height: 1, flex: 1, backgroundColor: P.line },
  sectionCard: { backgroundColor: P.white, borderRadius: 18, borderWidth: 1, borderColor: '#E2EDEF', overflow: 'hidden' },
  action: { flexDirection: 'row', alignItems: 'center', minHeight: 72, paddingHorizontal: 13, paddingVertical: 12, gap: 13 },
  actionBorder: { borderBottomWidth: 1, borderBottomColor: '#EEF3F4' },
  actionPressed: { backgroundColor: '#F0FAF8' },
  actionDisabled: { opacity: .5 },
  actionIcon: { height: 42, width: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#E9F7F4' },
  actionIconText: { fontSize: 16, fontWeight: '900', color: P.teal },
  actionText: { flex: 1, minWidth: 0 },
  actionTitle: { fontSize: 13, fontWeight: '800', color: P.text },
  actionDescription: { fontSize: 11, color: P.muted, marginTop: 4, lineHeight: 17 },
  chevron: { color: '#9BAEB5', fontSize: 28, marginRight: 2, marginBottom: 3 },
  signOut: { borderRadius: 15, minHeight: 53, backgroundColor: '#142F42', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11 },
  signOutIcon: { color: P.white, fontSize: 24, fontWeight: '700' },
  signOutText: { color: P.white, fontSize: 14, fontWeight: '800' },
  signOutPressed: { backgroundColor: '#20506A' },
  signOutDisabled: { opacity: .55 },
  footer: { textAlign: 'center', color: '#91A1A9', fontSize: 9, fontWeight: '800', letterSpacing: .55, marginTop: 24, marginBottom: 10 },
});
