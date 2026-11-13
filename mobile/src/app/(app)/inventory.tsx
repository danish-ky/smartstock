import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { InfoCard, LoadNotice, Page, SectionTitle } from '../../components/MobileUI';
import { useAuth } from '../../context/AuthContext';
import { listItems } from '../../lib/api';
import { useRemote } from '../../lib/useRemote';

type Product = {
  id: number;
  name: string;
  sku?: string;
  stock: number;
  low_stock_threshold?: number;
};
type Movement = {
  id: number;
  product_name?: string;
  movement_type: string;
  quantity: number;
  note?: string;
  created_at?: string;
};
type Payload<T> = T[] | { results?: T[] };
type Direction = 'in' | 'out';

type Adjustment = {
  product: number;
  movement_type: Direction;
  quantity: number;
  note: string;
};

function InventoryContent() {
  const { apiPost } = useAuth();
  const { data, busy, error, reload } = useRemote<Payload<Product>>('/products/');
  const {
    data: movementsData,
    busy: movementsBusy,
    error: movementsError,
    reload: reloadMovements,
  } = useRemote<Payload<Movement>>('/movements/');

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [direction, setDirection] = useState<Direction>('in');
  const [quantityText, setQuantityText] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const products = useMemo(() => listItems(data), [data]);
  const movements = useMemo(() => listItems(movementsData), [movementsData]);
  const selected = products.find(p => p.id === selectedId);

  function beginAdjustment(product: Product, movement: Direction) {
    setSelectedId(product.id);
    setDirection(movement);
    setQuantityText('');
    setNote('');
    setSubmissionError('');
  }

  function cancelAdjustment() {
    if (saving) return;
    setSelectedId(null);
    setSubmissionError('');
  }

  function refreshAll() {
    void Promise.all([reload(), reloadMovements()]);
  }

  function confirmAdjustment() {
    if (!selected || saving) return;
    const trimmedQuantity = quantityText.trim();
    const quantity = Number(trimmedQuantity);
    if (!/^\d+$/.test(trimmedQuantity) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) {
      setSubmissionError('Enter a whole number between 1 and 1,000,000.');
      return;
    }
    if (direction === 'out' && quantity > selected.stock) {
      setSubmissionError(`Only ${selected.stock} units are currently available.`);
      return;
    }
    if (note.length > 240) {
      setSubmissionError('Reason must be 240 characters or less.');
      return;
    }

    const adjustment: Adjustment = {
      product: selected.id,
      movement_type: direction,
      quantity,
      note: note.trim(),
    };
    const verb = direction === 'in' ? 'add to' : 'remove from';

    Alert.alert(
      'Confirm stock adjustment',
      `Are you sure you want to ${verb} ${quantity} unit${quantity === 1 ? '' : 's'} of ${selected.name}? This will be recorded in the stock audit log.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => { void save(adjustment); } },
      ],
    );
  }

  async function save(adjustment: Adjustment) {
    if (saving) return;
    setSaving(true);
    setSubmissionError('');
    try {
      await apiPost('/inventory/adjust/', adjustment);
      setSelectedId(null);
      setQuantityText('');
      setNote('');
      await Promise.all([reload(), reloadMovements()]);
      Alert.alert('Stock updated', 'The adjustment was saved and added to the stock history.');
    } catch (e) {
      setSubmissionError(e instanceof Error ? e.message : 'Could not adjust stock.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page
      title="Inventory"
      subtitle="Stock levels, adjustments and movement history"
      refreshing={busy || movementsBusy}
      onRefresh={refreshAll}
    >
      <LoadNotice loading={busy && !data} error={error} onRetry={reload} empty={!!data && !products.length} />

      {!!products.length && !error && (
        <>
          <SectionTitle>Stock by product</SectionTitle>
          {products.map(product => {
            const low = typeof product.low_stock_threshold === 'number' &&
              product.stock <= product.low_stock_threshold;
            return (
              <View key={product.id} style={styles.productCard}>
                <InfoCard
                  title={product.name}
                  detail={`${product.sku || 'No SKU'}${low ? ' · LOW STOCK' : ''}`}
                  trailing={`${product.stock} units`}
                />
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => beginAdjustment(product, 'in')}
                    style={[styles.smallButton, styles.inButton]}
                  >
                    <Text style={styles.inText}>+ Stock In</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving || product.stock === 0}
                    onPress={() => beginAdjustment(product, 'out')}
                    style={[styles.smallButton, styles.outButton, product.stock === 0 && styles.disabled]}
                  >
                    <Text style={styles.outText}>− Stock Out</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </>
      )}

      {selected && <Modal visible transparent animationType="slide" onRequestClose={cancelAdjustment}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScroll}>
            <View style={styles.form}>
          <Text style={styles.formTitle}>
            {direction === 'in' ? 'Receive stock' : 'Remove stock'}
          </Text>
          <Text style={styles.subtext}>{selected.name} · {selected.stock} available</Text>

          <Text style={styles.fieldLabel}>Quantity</Text>
          <TextInput
            accessibilityLabel="Quantity to adjust"
            value={quantityText}
            onChangeText={text => { setQuantityText(text); setSubmissionError(''); }}
            placeholder="Enter units"
            keyboardType="number-pad"
            style={styles.input}
            editable={!saving}
            maxLength={7}
          />
          <Text style={styles.fieldLabel}>Reason (optional)</Text>
          <TextInput
            accessibilityLabel="Reason for stock adjustment"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Supplier delivery or damaged items"
            multiline
            maxLength={240}
            style={[styles.input, styles.noteInput]}
            editable={!saving}
          />
          {!!submissionError && <Text style={styles.error}>{submissionError}</Text>}
          <View style={styles.actions}>
            <Pressable onPress={cancelAdjustment} disabled={saving} style={[styles.formButton, styles.cancelButton]}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={confirmAdjustment}
              style={[styles.formButton, styles.confirmButton, saving && styles.disabled]}
            >
              {saving ? <ActivityIndicator color="white" /> : <Text style={styles.confirmText}>Review change</Text>}
            </Pressable>
          </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>}

      <SectionTitle>Recent stock movements</SectionTitle>
      <LoadNotice loading={movementsBusy && !movementsData} error={movementsError} onRetry={reloadMovements} />
      {!movementsError && movements.slice(0, 10).map(movement => (
        <InfoCard
          key={movement.id}
          title={`${movement.product_name || 'Product'} · ${movement.movement_type.toUpperCase()}`}
          detail={movement.note || 'Stock movement recorded'}
          trailing={`${movement.quantity} units`}
        />
      ))}
      {movementsData && !movements.length && !movementsError && (
        <Text style={styles.subtext}>No stock movements recorded yet.</Text>
      )}
    </Page>
  );
}

export default function InventoryScreen() {
  const { user } = useAuth();
  if (!user || !['admin', 'manager', 'staff'].includes(user.role)) {
    return <Redirect href="/(app)/dashboard" />;
  }
  return <InventoryContent />;
}

const styles = StyleSheet.create({
  productCard: { marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  smallButton: { flex: 1, alignItems: 'center', borderRadius: 11, paddingVertical: 11 },
  inButton: { backgroundColor: '#D1FAE5' },
  outButton: { backgroundColor: '#E2E8F0' },
  inText: { color: '#047857', fontWeight: '700' },
  outText: { color: '#334155', fontWeight: '700' },
  disabled: { opacity: 0.4 },
  modalBackdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.65)' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  form: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18 },
  formTitle: { fontSize: 19, fontWeight: '800', color: '#0F172A' },
  subtext: { fontSize: 13, color: '#64748B', marginTop: 7, marginBottom: 12 },
  fieldLabel: { color: '#334155', fontWeight: '700', marginTop: 10, marginBottom: 7 },
  input: { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', borderWidth: 1, borderRadius: 10, padding: 12, color: '#0F172A' },
  noteInput: { minHeight: 76, textAlignVertical: 'top' },
  error: { color: '#B91C1C', marginVertical: 12 },
  formButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 11 },
  cancelButton: { backgroundColor: '#E2E8F0' },
  confirmButton: { backgroundColor: '#059669' },
  cancelText: { color: '#334155', fontWeight: '700' },
  confirmText: { color: '#FFFFFF', fontWeight: '700' },
});
