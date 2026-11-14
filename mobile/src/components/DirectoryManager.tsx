import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Page } from './MobileUI';
import { useAuth } from '../context/AuthContext';
import { listItems } from '../lib/api';

type Kind = 'categories' | 'suppliers' | 'customers';
type DirectoryItem = {
  id: number;
  name: string;
  description?: string;
  email?: string;
  phone?: string;
  address?: string;
  total_orders?: number;
};
type DirectoryResponse = DirectoryItem[] | {
  results?: DirectoryItem[];
  count?: number;
  next?: string | null;
  previous?: string | null;
};
type Editor = {
  name: string;
  description: string;
  email: string;
  phone: string;
  address: string;
};
const blank: Editor = { name: '', description: '', email: '', phone: '', address: '' };
const labels: Record<Kind, { single: string; plural: string; subtitle: string }> = {
  categories: { single: 'category', plural: 'Categories', subtitle: 'Organize your product catalog' },
  suppliers: { single: 'supplier', plural: 'Suppliers', subtitle: 'Manage sourcing partners and contacts' },
  customers: { single: 'customer', plural: 'Customers', subtitle: 'Maintain customer contact records' },
};

function FormField({ label, value, onChange, multiline = false, keyboardType = 'default', maxLength = 160 }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor="#94A3B8"
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        autoCorrect={keyboardType === 'default'}
        multiline={multiline}
        maxLength={maxLength}
      />
    </View>
  );
}

function getError(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

export default function DirectoryManager({ kind }: { kind: Kind }) {
  const { user, apiGet, apiPost, apiPatch, apiDelete } = useAuth();
  const role = user?.role;
  const canOperate = role === 'admin' || role === 'manager' || role === 'staff';
  const canWrite = kind === 'customers' ? canOperate : role === 'admin' || role === 'manager';
  const canRead = kind === 'categories' || canOperate;
  const config = labels[kind];

  const [records, setRecords] = useState<DirectoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<DirectoryItem | null>(null);
  const [form, setForm] = useState<Editor>(blank);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setFetchError('');
    try {
      const result = await apiGet<DirectoryResponse>(`/${kind}/?page=${page}`);
      setRecords(listItems(result));
      if (Array.isArray(result)) {
        setTotal(result.length);
        setHasNext(false);
      } else {
        setTotal(typeof result.count === 'number' ? result.count : null);
        setHasNext(Boolean(result.next));
      }
    } catch (error) {
      setFetchError(getError(error));
    } finally {
      setLoading(false);
    }
  }, [apiGet, canRead, kind, page]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? records.filter(item =>
      [item.name, item.description, item.email, item.phone, item.address]
        .some(value => (value || '').toLowerCase().includes(q)),
    ) : records;
  }, [records, search]);

  function openEditor(item?: DirectoryItem) {
    if (!canWrite) return;
    setEditing(item ?? null);
    setForm(item ? {
      name: item.name,
      description: item.description ?? '',
      email: item.email ?? '',
      phone: item.phone ?? '',
      address: item.address ?? '',
    } : { ...blank });
    setFormError('');
    setFormOpen(true);
  }

  function change(field: keyof Editor, value: string) {
    setForm(current => ({ ...current, [field]: value }));
  }

  async function save() {
    if (!canWrite || saving) return;
    const name = form.name.trim();
    if (!name) { setFormError('Name is required.'); return; }
    if (name.length > (kind === 'categories' ? 120 : 160)) {
      setFormError('Name exceeds the allowed length.'); return;
    }
    if (kind !== 'categories' && form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setFormError('Enter a valid email address.'); return;
    }
    if (form.phone.trim().length > 30) { setFormError('Phone is too long.'); return; }

    const body = kind === 'categories'
      ? { name, description: form.description.trim() }
      : { name, email: form.email.trim(), phone: form.phone.trim(), address: form.address.trim() };
    setSaving(true);
    setFormError('');
    try {
      if (editing) await apiPatch(`/${kind}/${editing.id}/`, body);
      else await apiPost(`/${kind}/`, body);
      setFormOpen(false);
      setNotice(`${config.single[0].toUpperCase()}${config.single.slice(1)} ${editing ? 'updated' : 'created'} successfully.`);
      await load();
    } catch (error) {
      setFormError(getError(error));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(item: DirectoryItem) {
    if (!canWrite || deletingId !== null) return;
    Alert.alert(
      `Delete ${config.single}?`,
      `Delete “${item.name}”? Records linked to products or orders may be protected by the server.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { void remove(item); } },
      ],
    );
  }

  async function remove(item: DirectoryItem) {
    if (!canWrite || deletingId !== null) return;
    setDeletingId(item.id);
    setNotice('');
    try {
      await apiDelete(`/${kind}/${item.id}/`);
      setNotice(`${config.single[0].toUpperCase()}${config.single.slice(1)} deleted.`);
      if (records.length === 1 && page > 1) setPage(previous => previous - 1);
      else await load();
    } catch (error) {
      Alert.alert('Unable to delete', `${getError(error)}\n\nThis record may be linked to existing products or orders.`);
    } finally {
      setDeletingId(null);
    }
  }

  if (!canRead) {
    return <Page title="Access restricted" subtitle="This directory is for Orevon operators."><Text>Access denied.</Text></Page>;
  }

  return (
    <Page title={config.plural} subtitle={config.subtitle} refreshing={loading} onRefresh={() => { void load(); }}>
      {canWrite ? (
        <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={() => openEditor()}>
          <Text style={styles.primaryText}>+ Add {config.single}</Text>
        </Pressable>
      ) : (
        <View style={styles.readOnly}><Text style={styles.readOnlyText}>Read-only access for your role</Text></View>
      )}
      <TextInput
        accessibilityLabel="Filter records on this page"
        value={search}
        onChangeText={setSearch}
        placeholder="Filter records on this page..."
        placeholderTextColor="#94A3B8"
        style={styles.searchInput}
        autoCorrect={false}
      />
      {!!notice && <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>}
      {!!fetchError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{fetchError}</Text>
          <Pressable onPress={() => { void load(); }} style={styles.retryButton}><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      )}
      {loading && <ActivityIndicator color="#059669" style={styles.loading} />}
      {!loading && !fetchError && visible.length === 0 && (
        <Text style={styles.empty}>No {config.plural.toLowerCase()} found on this page.</Text>
      )}
      {!loading && !fetchError && visible.map(item => (
        <View key={item.id} style={styles.record}>
          <Text style={styles.recordTitle}>{item.name}</Text>
          {kind === 'categories' ? (
            <Text style={styles.recordMeta}>{item.description?.trim() || 'No description'}</Text>
          ) : (
            <>
              {!!item.email && <Text style={styles.recordMeta}>{item.email}</Text>}
              {!!item.phone && <Text style={styles.recordMeta}>{item.phone}</Text>}
              {!!item.address && <Text style={styles.recordMeta}>{item.address}</Text>}
              {kind === 'customers' && typeof item.total_orders === 'number' && (
                <Text style={styles.recordMeta}>{item.total_orders} linked orders</Text>
              )}
            </>
          )}
          {canWrite && (
            <View style={styles.recordActions}>
              <Pressable accessibilityRole="button" onPress={() => openEditor(item)} style={styles.editButton}>
                <Text style={styles.editText}>Edit</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={deletingId !== null}
                onPress={() => confirmDelete(item)}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteText}>{deletingId === item.id ? 'Deleting...' : 'Delete'}</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}
      {!loading && !fetchError && (
        <View style={styles.pagination}>
          <Pressable
            accessibilityRole="button"
            disabled={page <= 1}
            onPress={() => { setSearch(''); setPage(previous => Math.max(1, previous - 1)); }}
            style={[styles.pageButton, page <= 1 && styles.disabled]}
          >
            <Text style={styles.pageButtonText}>Previous</Text>
          </Pressable>
          <View style={styles.pageCenter}>
            <Text style={styles.pageText}>Page {page}</Text>
            {total !== null && <Text style={styles.totalText}>{total} total</Text>}
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={!hasNext}
            onPress={() => { setSearch(''); setPage(previous => previous + 1); }}
            style={[styles.pageButton, !hasNext && styles.disabled]}
          >
            <Text style={styles.pageButtonText}>Next</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={formOpen} animationType="slide" onRequestClose={() => { if (!saving) setFormOpen(false); }}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editing ? 'Edit' : 'Add'} {config.single}</Text>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => setFormOpen(false)}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
            <FormField label="Name *" value={form.name} onChange={value => change('name', value)} maxLength={kind === 'categories' ? 120 : 160} />
            {kind === 'categories' ? (
              <FormField label="Description" value={form.description} onChange={value => change('description', value)} multiline maxLength={2000} />
            ) : (
              <>
                <FormField label="Email" value={form.email} onChange={value => change('email', value)} keyboardType="email-address" maxLength={254} />
                <FormField label="Phone" value={form.phone} onChange={value => change('phone', value)} keyboardType="phone-pad" maxLength={30} />
                <FormField label="Address" value={form.address} onChange={value => change('address', value)} multiline maxLength={2000} />
              </>
            )}
            {!!formError && <Text accessibilityRole="alert" style={styles.errorText}>{formError}</Text>}
            <Pressable accessibilityRole="button" onPress={() => { void save(); }} disabled={saving} style={[styles.primaryButton, saving && styles.disabled]}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{editing ? 'Save changes' : `Create ${config.single}`}</Text>}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </Page>
  );
}

const styles = StyleSheet.create({
  primaryButton: { backgroundColor: '#047857', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginBottom: 13 },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  readOnly: { backgroundColor: '#DBEAFE', borderRadius: 11, padding: 12, marginBottom: 12 },
  readOnlyText: { color: '#1E40AF', fontWeight: '700', fontSize: 12 },
  searchInput: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderWidth: 1, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, color: '#0F172A' },
  record: { backgroundColor: '#FFFFFF', borderRadius: 13, padding: 16, marginBottom: 10 },
  recordTitle: { color: '#0F172A', fontSize: 16, fontWeight: '800' },
  recordMeta: { color: '#64748B', marginTop: 6, fontSize: 12, lineHeight: 18 },
  recordActions: { flexDirection: 'row', gap: 10, marginTop: 15 },
  editButton: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 9, backgroundColor: '#ECFDF5' },
  editText: { color: '#047857', fontWeight: '800' },
  deleteButton: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 9, backgroundColor: '#FEF2F2' },
  deleteText: { color: '#B91C1C', fontWeight: '800' },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 18 },
  pageButton: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 9, backgroundColor: '#334155' },
  pageButtonText: { color: '#FFFFFF', fontWeight: '700' },
  pageCenter: { alignItems: 'center' },
  pageText: { color: '#334155', fontWeight: '700', fontSize: 12 },
  totalText: { color: '#64748B', marginTop: 3, fontSize: 11 },
  disabled: { opacity: 0.45 },
  notice: { color: '#047857', marginBottom: 12, fontWeight: '700', fontSize: 12 },
  errorBox: { padding: 15, borderRadius: 11, marginBottom: 14, backgroundColor: '#FEF2F2' },
  errorText: { color: '#B91C1C', fontSize: 12, lineHeight: 18, marginBottom: 12 },
  retryButton: { backgroundColor: '#B91C1C', alignSelf: 'flex-start', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  loading: { marginVertical: 24 },
  empty: { color: '#64748B', textAlign: 'center', padding: 20 },
  modalRoot: { flex: 1, backgroundColor: '#F8FAFC' },
  modalHeader: { paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: '#0F172A', fontSize: 21, fontWeight: '800' },
  closeText: { color: '#047857', fontWeight: '700' },
  modalContent: { padding: 20, paddingBottom: 45 },
  field: { marginBottom: 17 },
  fieldLabel: { color: '#334155', fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14 },
  multiline: { minHeight: 95, textAlignVertical: 'top' },
});
