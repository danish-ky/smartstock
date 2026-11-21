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
import { LoadNotice, Page, SectionTitle } from '../../components/MobileUI';
import { ListFilters, ListMore, ListSearch, LoadedHint, StatusChip } from '../../components/OrevonListUI';
import { useOrevonPages, type PagePayload } from '../../lib/useOrevonPages';
import { OrevonScreenHero } from '../../components/OrevonScreenHero';
import { EmeraldGradient } from '../../components/OrevonPolish';
import { useAuth } from '../../context/AuthContext';
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
  product_sku?: string;
  movement_type: string;
  quantity: number;
  stock_before?: number | null;
  stock_after?: number | null;
  order_number?: string | null;
  performed_by_name?: string;
  note?: string;
  created_at?: string;
};
type Payload<T> = PagePayload<T>;
type Direction = 'in' | 'out';

type Adjustment = {
  product: number;
  movement_type: Direction;
  quantity: number;
  note: string;
};

function InventoryContent() {
  const { apiGet, apiPost } = useAuth();
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
  const { rows: products, moreAvailable: productNext, loadingMore: loadingProducts, moreError: productPageError, loadMore: loadProductPage } =
    useOrevonPages(data, '/products/', path => apiGet<Payload<Product>>(path));
  const { rows: movements, moreAvailable: movementNext, loadingMore: loadingMovements, moreError: movementPageError, loadMore: loadMovementPage } =
    useOrevonPages(movementsData, '/movements/', path => apiGet<Payload<Movement>>(path));
  const [stockSearch, setStockSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [stockLimit, setStockLimit] = useState(8);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyLimit, setHistoryLimit] = useState(12);
  const stockRows = useMemo(() => products.filter(product => {
    const query = stockSearch.trim().toLowerCase();
    const matches = !query || `${product.name} ${product.sku || ''}`.toLowerCase().includes(query);
    const out = product.stock <= 0;
    const low = !out && typeof product.low_stock_threshold === 'number' && product.stock <= product.low_stock_threshold;
    return matches && (stockFilter === 'all' || (stockFilter === 'out' && out) || (stockFilter === 'low' && low) || (stockFilter === 'healthy' && !out && !low));
  }), [products, stockSearch, stockFilter]);
  const historyRows = useMemo(() => movements.filter(movement => {
    const query = historySearch.trim().toLowerCase();
    return (!query || `${movement.product_name || ''} ${movement.product_sku || ''} ${movement.order_number || ''} ${movement.performed_by_name || ''}`.toLowerCase().includes(query)) &&
      (historyFilter === 'all' || movement.movement_type.toLowerCase() === historyFilter);
  }), [movements, historySearch, historyFilter]);
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

<OrevonScreenHero
        eyebrow="STOCK CONTROL"
        title="Inventory overview"
        description="Adjust stock safely and review every recorded movement."
        stats={[
          { label: 'Loaded', value: products.length },
          { label: 'Low / out', value: products.filter(p => p.stock <= (p.low_stock_threshold ?? 0)).length },
          { label: 'Audit loaded', value: movements.length },
        ]}
      />


      {!!products.length && !error && (
        <>
          <SectionTitle>Stock by product</SectionTitle>
          <ListSearch label="Search loaded inventory" placeholder="Search product or SKU" value={stockSearch} onChangeText={text => { setStockSearch(text); setStockLimit(8); }} />
          <ListFilters value={stockFilter} onChange={value => { setStockFilter(value); setStockLimit(8); }} items={[
            { value: 'all', label: 'All' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }, { value: 'healthy', label: 'In stock' },
          ]} />
          <LoadedHint text={`Showing ${Math.min(stockLimit, stockRows.length)} of ${stockRows.length} matching loaded products${productNext ? ' · More API pages available' : ''}. Search filters loaded records only.`} />
          {stockRows.length === 0 && <Text style={styles.subtext}>No matching products in the loaded list.</Text>}
          {stockRows.slice(0, stockLimit).map(product => {
            const out = product.stock <= 0;
            const low = !out && typeof product.low_stock_threshold === 'number' && product.stock <= product.low_stock_threshold;
            return (
              <View key={product.id} style={styles.productCard}>
                <View style={styles.stockHeading}>
                  <View style={styles.stockNameWrap}>
                    <Text style={styles.stockName} numberOfLines={2}>{product.name}</Text>
                    <Text style={styles.stockSku} numberOfLines={1}>{product.sku || 'No SKU'}</Text>
                  </View>
                  <View style={styles.stockValueWrap}>
                    <Text style={[styles.stockValue, out && styles.stockOutValue, low && styles.stockLowValue]}>{product.stock} units</Text>
                    <StatusChip label={out ? 'Out of stock' : low ? 'Low stock' : 'In stock'} tone={out ? 'danger' : low ? 'warning' : 'success'} />
                  </View>
                </View>
                <View style={[styles.actions, styles.productActions]}>
                  <Pressable accessibilityRole="button" disabled={saving} onPress={() => beginAdjustment(product, 'in')} style={[styles.smallButton, styles.inButton]}>
                    <Text style={styles.inText}>+ Stock In</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" disabled={saving || product.stock === 0} onPress={() => beginAdjustment(product, 'out')} style={[styles.smallButton, styles.outButton, product.stock === 0 && styles.disabled]}>
                    <Text style={styles.outText}>− Stock Out</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
          {stockRows.length > stockLimit && <ListMore label="Show 8 more products" onPress={() => setStockLimit(value => value + 8)} />}
          {!!productPageError && <Text style={styles.error}>{productPageError}</Text>}
          {productNext && <ListMore label="Load next product page" busy={loadingProducts} onPress={() => { void loadProductPage(); }} />}
        </>
      )}

      {selected && <Modal visible transparent animationType="slide" onRequestClose={cancelAdjustment}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScroll}>
            <View style={styles.form}>
          <View style={styles.formAccent} />
          <Text style={styles.formEyebrow}>OREVON / INVENTORY</Text>
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
            placeholderTextColor="#8498A5"
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
            placeholderTextColor="#8498A5"
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
              <EmeraldGradient radius={13} />
              {saving ? <ActivityIndicator color="white" /> : <Text style={styles.confirmText}>Review change</Text>}
            </Pressable>
          </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>}

      <View style={styles.auditHeading}>
        <View style={styles.auditTitleWrap}>
          <SectionTitle>Recent stock activity</SectionTitle>
          <Text style={styles.auditCaption}>Five recent entries · Full audit history remains accessible.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setHistoryOpen(true)} style={styles.viewHistory}>
          <Text style={styles.viewHistoryText}>View all</Text>
        </Pressable>
      </View>
      <LoadNotice loading={movementsBusy && !movementsData} error={movementsError} onRetry={reloadMovements} />
      {!movementsError && movements.slice(0, 5).map(movement => <StockActivity key={movement.id} movement={movement} />)}
      {movementsData && !movements.length && !movementsError && <Text style={styles.subtext}>No stock movements recorded yet.</Text>}

      <Modal visible={historyOpen} animationType="slide" onRequestClose={() => setHistoryOpen(false)}>
        <View style={styles.historyScreen}>
          <View style={styles.historyHeader}>
            <View style={styles.historyTitleWrap}>
              <Text style={styles.historyEyebrow}>OREVON / INVENTORY</Text>
              <Text style={styles.historyTitle}>Stock audit history</Text>
              <Text style={styles.historyHelp}>Read-only records. Stock balances may be missing in older entries.</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setHistoryOpen(false)} style={styles.historyClose}><Text style={styles.historyCloseText}>Close</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.historyContent}>
            <ListSearch label="Search loaded stock movements" placeholder="Product, SKU, order or staff" value={historySearch} onChangeText={value => { setHistorySearch(value); setHistoryLimit(12); }} />
            <ListFilters value={historyFilter} onChange={value => { setHistoryFilter(value); setHistoryLimit(12); }} items={[
              { value: 'all', label: 'All activity' }, { value: 'in', label: 'Stock In' }, { value: 'out', label: 'Stock Out' }, { value: 'sale', label: 'Sales' }, { value: 'return', label: 'Returns' },
            ]} />
            <LoadedHint text={`${Math.min(historyLimit, historyRows.length)} of ${historyRows.length} matching loaded entries. Load more pages to explore older records.`} />
            {historyRows.length === 0 && <Text style={styles.subtext}>No matching movements in loaded history.</Text>}
            {historyRows.slice(0, historyLimit).map(movement => <StockActivity key={movement.id} movement={movement} />)}
            {historyRows.length > historyLimit && <ListMore label="Show 12 more entries" onPress={() => setHistoryLimit(value => value + 12)} />}
            {!!movementPageError && <Text style={styles.error}>{movementPageError}</Text>}
            {movementNext && <ListMore label="Load older audit entries" busy={loadingMovements} onPress={() => { void loadMovementPage(); }} />}
          </ScrollView>
        </View>
      </Modal>
    </Page>
  );
}

function StockActivity({ movement }: { movement: Movement }) {
  const kind = movement.movement_type.toLowerCase();
  const incoming = ['in', 'return'].includes(kind);
  const heading = kind === 'sale' ? 'Stock sold' : kind === 'return' ? 'Stock returned' : incoming ? 'Stock received' : kind === 'out' ? 'Stock removed' : kind.replace(/_/g, ' ');
  const date = movement.created_at ? new Date(movement.created_at) : null;
  const dateText = date && !Number.isNaN(date.valueOf()) ? date.toLocaleString('en-IN') : 'Date unavailable';
  return <View style={styles.activityCard}>
    <View style={styles.activityTop}>
      <View style={[styles.activityIcon, incoming ? styles.activityIn : styles.activityOut]}>
        <Text style={[styles.activitySymbol, incoming ? styles.activityInText : styles.activityOutText]}>{incoming ? '↓' : '↑'}</Text>
      </View>
      <View style={styles.activityBody}>
        <Text style={styles.activityKind}>{heading}</Text>
        <Text numberOfLines={2} style={styles.activityProduct}>{movement.product_name || 'Product'}</Text>
      </View>
      <Text style={[styles.activityQuantity, incoming ? styles.activityInText : styles.activityOutText]}>{incoming ? '+' : '−'}{movement.quantity}</Text>
    </View>
    <View style={styles.activityDetails}>
      <Text style={styles.activityMeta}>{movement.product_sku || 'SKU not recorded'} · {dateText}</Text>
      {movement.stock_before != null && movement.stock_after != null && <Text style={styles.activityMeta}>Balance: {movement.stock_before} → {movement.stock_after} units</Text>}
      {!!movement.order_number && <Text style={styles.activityMeta}>Order {movement.order_number}</Text>}
      {!!movement.performed_by_name && <Text style={styles.activityMeta}>By {movement.performed_by_name}</Text>}
      {!!movement.note && <Text style={styles.activityNote}>{movement.note}</Text>}
    </View>
  </View>;
}

export default function InventoryScreen() {
  const { user } = useAuth();
  if (!user || !['admin', 'manager', 'staff'].includes(user.role)) {
    return <Redirect href="/(app)/dashboard" />;
  }
  return <InventoryContent />;
}

const styles = StyleSheet.create({
  productCard: { marginBottom: 9, padding: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6EBF1', borderRadius: 17, shadowColor: '#12243A', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  auditCaption: { color: '#64758B', fontSize: 11, marginTop: 1, lineHeight: 17 },
  stockHeading: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 12 },
  stockNameWrap: { flex: 1 },
  stockName: { color: '#14243A', fontSize: 14, fontWeight: '800', lineHeight: 19 },
  stockSku: { color: '#718198', fontSize: 11, marginTop: 4 },
  stockValueWrap: { alignItems: 'flex-end', gap: 5 },
  stockValue: { color: '#047857', fontSize: 14, fontWeight: '900' },
  stockOutValue: { color: '#B42336' },
  stockLowValue: { color: '#9B6405' },
  productActions: { marginBottom: 0 },
  auditHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, marginBottom: 12 },
  auditTitleWrap: { flex: 1 },
  viewHistory: { backgroundColor: '#E4F4ED', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10 },
  viewHistoryText: { color: '#047857', fontSize: 12, fontWeight: '800' },
  activityCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3EAF0', padding: 13, borderRadius: 16, marginBottom: 9 },
  activityTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  activityIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  activityIn: { backgroundColor: '#E3F7EE' },
  activityOut: { backgroundColor: '#FCECEB' },
  activitySymbol: { fontSize: 20, fontWeight: '900' },
  activityInText: { color: '#07805F' },
  activityOutText: { color: '#B42336' },
  activityBody: { flex: 1 },
  activityKind: { color: '#22344A', fontSize: 11, fontWeight: '800' },
  activityProduct: { color: '#11243D', fontSize: 13, fontWeight: '800', marginTop: 3 },
  activityQuantity: { fontSize: 15, fontWeight: '900' },
  activityDetails: { paddingLeft: 47, gap: 2, marginTop: 8 },
  activityMeta: { color: '#67778B', fontSize: 11, lineHeight: 17 },
  activityNote: { color: '#334155', fontSize: 11, marginTop: 4, lineHeight: 16 },
  historyScreen: { flex: 1, backgroundColor: '#F5F8FC' },
  historyHeader: { backgroundColor: '#10263C', paddingTop: 52, paddingBottom: 21, paddingHorizontal: 19, flexDirection: 'row', gap: 8, alignItems: 'center' },
  historyTitleWrap: { flex: 1 },
  historyEyebrow: { color: '#6CE4B8', letterSpacing: 1.3, fontSize: 10, fontWeight: '800', marginBottom: 5 },
  historyTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  historyHelp: { color: '#C4D5E4', fontSize: 11, marginTop: 6, lineHeight: 16 },
  historyClose: { backgroundColor: '#D7F5E8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  historyCloseText: { color: '#075A46', fontSize: 12, fontWeight: '800' },
  historyContent: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 44 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  smallButton: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingVertical: 13 },
  inButton: { backgroundColor: '#E3F7EF', borderWidth: 1, borderColor: '#B6EBD7' },
  outButton: { backgroundColor: '#F2F5F9', borderWidth: 1, borderColor: '#DDE5EE' },
  inText: { color: '#047857', fontWeight: '800' },
  outText: { color: '#334155', fontWeight: '800' },
  disabled: { opacity: 0.4 },
  modalBackdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(9,24,36,0.65)' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 28 },
  form: { backgroundColor: '#FFFFFF', borderRadius: 26, padding: 22, borderWidth: 1, borderColor: '#D8ECE5', overflow: 'hidden', elevation: 14, shadowColor: '#041D21', shadowOpacity: 0.16, shadowRadius: 20 },
  formAccent: { position: 'absolute', left: 0, right: 0, top: 0, height: 5, backgroundColor: '#0AB18D' },
  formEyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '900', color: '#0C9072', marginTop: 7, marginBottom: 8 },
  formTitle: { fontSize: 24, fontWeight: '900', color: '#143046' },
  subtext: { fontSize: 13, color: '#657D8C', marginTop: 7, marginBottom: 15, lineHeight: 19 },
  fieldLabel: { color: '#244253', fontSize: 12, fontWeight: '800', marginTop: 13, marginBottom: 9 },
  input: { backgroundColor: '#F9FCFB', borderColor: '#D3E6E0', borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, color: '#17384A', fontSize: 15, minHeight: 53 },
  noteInput: { minHeight: 100, textAlignVertical: 'top' },
  error: { color: '#B91C1C', marginVertical: 12 },
  formButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 13, minHeight: 52 },
  cancelButton: { backgroundColor: '#E4EDF0' },
  confirmButton: { overflow: 'hidden', backgroundColor: '#0A9778', elevation: 2 },
  cancelText: { color: '#3C5365', fontWeight: '800', fontSize: 13 },
  confirmText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
});
