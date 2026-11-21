import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch,
  Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Page } from './MobileUI';
import { EmeraldGradient } from './OrevonPolish';
import { useAuth } from '../context/AuthContext';
import { listItems } from '../lib/api';

type Role = 'admin' | 'manager' | 'staff' | 'user';
type TeamMember = {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  role: Role;
  is_active: boolean;
  date_joined?: string;
};
type TeamResponse = TeamMember[] | { results?: TeamMember[]; count?: number; next?: string | null };
type Editor = {
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  password: string;
};
const initial: Editor = {
  username: '', first_name: '', last_name: '', email: '', role: 'staff', is_active: true, password: '',
};
const roles: Role[] = ['admin', 'manager', 'staff', 'user'];
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'The server could not complete the request.';
}
function Field({ label, value, setValue, secure = false, type = 'default', note, required = false }: {
  label: string; value: string; setValue: (value: string) => void;
  secure?: boolean; type?: 'default' | 'email-address'; note?: string; required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}{required ? ' *' : ''}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={setValue}
        style={[styles.modalInput, focused && styles.inputFocused]} secureTextEntry={secure}
        keyboardType={type} autoCapitalize={type === 'email-address' || secure || label === 'Username' ? 'none' : 'words'}
        autoCorrect={false} maxLength={secure ? 128 : 150}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        selectionColor="#0AA586" placeholder={label} placeholderTextColor="#9AAFAA" />
      {!!note && <Text style={styles.note}>{note}</Text>}
    </View>
  );
}

export default function TeamPanel() {
  const { user, apiGet, apiPost, apiPatch, apiDelete } = useAuth();
  const [people, setPeople] = useState<TeamMember[]>([]);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState<number | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [draft, setDraft] = useState<Editor>(initial);
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const result = await apiGet<TeamResponse>(`/users/?page=${page}`);
      setPeople(listItems(result));
      if (Array.isArray(result)) {
        setCount(result.length);
        setHasNext(false);
      } else {
        setCount(typeof result.count === 'number' ? result.count : null);
        setHasNext(Boolean(result.next));
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, [apiGet, page]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text ? people.filter(p =>
      [p.username, p.first_name, p.last_name, p.email, p.role]
        .some(field => (field || '').toLowerCase().includes(text))) : people;
  }, [people, query]);
  const isSelf = editing !== null && editing.id === user?.id;

  function edit(member?: TeamMember) {
    if (user?.role !== 'admin') return;
    setEditing(member || null);
    setDraft(member ? {
      username: member.username,
      first_name: member.first_name || '',
      last_name: member.last_name || '',
      email: member.email || '',
      role: member.role,
      is_active: member.is_active,
      password: '',
    } : { ...initial });
    setFormError('');
    setOpen(true);
  }
  function change<K extends keyof Editor>(key: K, value: Editor[K]) {
    setDraft(old => ({ ...old, [key]: value }));
  }
  function validate(): string {
    if (!/^[\w.@+-]{1,150}$/.test(draft.username.trim())) return 'Enter a valid username (1–150 characters).';
    if (!draft.email.trim() || !/^\S+@\S+\.\S+$/.test(draft.email.trim())) return 'Enter a valid email address.';
    if (draft.first_name.length > 150 || draft.last_name.length > 150) return 'Names must be 150 characters or fewer.';
    if (!editing && !draft.password) return 'Password is required for new accounts.';
    if (draft.password && draft.password.length < 8) return 'Use a password with at least eight characters; the server may require a stronger one.';
    if (isSelf && (draft.role !== 'admin' || !draft.is_active)) return 'You cannot remove your own admin access.';
    return '';
  }
  function confirmSave() {
    if (lock.current || saving) return;
    const validation = validate();
    setFormError(validation);
    if (validation) return;
    Alert.alert(
      editing ? 'Update team account?' : 'Create new team account?',
      editing ? `Save changes for ${editing.username}?${draft.password ? '\nA new password will be set.' : ''}` :
        `Create ${draft.username} as ${draft.role}? This grants account access according to the selected role.`,
      [
        { text: 'Review', style: 'cancel' },
        { text: 'Save', onPress: () => { void save(); } },
      ],
    );
  }
  async function save() {
    if (lock.current || saving || user?.role !== 'admin') return;
    lock.current = true;
    setSaving(true);
    setFormError('');
    try {
      const payload: Record<string, unknown> = {
        username: draft.username.trim(),
        first_name: draft.first_name.trim(),
        last_name: draft.last_name.trim(),
        email: draft.email.trim(),
        role: draft.role,
        is_active: draft.is_active,
      };
      // Do not overwrite a user's password with an empty string on edit.
      if (draft.password) payload.password = draft.password;
      if (editing) await apiPatch(`/users/${editing.id}/`, payload);
      else await apiPost('/users/', payload);
      setOpen(false);
      setDraft({ ...initial });
      if (page !== 1) setPage(1);
      else await load();
      Alert.alert('Account saved', 'The team member has been updated successfully.');
    } catch (e) {
      setFormError(`${errorText(e)} If the connection dropped, refresh the team list before retrying to avoid duplicates.`);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  function confirmDelete(member: TeamMember) {
    if (lock.current || saving || member.id === user?.id || user?.role !== 'admin') return;
    Alert.alert(
      'Delete account?',
      `${member.username} will lose access. Accounts linked to order or stock history cannot be deleted; disable them instead.`,
      [
        { text: 'Keep account', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { void remove(member); } },
      ],
    );
  }
  async function remove(member: TeamMember) {
    if (lock.current || saving || member.id === user?.id || user?.role !== 'admin') return;
    lock.current = true;
    setSaving(true);
    try {
      await apiDelete(`/users/${member.id}/`);
      if (people.length === 1 && page > 1) setPage(page - 1);
      else await load();
    } catch (e) {
      Alert.alert('Could not delete account', `${errorText(e)} You can edit the account and disable it instead.`);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  return (
    <Page title="Team & Access" subtitle="Admin-only account and role management"
      refreshing={busy} onRefresh={() => { void load(); }}>
      <Text style={styles.intro}>Admin controls users; Manager manages operations; Staff handles sales and stock; User has customer-only access.</Text>
      <Pressable accessibilityRole="button" style={styles.add} onPress={() => edit()} disabled={saving}>
        <Text style={styles.addText}>+ Add team member</Text>
      </Pressable>
      <TextInput accessibilityLabel="Search team members" style={styles.input} placeholder="Search users on this page"
        placeholderTextColor="#94A3B8" value={query} autoCorrect={false} onChangeText={setQuery} />
      {!!error && <View style={styles.notice}>
        <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        <Pressable onPress={() => { void load(); }} accessibilityRole="button"><Text style={styles.retry}>Retry</Text></Pressable>
      </View>}
      {busy && <ActivityIndicator color="#047857" size="large" style={{ marginTop: 24 }} />}
      {!error && <>
        <Text style={styles.count}>{count ?? people.length} account(s) · Page {page}</Text>
        {!busy && !filtered.length && <Text style={styles.muted}>No users found on this page.</Text>}
        {filtered.map(member => (
          <View key={member.id} style={styles.member}>
            <Text style={styles.memberName}>{[member.first_name, member.last_name].filter(Boolean).join(' ') || member.username}</Text>
            <Text style={styles.detail}>@{member.username} · {member.email || 'No email'}</Text>
            <View style={styles.roleRow}>
              <Text style={styles.roleBadge}>{member.role.toUpperCase()}</Text>
              <Text style={[styles.status, !member.is_active && styles.inactive]}>{member.is_active ? 'Enabled' : 'Disabled'}</Text>
            </View>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" style={styles.editButton} onPress={() => edit(member)} disabled={saving}>
                <Text style={styles.editText}>Edit / Password</Text>
              </Pressable>
              {member.id !== user?.id && <Pressable accessibilityRole="button" style={styles.deleteButton}
                disabled={saving} onPress={() => confirmDelete(member)}>
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>}
            </View>
          </View>
        ))}
        <View style={styles.pageRow}>
          <Pressable accessibilityRole="button" disabled={page <= 1 || busy} style={styles.pageButton}
            onPress={() => setPage(p => Math.max(1, p - 1))}><Text style={styles.pageText}>Previous</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={!hasNext || busy} style={styles.pageButton}
            onPress={() => setPage(p => p + 1)}><Text style={styles.pageText}>Next</Text></Pressable>
        </View>
      </>}
      <Modal visible={open} animationType="slide" onRequestClose={() => { if (!saving) setOpen(false); }}>
        <SafeAreaView style={styles.modalRoot}>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHero}>
              <View pointerEvents="none" style={styles.heroOrbLarge} />
              <View pointerEvents="none" style={styles.heroOrbSmall} />
              <View style={styles.modalHeroTop}>
                <Text style={styles.heroEyebrow}>OREVON  /  TEAM ACCESS</Text>
                <Pressable accessibilityRole="button" disabled={saving} onPress={() => setOpen(false)} style={styles.closeButton}>
                  <Text style={styles.close}>Close</Text>
                </Pressable>
              </View>
              <Text style={styles.heading}>{editing ? `Edit ${editing.username}` : 'New team member'}</Text>
              <Text style={styles.heroSubtitle}>{editing ? 'Update account details and access settings.' : 'Create a workspace account with the right level of access.'}</Text>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.sectionEyebrow}>01  /  ACCOUNT DETAILS</Text>
              <Text style={styles.sectionHeading}>Member information</Text>
              <Text style={styles.sectionDescription}>Essential details for this team account.</Text>
              <Field label="Username" required value={draft.username} setValue={v => change('username', v)} />
              <Field label="First name" value={draft.first_name} setValue={v => change('first_name', v)} />
              <Field label="Last name" value={draft.last_name} setValue={v => change('last_name', v)} />
              <Field label="Email" required value={draft.email} type="email-address" setValue={v => change('email', v)} />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.sectionEyebrow}>02  /  ACCESS CONTROL</Text>
              <Text style={styles.sectionHeading}>Role & permissions</Text>
              <Text style={styles.sectionDescription}>Choose a role and manage account availability.</Text>
              <Text style={styles.label}>Role</Text>
              <View style={styles.choices}>
                {roles.map(role => (
                  <Pressable key={role} accessibilityRole="button" accessibilityState={{ selected: draft.role === role }}
                    disabled={isSelf || saving} onPress={() => change('role', role)}
                    style={({ pressed }) => [styles.roleButton, role === draft.role && styles.roleSelected, (isSelf || saving) && styles.disabled, pressed && styles.rolePressed]}>
                    <View style={[styles.roleDot, role === draft.role && styles.roleDotSelected]} />
                    <Text style={[styles.roleText, role === draft.role && styles.roleSelectedText]}>{role}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.switchRow}>
                <View style={styles.switchCopy}>
                  <Text style={styles.switchTitle}>Account enabled</Text>
                  <Text style={styles.switchHint}>Allow this member to access Orevon</Text>
                </View>
                <Switch value={draft.is_active} onValueChange={value => change('is_active', value)} disabled={isSelf || saving}
                  trackColor={{ false: '#D6E8E2', true: '#82D7C1' }} thumbColor={draft.is_active ? '#0AA586' : '#FFFFFF'} />
              </View>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.sectionEyebrow}>03  /  ACCOUNT SECURITY</Text>
              <Text style={styles.sectionHeading}>Password</Text>
              <Text style={styles.sectionDescription}>{editing ? 'Leave this blank to keep the current password.' : 'Choose a secure password for the new member.'}</Text>
              <Field label={editing ? 'New password (optional)' : 'Password'} value={draft.password} secure required={!editing}
                setValue={v => change('password', v)} note="At least 8 characters. Django validates stronger password requirements." />
              {isSelf && <Text style={styles.note}>You cannot remove your own admin access.</Text>}
            </View>
            {!!formError && <Text accessibilityRole="alert" style={styles.error}>{formError}</Text>}
            <Pressable accessibilityRole="button" disabled={saving} style={({ pressed }) => [styles.add, styles.saveButton, saving && styles.disabled, pressed && styles.rolePressed]} onPress={confirmSave}>
              <EmeraldGradient radius={15} />
              {saving ? <ActivityIndicator color="white" /> : <Text style={styles.addText}>Save account</Text>}
            </Pressable>
            <Text style={styles.modalFootnote}>Changes to team access are reviewed before saving.</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </Page>
  );
}

const styles = StyleSheet.create({
  intro: { color: '#475569', fontSize: 13, lineHeight: 20, marginBottom: 14 },
  add: { backgroundColor: '#047857', borderRadius: 12, padding: 15, alignItems: 'center', marginBottom: 14 },
  addText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, letterSpacing: 0.2 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, backgroundColor: 'white', padding: 13, color: '#0F172A', fontSize: 14 },
  notice: { padding: 13, borderRadius: 10, backgroundColor: '#FEF2F2', marginTop: 10 },
  error: { color: '#B91C1C', fontSize: 13, lineHeight: 19, marginVertical: 10 },
  retry: { color: '#047857', fontWeight: '800' },
  count: { color: '#64748B', fontSize: 12, marginVertical: 13 },
  member: { backgroundColor: 'white', padding: 15, borderRadius: 14, marginBottom: 10 },
  memberName: { color: '#0F172A', fontWeight: '800', fontSize: 16 },
  detail: { color: '#64748B', fontSize: 12, marginTop: 5 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  roleBadge: { color: '#047857', fontWeight: '800', backgroundColor: '#ECFDF5', overflow: 'hidden', borderRadius: 8, padding: 7, fontSize: 11 },
  status: { color: '#047857', fontWeight: '700', fontSize: 12 },
  inactive: { color: '#B91C1C' },
  actions: { flexDirection: 'row', gap: 9, marginTop: 13 },
  editButton: { flex: 1, backgroundColor: '#E2E8F0', padding: 11, borderRadius: 9, alignItems: 'center' },
  editText: { color: '#334155', fontWeight: '800', fontSize: 12 },
  deleteButton: { backgroundColor: '#FEE2E2', paddingHorizontal: 20, paddingVertical: 11, borderRadius: 9 },
  deleteText: { color: '#B91C1C', fontWeight: '800', fontSize: 12 },
  pageRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 20 },
  pageButton: { flex: 1, alignItems: 'center', backgroundColor: '#E2E8F0', padding: 12, borderRadius: 10 },
  pageText: { color: '#334155', fontWeight: '700' },
  muted: { color: '#64748B', marginTop: 13, marginBottom: 15 },

  modalRoot: { flex: 1, backgroundColor: '#F3F9F7' },
  modalContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 45 },
  modalHero: { backgroundColor: '#122A3B', borderRadius: 22, paddingHorizontal: 19, paddingTop: 16, paddingBottom: 22, marginBottom: 14, overflow: 'hidden' },
  heroOrbLarge: { position: 'absolute', right: -68, top: -85, width: 200, height: 200, borderRadius: 110, backgroundColor: 'rgba(10,165,134,0.17)' },
  heroOrbSmall: { position: 'absolute', right: 21, bottom: -45, width: 90, height: 90, borderRadius: 55, backgroundColor: 'rgba(91,213,177,0.11)' },
  modalHeroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 16 },
  heroEyebrow: { color: '#75DEC1', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, flexShrink: 1 },
  closeButton: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.11)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  close: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  heading: { fontSize: 25, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.35, marginBottom: 7 },
  heroSubtitle: { color: '#C5D4DC', fontSize: 12, lineHeight: 19, maxWidth: 295 },
  formSection: { backgroundColor: '#FFFFFF', borderRadius: 19, padding: 17, marginBottom: 13, borderWidth: 1, borderColor: '#DBEBE6', elevation: 1 },
  sectionEyebrow: { color: '#079878', fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 6 },
  sectionHeading: { color: '#173048', fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  sectionDescription: { color: '#798B99', fontSize: 11, lineHeight: 17, marginTop: 4, marginBottom: 15 },
  field: { marginBottom: 13 },
  label: { color: '#496173', fontSize: 12, fontWeight: '800', marginBottom: 7 },
  modalInput: { backgroundColor: '#F8FCFB', borderColor: '#DBEAE5', borderWidth: 1, borderRadius: 12, minHeight: 49, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, color: '#173048' },
  inputFocused: { borderColor: '#1FB695', backgroundColor: '#FFFFFF', borderWidth: 1.5 },
  note: { color: '#768898', fontSize: 11, lineHeight: 17, marginTop: 6 },
  choices: { flexDirection: 'row', gap: 9, flexWrap: 'wrap', marginBottom: 17 },
  roleButton: { flexBasis: '45%', flexGrow: 1, paddingHorizontal: 12, paddingVertical: 13, minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F2F7F5', borderRadius: 11, borderWidth: 1, borderColor: '#E1ECE8' },
  roleSelected: { backgroundColor: '#E2F8EF', borderColor: '#43C4A5' },
  roleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#BDCEC8' },
  roleDotSelected: { backgroundColor: '#0AA586' },
  roleText: { color: '#516978', fontWeight: '800', fontSize: 12, textTransform: 'capitalize' },
  roleSelectedText: { color: '#087D65' },
  rolePressed: { opacity: 0.84 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: '#F5FAF8', borderWidth: 1, borderColor: '#E2EFEA', borderRadius: 12, gap: 10 },
  switchCopy: { flex: 1 },
  switchTitle: { color: '#173048', fontSize: 13, fontWeight: '800' },
  switchHint: { color: '#798B99', fontSize: 11, marginTop: 3 },
  saveButton: { marginTop: 5, borderRadius: 15, minHeight: 52, justifyContent: 'center', overflow: 'hidden' },
  modalFootnote: { color: '#798B99', textAlign: 'center', fontSize: 11, lineHeight: 17, marginTop: 1 },
  disabled: { opacity: 0.5 },
});
