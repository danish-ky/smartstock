import { useMemo, useRef, useState } from 'react';
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

type Item = {
  id?: number;
  product?: number;
  product_name?: string;
  sku?: string;
  quantity?: number;
  unit_price?: string | number;
  subtotal?: string | number;
};
type Order = {
  id: number;
  number?: string;
  customer_name?: string;
  status?: string;
  total?: string | number;
  notes?: string;
  payment_status?: string;
  created_at?: string;
  items?: Item[];
};
type Customer = { id: number; name: string; email?: string };
type Product = {
  id: number;
  name: string;
  sku?: string;
  stock?: number;
  is_active?: boolean;
  price?: string | number;
  selling_price?: string | number;
};
type ListPayload<T> = T[] | { results?: T[]; next?: string | null };
type PaymentRecord = {
  id: number;
  amount: string | number;
  method: string;
  created_at?: string;
  reference?: string; // Operator-only field; the backend hides it from customers.
};
type Payments = {
  payment_status: 'unpaid' | 'partial' | 'paid' | string;
  paid_amount?: string | number;
  payments?: PaymentRecord[];
};
type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank';
const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI received' },
  { value: 'card', label: 'Card terminal' },
  { value: 'bank', label: 'Bank transfer' },
];

// Integer paise avoid floating-point errors in UI balance checks.
// Django remains the authoritative validator of outstanding amounts.
function paise(value: string | number | undefined): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ''] = raw.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

type OrderAction = 'fulfill' | 'cancel';

function amount(value: string | number | undefined) {
  const number = Number(value);
  return value == null || !Number.isFinite(number) ? '—' : `₹${number.toFixed(2)}`;
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
function labelStatus(status: string | undefined) {
  return (status || 'unknown').replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase());
}

export default function OrdersScreen() {
  const { user, apiGet, apiPost, apiOpenPdf } = useAuth();
  const isCustomer = user?.role === 'user';
  const canOperate = ['admin', 'manager', 'staff'].includes(user?.role ?? '');
  const path = isCustomer ? '/my/orders/' : '/orders/';
  const { data, busy, error, reload } = useRemote<ListPayload<Order>>(path);
  const orders = useMemo(() => listItems(data), [data]);

  const [createOpen, setCreateOpen] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [limitedList, setLimitedList] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const writeLock = useRef(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<Order | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [payments, setPayments] = useState<Payments | null>(null);
  const [paymentError, setPaymentError] = useState('');
  const [acting, setActing] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [recordError, setRecordError] = useState('');
  const [requiresPaymentRefresh, setRequiresPaymentRefresh] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  const orderTotalPaise = paise(selected?.total);
  const paidPaise = paise(payments?.paid_amount);
  const outstandingPaise = orderTotalPaise !== null && paidPaise !== null
    ? Math.max(0, orderTotalPaise - paidPaise) : null;

  const filteredCustomers = useMemo(() => customers.filter(c =>
    `${c.name} ${c.email ?? ''}`.toLowerCase().includes(customerSearch.trim().toLowerCase())), [customers, customerSearch]);
  const filteredProducts = useMemo(() => products.filter(p =>
    `${p.name} ${p.sku ?? ''}`.toLowerCase().includes(productSearch.trim().toLowerCase())), [products, productSearch]);
  const lines = useMemo(() => products.filter(p => (quantities[p.id] ?? 0) > 0).map(p => ({
    product: p.id,
    quantity: quantities[p.id],
    name: p.name,
    stock: p.stock ?? 0,
    unitPrice: Number(p.price ?? p.selling_price),
  })), [products, quantities]);
  const estimateKnown = lines.every(line => Number.isFinite(line.unitPrice));
  const estimatedTotal = lines.reduce((total, line) =>
    total + (Number.isFinite(line.unitPrice) ? line.unitPrice * line.quantity : 0), 0);
  const chosenCustomer = customers.find(c => c.id === customerId);

  async function openCreate() {
    if (!canOperate) return;
    setCreateOpen(true);
    setLookupBusy(true);
    setLookupError('');
    setFormError('');
    setCustomerId(null);
    setQuantities({});
    setCustomerSearch('');
    setProductSearch('');
    setNotes('');
    try {
      const [customerPayload, productPayload] = await Promise.all([
        apiGet<ListPayload<Customer>>('/customers/'),
        apiGet<ListPayload<Product>>('/products/'),
      ]);
      setCustomers(listItems(customerPayload));
      setProducts(listItems(productPayload).filter(p => p.is_active !== false));
      setLimitedList(Boolean((!Array.isArray(customerPayload) && customerPayload.next) ||
        (!Array.isArray(productPayload) && productPayload.next)));
    } catch (e) {
      setLookupError(errorText(e));
    } finally {
      setLookupBusy(false);
    }
  }

  function adjustQuantity(product: Product, delta: number) {
    const available = typeof product.stock === 'number' && Number.isSafeInteger(product.stock) ? Math.max(0, product.stock) : 0;
    setQuantities(previous => {
      const quantity = Math.max(0, Math.min(available, (previous[product.id] ?? 0) + delta));
      const next = { ...previous };
      if (quantity === 0) delete next[product.id];
      else next[product.id] = quantity;
      return next;
    });
    setFormError('');
  }

  function confirmCreate() {
    if (saving || writeLock.current) return;
    if (!chosenCustomer) {
      setFormError('Select a customer first.');
      return;
    }
    if (!lines.length) {
      setFormError('Choose at least one product.');
      return;
    }
    if (lines.some(line => !Number.isSafeInteger(line.quantity) || line.quantity < 1 ||
      line.quantity > line.stock || line.quantity > 1000000)) {
      setFormError('One or more quantities exceed available stock. Reload products and try again.');
      return;
    }
    if (notes.length > 2000) {
      setFormError('Notes must be 2,000 characters or fewer.');
      return;
    }
    Alert.alert(
      'Place sales order?',
      `Customer: ${chosenCustomer.name}\n${lines.length} product(s), ${lines.reduce((sum, l) => sum + l.quantity, 0)} unit(s)\n` +
      `${estimateKnown ? `Estimated total: ${amount(estimatedTotal)}\n` : ''}Stock will be deducted immediately. Final prices are calculated by Django.`,
      [
        { text: 'Go back', style: 'cancel' },
        { text: 'Place order', onPress: () => { void submitCreate(); } },
      ],
    );
  }

  async function submitCreate() {
    if (writeLock.current || !canOperate || customerId === null || !lines.length) return;
    writeLock.current = true;
    setSaving(true);
    setFormError('');
    try {
      const created = await apiPost<Order>('/orders/', {
        customer: customerId,
        items: lines.map(line => ({ product: line.product, quantity: line.quantity })),
        notes: notes.trim(),
      });
      setCreateOpen(false);
      await reload();
      Alert.alert('Order created', `${created.number || `Order #${created.id}`} was saved. Product stock has been updated.`);
    } catch (e) {
      setFormError(errorText(e));
    } finally {
      writeLock.current = false;
      setSaving(false);
    }
  }

  async function loadDetail(order: Order) {
    setDetailBusy(true);
    setDetailError('');
    setPaymentError('');
    setRecordError('');
    setPayments(null);
    try {
      const latest = await apiGet<Order>(isCustomer ? `/my/orders/${order.id}/` : `/orders/${order.id}/`);
      setSelected(latest);
    } catch (e) {
      setDetailError(errorText(e));
    }
    // GET supports operators and customers limited to their own order.
    if (canOperate || isCustomer) {
      try {
        setPayments(await apiGet<Payments>(`/orders/${order.id}/payments/`));
        setRequiresPaymentRefresh(false);
      } catch (e) {
        setPaymentError(`Payment status could not be checked: ${errorText(e)}`);
      }
    }
    setDetailBusy(false);
  }

  function showOrder(order: Order) {
    setSelected(order);
    setPaymentAmount('');
    setPaymentMethod('cash');
    setPaymentReference('');
    setRecordError('');
    setRequiresPaymentRefresh(false);
    setDetailOpen(true);
    void loadDetail(order);
  }

  function confirmAction(action: OrderAction) {
    if (!selected || !canOperate || acting || writeLock.current || selected.status !== 'placed') return;
    if (action === 'cancel' && payments?.payment_status !== 'unpaid') return;
    Alert.alert(
      action === 'fulfill' ? 'Fulfill order?' : 'Cancel unpaid order?',
      action === 'fulfill'
        ? `Mark ${selected.number || `Order #${selected.id}`} as fulfilled?`
        : `Cancel ${selected.number || `Order #${selected.id}`} and return its products to stock? Cancellation is not permitted for orders with payments.`,
      [
        { text: 'Keep order', style: 'cancel' },
        { text: action === 'fulfill' ? 'Fulfill' : 'Cancel order', style: action === 'cancel' ? 'destructive' : 'default',
          onPress: () => { void submitAction(action); } },
      ],
    );
  }

  async function submitAction(action: OrderAction) {
    if (!selected || !canOperate || acting || writeLock.current) return;
    const id = selected.id;
    writeLock.current = true;
    setActing(true);
    setDetailError('');
    try {
      if (action === 'cancel') {
        // Never allow cancellation based only on a stale cached payment state.
        const latest = await apiGet<Payments>(`/orders/${id}/payments/`);
        setPayments(latest);
        if (latest.payment_status !== 'unpaid') {
          throw new Error('This order has a payment and cannot be cancelled here.');
        }
      }
      const updated = await apiPost<Order>(`/orders/${id}/${action}/`, {});
      setSelected(updated);
      await reload();
      // Fetch up-to-date details and payment status from the server after mutation.
      await loadDetail(updated);
      Alert.alert('Order updated', `${updated.number || `Order #${updated.id}`} is now ${updated.status || action}.`);
    } catch (e) {
      setDetailError(errorText(e));
    } finally {
      writeLock.current = false;
      setActing(false);
    }
  }

  function confirmManualPayment() {
    if (!canOperate || !selected || !payments || selected.status === 'cancelled' ||
      acting || detailBusy || !!detailError || requiresPaymentRefresh || writeLock.current) return;
    const toRecord = paise(paymentAmount);
    if (toRecord === null || toRecord <= 0) {
      setRecordError('Enter a positive amount with at most two decimal places.');
      return;
    }
    if (outstandingPaise === null || toRecord > outstandingPaise) {
      setRecordError('Amount exceeds the remaining balance. Refresh payment history.');
      return;
    }
    if (paymentReference.length > 120) {
      setRecordError('Reference must be 120 characters or fewer.');
      return;
    }
    setRecordError('');
    const selectedMethod = PAYMENT_METHODS.find(m => m.value === paymentMethod)?.label || paymentMethod;
    const enteredAmount = paymentAmount.trim();
    const enteredReference = paymentReference.trim();
    Alert.alert(
      'Record payment already received?',
      `${selected.number || `Order #${selected.id}`}\nAmount: ${amount(enteredAmount)}\nMethod: ${selectedMethod}\n\n` +
      'This records an offline payment in SmartStock. It does NOT charge the customer. Confirm that money was actually received.',
      [
        { text: 'Go back', style: 'cancel' },
        { text: 'Record payment', onPress: () => { void submitManualPayment(selected.id, enteredAmount, paymentMethod, enteredReference); } },
      ],
    );
  }

  async function submitManualPayment(orderId: number, enteredAmount: string, method: PaymentMethod, reference: string) {
    if (!canOperate || acting || writeLock.current || !!detailError || requiresPaymentRefresh || selected?.id !== orderId) return;
    writeLock.current = true;
    setActing(true);
    setRecordError('');
    try {
      // Backend validates roles, order status, pending checkout and remaining balance.
      await apiPost(`/orders/${orderId}/payments/`, {
        amount: enteredAmount,
        method,
        reference,
      });
      setPaymentAmount('');
      setPaymentReference('');
      await loadDetail(selected);
      await reload();
      Alert.alert('Payment recorded', 'Payment saved. Review payment history and the updated balance.');
    } catch (error) {
      // A dropped connection can occur after the server recorded a payment.
      // Never retry automatically: refreshing history avoids duplicate records.
      setRequiresPaymentRefresh(true);
      setRecordError(`${errorText(error)} Refresh payment history before attempting again.`);
    } finally {
      writeLock.current = false;
      setActing(false);
    }
  }

  async function openInvoice(order: Order) {
    if (invoiceBusy) return;
    setInvoiceBusy(true);
    try {
      await apiOpenPdf(`/orders/${order.id}/invoice/`, `${order.number || `order-${order.id}`}-invoice.pdf`);
    } catch (error) {
      Alert.alert('Invoice unavailable', errorText(error));
    } finally {
      setInvoiceBusy(false);
    }
  }

  return (
    <Page
      title={isCustomer ? 'My Orders' : 'Orders'}
      subtitle={isCustomer ? 'Your purchases and order status' : 'Create, track and manage sales orders'}
      refreshing={busy}
      onRefresh={reload}
    >
      {canOperate && (
        <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={() => { void openCreate(); }}>
          <Text style={styles.primaryText}>+ Create Order</Text>
        </Pressable>
      )}
      <LoadNotice loading={busy && !data} error={error} onRetry={reload} empty={!!data && !orders.length} />
      {!!orders.length && !error && (
        <>
          <SectionTitle>{orders.length} {isCustomer ? 'my orders' : 'orders'}</SectionTitle>
          {orders.map(order => (
            <Pressable
              key={order.id}
              accessibilityRole="button"
              accessibilityLabel={`View ${order.number || `order ${order.id}`}`}
              onPress={() => showOrder(order)}
            >
              <InfoCard
                title={order.number || `Order #${order.id}`}
                detail={`${order.customer_name && !isCustomer ? `${order.customer_name} · ` : ''}${labelStatus(order.status)} · Tap for details`}
                trailing={amount(order.total)}
              />
            </Pressable>
          ))}
        </>
      )}
      {!isCustomer && <Text style={styles.hint}>Creating an order reserves stock immediately. Pull down to refresh this list.</Text>}

      {/* Operator-only create order dialog; customers never load its data. */}
      <Modal visible={createOpen && canOperate} animationType="slide" onRequestClose={() => { if (!saving) setCreateOpen(false); }}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New sales order</Text>
              <Pressable disabled={saving} onPress={() => setCreateOpen(false)} accessibilityRole="button"><Text style={styles.closeText}>Close</Text></Pressable>
            </View>
            <Text style={styles.hint}>Orders immediately reduce stock. Use demo products for your first test.</Text>
            {lookupBusy && <ActivityIndicator color="#059669" style={{ marginVertical: 24 }} />}
            {!!lookupError && <Text style={styles.error}>{lookupError}</Text>}
            {!lookupBusy && !lookupError && (
              <>
                {limitedList && <Text style={styles.warning}>This form shows only the first API page of customers/products. Use SmartStock Web if an item is missing.</Text>}
                <SectionTitle>1. Select customer</SectionTitle>
                <TextInput
                  style={styles.input}
                  accessibilityLabel="Search customers"
                  placeholder="Search customers"
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                  autoCorrect={false}
                />
                {!filteredCustomers.length && <Text style={styles.hint}>No customers found. Create a customer in SmartStock Web first.</Text>}
                {filteredCustomers.map(customer => (
                  <Pressable
                    key={customer.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: customerId === customer.id }}
                    onPress={() => { setCustomerId(customer.id); setFormError(''); }}
                    style={[styles.choice, customerId === customer.id && styles.choiceSelected]}
                  >
                    <Text style={styles.choiceTitle}>{customerId === customer.id ? '◉' : '○'} {customer.name}</Text>
                    {!!customer.email && <Text style={styles.choiceMeta}>{customer.email}</Text>}
                  </Pressable>
                ))}
                <SectionTitle>2. Choose products and quantities</SectionTitle>
                <TextInput
                  style={styles.input}
                  accessibilityLabel="Search products"
                  placeholder="Search products by name or SKU"
                  value={productSearch}
                  onChangeText={setProductSearch}
                  autoCorrect={false}
                />
                {!filteredProducts.length && <Text style={styles.hint}>No products found.</Text>}
                {filteredProducts.map(product => {
                  const available = typeof product.stock === 'number' && Number.isSafeInteger(product.stock) ? Math.max(0, product.stock) : 0;
                  const qty = quantities[product.id] ?? 0;
                  return (
                    <View key={product.id} style={styles.productRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.choiceTitle}>{product.name}</Text>
                        <Text style={styles.choiceMeta}>{product.sku || 'No SKU'} · {available} in stock · {amount(product.price ?? product.selling_price)}</Text>
                      </View>
                      <View style={styles.qtyControls}>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Remove one ${product.name}`} disabled={qty === 0 || saving}
                          style={[styles.qtyButton, qty === 0 && styles.disabled]} onPress={() => adjustQuantity(product, -1)}>
                          <Text style={styles.qtyButtonText}>−</Text>
                        </Pressable>
                        <Text style={styles.qtyText}>{qty}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Add one ${product.name}`} disabled={qty >= available || saving}
                          style={[styles.qtyButton, qty >= available && styles.disabled]} onPress={() => adjustQuantity(product, 1)}>
                          <Text style={styles.qtyButtonText}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
                <SectionTitle>3. Notes (optional)</SectionTitle>
                <TextInput
                  style={[styles.input, styles.notes]}
                  multiline
                  textAlignVertical="top"
                  value={notes}
                  onChangeText={setNotes}
                  maxLength={2000}
                  placeholder="Additional order notes"
                  editable={!saving}
                />
                <View style={styles.summary}>
                  <Text style={styles.summaryTitle}>Order preview</Text>
                  <Text style={styles.summaryText}>{chosenCustomer?.name || 'No customer selected'} · {lines.length} product(s), {lines.reduce((sum, l) => sum + l.quantity, 0)} unit(s)</Text>
                  {lines.map(line => <Text key={line.product} style={styles.summaryText}>{line.name} × {line.quantity}</Text>)}
                  <Text style={styles.summaryTitle}>{estimateKnown ? `Estimated total: ${amount(estimatedTotal)}` : 'Final total calculated by server'}</Text>
                </View>
                {!!formError && <Text style={styles.error}>{formError}</Text>}
                <Pressable accessibilityRole="button" disabled={saving} onPress={confirmCreate} style={[styles.primaryButton, saving && styles.disabled]}>
                  {saving ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>Review & Place Order</Text>}
                </Pressable>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Details are fetched from the correct role-scoped endpoint. */}
      <Modal visible={detailOpen} animationType="slide" onRequestClose={() => { if (!acting) setDetailOpen(false); }}>
        <View style={styles.modalRoot}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selected?.number || `Order #${selected?.id ?? ''}`}</Text>
              <Pressable accessibilityRole="button" disabled={acting} onPress={() => setDetailOpen(false)}><Text style={styles.closeText}>Close</Text></Pressable>
            </View>
            {detailBusy && <ActivityIndicator color="#059669" style={{ marginVertical: 12 }} />}
            {!!detailError && <Text style={styles.error}>{detailError}</Text>}
            {selected && (
              <>
                <View style={styles.summary}>
                  <Text style={styles.summaryTitle}>Status: {labelStatus(selected.status)}</Text>
                  {!isCustomer && <Text style={styles.summaryText}>Customer: {selected.customer_name || 'Unknown'}</Text>}
                  <Text style={styles.summaryText}>Total: {amount(selected.total)}</Text>
                  {!!selected.created_at && <Text style={styles.summaryText}>Placed: {new Date(selected.created_at).toLocaleDateString()}</Text>}
                  {!!selected.notes && <Text style={styles.summaryText}>Notes: {selected.notes}</Text>}
                </View>
                <Pressable accessibilityRole="button" disabled={invoiceBusy || detailBusy || acting || !!detailError}
                  onPress={() => { void openInvoice(selected); }}
                  style={[styles.primaryButton, (invoiceBusy || detailBusy || acting || !!detailError) && styles.disabled]}>
                  {invoiceBusy ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>Open / Share Invoice PDF</Text>}
                </Pressable>
                <Text style={styles.hint}>The invoice is a demo document, not a GST tax invoice. Customers may view only their own invoices.</Text>
                <SectionTitle>Order items</SectionTitle>
                {selected.items?.length ? selected.items.map((item, i) => (
                  <InfoCard key={item.id ?? i} title={item.product_name || item.sku || `Product #${item.product ?? ''}`}
                    detail={`${item.quantity ?? 0} × ${amount(item.unit_price)}`}
                    trailing={amount(item.subtotal)} />
                )) : <Text style={styles.hint}>No item details available.</Text>}
                {(canOperate || isCustomer) && (
                  <>
                    <SectionTitle>Billing & payment status</SectionTitle>
                    {payments ? (
                      <View style={styles.summary}>
                        <Text style={styles.summaryTitle}>Payment: {labelStatus(payments.payment_status)}</Text>
                        <Text style={styles.summaryText}>Order total: {amount(selected.total)}</Text>
                        <Text style={styles.summaryText}>Amount received: {amount(payments.paid_amount)}</Text>
                        <Text style={styles.balanceText}>Outstanding: {outstandingPaise === null ? 'Unavailable' : amount(outstandingPaise / 100)}</Text>
                      </View>
                    ) : <Text style={styles.hint}>{paymentError || (detailBusy ? 'Checking payments...' : 'Payment details unavailable. Please refresh.')}</Text>}
                    {payments && (
                      <>
                        <SectionTitle>Payment history</SectionTitle>
                        {payments.payments?.length ? payments.payments.map(record => (
                          <InfoCard key={record.id}
                            title={`${labelStatus(record.method)} · ${amount(record.amount)}`}
                            detail={`${record.created_at ? new Date(record.created_at).toLocaleString() : 'Date not provided'}${record.reference && canOperate ? ` · Ref: ${record.reference}` : ''}`}
                          />
                        )) : <Text style={styles.hint}>No payments recorded yet.</Text>}
                      </>
                    )}
                    {canOperate && !detailError && selected.status !== 'cancelled' && payments &&
                      outstandingPaise !== null && outstandingPaise > 0 && (
                      <View style={styles.manualPayment}>
                        <Text style={styles.summaryTitle}>Record an offline payment</Text>
                        <Text style={styles.hint}>Only record money already received outside this app. This does not charge a card or UPI account.</Text>
                        <Text style={styles.labelText}>Amount (INR)</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. 250.00"
                          keyboardType="decimal-pad"
                          value={paymentAmount}
                          onChangeText={setPaymentAmount}
                          maxLength={15}
                          editable={!acting}
                          accessibilityLabel="Amount received"
                        />
                        <Text style={styles.labelText}>Payment method</Text>
                        <View style={styles.paymentMethods}>
                          {PAYMENT_METHODS.map(method => (
                            <Pressable key={method.value} accessibilityRole="button"
                              accessibilityState={{ selected: paymentMethod === method.value, disabled: acting }}
                              disabled={acting}
                              style={[styles.methodButton, paymentMethod === method.value && styles.methodSelected]}
                              onPress={() => { setPaymentMethod(method.value); setRecordError(''); }}>
                              <Text style={[styles.methodText, paymentMethod === method.value && styles.methodTextSelected]}>{method.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <Text style={styles.labelText}>Reference (optional)</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="Transaction/reference ID"
                          value={paymentReference}
                          onChangeText={setPaymentReference}
                          maxLength={120}
                          editable={!acting}
                          accessibilityLabel="Payment reference"
                        />
                        <Text style={styles.hint}>Do not enter card numbers, PINs, passwords or UPI credentials here.</Text>
                        {!!recordError && <Text style={styles.error}>{recordError}</Text>}
                        {requiresPaymentRefresh && <Text style={styles.warning}>Refresh details before recording another payment.</Text>}
                        <Pressable accessibilityRole="button"
                          disabled={acting || detailBusy || requiresPaymentRefresh}
                          onPress={confirmManualPayment}
                          style={[styles.primaryButton, (acting || detailBusy || requiresPaymentRefresh) && styles.disabled]}>
                          {acting ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>Review & Record Payment</Text>}
                        </Pressable>
                      </View>
                    )}
                    {canOperate && selected.status === 'placed' && (
                      <View style={styles.actions}>
                        <Pressable accessibilityRole="button" style={[styles.actionButton, styles.fulfillButton, acting && styles.disabled]}
                          disabled={acting || detailBusy || !!detailError} onPress={() => confirmAction('fulfill')}>
                          <Text style={styles.actionText}>Fulfill</Text>
                        </Pressable>
                        <Pressable accessibilityRole="button" style={[styles.actionButton, styles.cancelButton,
                          (acting || detailBusy || !!detailError || payments?.payment_status !== 'unpaid') && styles.disabled]}
                          disabled={acting || detailBusy || !!detailError || payments?.payment_status !== 'unpaid'} onPress={() => confirmAction('cancel')}>
                          <Text style={styles.actionText}>Cancel unpaid</Text>
                        </Pressable>
                      </View>
                    )}
                    {canOperate && selected.status === 'placed' && payments?.payment_status !== 'unpaid' &&
                      <Text style={styles.hint}>Cancellation is available only after the server confirms this order is unpaid. Paid or partially paid orders need a refund workflow.</Text>}
                  </>
                )}
              </>
            )}
            <Pressable accessibilityRole="button" onPress={() => selected && void loadDetail(selected)} disabled={detailBusy || acting} style={styles.refreshButton}>
              <Text style={styles.refreshText}>Refresh details</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </Page>
  );
}

const styles = StyleSheet.create({
  primaryButton: { backgroundColor: '#047857', paddingVertical: 15, borderRadius: 13, alignItems: 'center', marginBottom: 12 },
  primaryText: { color: 'white', fontWeight: '800', fontSize: 15 },
  hint: { color: '#64748B', lineHeight: 19, fontSize: 12, marginBottom: 14, marginTop: 4 },
  modalRoot: { flex: 1, backgroundColor: '#F1F5F9' },
  modalContent: { paddingHorizontal: 18, paddingTop: 48, paddingBottom: 42 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14 },
  modalTitle: { fontWeight: '800', fontSize: 24, color: '#0F172A', flexShrink: 1 },
  closeText: { color: '#047857', fontWeight: '800', fontSize: 15, padding: 8 },
  error: { color: '#B91C1C', paddingVertical: 12, fontWeight: '600' },
  warning: { color: '#92400E', backgroundColor: '#FFFBEB', padding: 12, borderRadius: 10, overflow: 'hidden' },
  input: { borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: 'white', padding: 12, borderRadius: 10, fontSize: 14, color: '#0F172A', marginBottom: 8 },
  notes: { minHeight: 70 },
  choice: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, backgroundColor: 'white', padding: 12, marginBottom: 7 },
  choiceSelected: { borderColor: '#047857', backgroundColor: '#ECFDF5' },
  choiceTitle: { color: '#0F172A', fontSize: 14, fontWeight: '700' },
  choiceMeta: { color: '#64748B', fontSize: 12, marginTop: 3, lineHeight: 17 },
  productRow: { backgroundColor: 'white', borderRadius: 11, padding: 12, marginBottom: 7, flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyControls: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  qtyButton: { borderRadius: 9, backgroundColor: '#E2E8F0', height: 35, width: 35, alignItems: 'center', justifyContent: 'center' },
  qtyButtonText: { fontSize: 20, color: '#0F172A', fontWeight: '800' },
  qtyText: { fontWeight: '800', fontSize: 15, color: '#0F172A', minWidth: 16, textAlign: 'center' },
  disabled: { opacity: 0.4 },
  summary: { backgroundColor: 'white', borderRadius: 13, padding: 16, marginTop: 10, marginBottom: 11 },
  summaryTitle: { fontWeight: '800', color: '#0F172A', fontSize: 15, marginBottom: 5 },
  summaryText: { color: '#475569', fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 17, marginBottom: 10 },
  actionButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fulfillButton: { backgroundColor: '#047857' },
  cancelButton: { backgroundColor: '#B91C1C' },
  actionText: { color: 'white', fontWeight: '800', fontSize: 13 },
  refreshButton: { backgroundColor: '#E2E8F0', padding: 14, alignItems: 'center', borderRadius: 11, marginTop: 12 },
  refreshText: { color: '#334155', fontWeight: '700' },
  balanceText: { color: '#047857', fontWeight: '800', fontSize: 15, marginTop: 8 },
  labelText: { color: '#334155', fontWeight: '700', marginBottom: 7, fontSize: 13 },
  manualPayment: { backgroundColor: 'white', padding: 16, borderRadius: 13, marginTop: 16 },
  paymentMethods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  methodButton: { paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#E2E8F0', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  methodSelected: { backgroundColor: '#ECFDF5', borderColor: '#059669' },
  methodText: { fontWeight: '700', fontSize: 12, color: '#334155' },
  methodTextSelected: { color: '#047857' },
});
