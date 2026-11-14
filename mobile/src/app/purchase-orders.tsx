import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LoadNotice, Page, SectionTitle } from '../components/MobileUI';
import { useAuth } from '../context/AuthContext';
import { listItems } from '../lib/api';
import { useRemote } from '../lib/useRemote';

type List<T> = T[] | { results?: T[]; next?: string | null };
type Supplier = { id: number; name: string };
type Product = { id: number; sku: string; name: string; supplier?: number | null; cost: string | number; is_active?: boolean };
type Item = { id: number; product: number; product_name: string; sku: string; quantity: number; received_quantity: number; remaining_quantity: number; unit_cost: string };
type Receipt = { id: number; note: string; created_at: string; received_by_name: string; movements: {id: number; product_name: string; quantity: number; stock_before: number | null; stock_after: number | null}[] };
type PO = {id: number; number: string; supplier_name: string; supplier: number; status: string; total: string; items: Item[]; receipts: Receipt[]; notes: string};
type Draft = { product: number; name: string; quantity: string; unit_cost: string };
const price = (v: string | number) => `₹${Number(v || 0).toFixed(2)}`;
const msg = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong.';

function Content() {
  const {user, apiPost, apiOpenPdf} = useAuth();
  const manager = user?.role === 'admin' || user?.role === 'manager';
  const {data: poData, busy, error, reload} = useRemote<List<PO>>('/purchase-orders/');
  const {data: vendorData, reload: reloadVendors} = useRemote<List<Supplier>>('/suppliers/');
  const {data: productData, reload: reloadProducts} = useRemote<List<Product>>('/products/');
  const orders = useMemo(() => listItems(poData), [poData]);
  const suppliers = useMemo(() => listItems(vendorData), [vendorData]);
  const products = useMemo(() => listItems(productData), [productData]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = orders.find(o => o.id === selectedId);
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [supplier, setSupplier] = useState<number | null>(null);
  const [lines, setLines] = useState<Draft[]>([]);
  const [notes, setNotes] = useState('');
  const [received, setReceived] = useState<Record<number, string>>({});
  const [receiptNote, setReceiptNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const eligible = products.filter(p => p.is_active !== false && (p.supplier == null || p.supplier === supplier));

  const refresh = () => { void Promise.all([reload(), reloadVendors(), reloadProducts()]); };
  function startCreate() {setSupplier(null); setLines([]); setNotes(''); setFormError(''); setCreating(true);}
  function addProduct(p: Product) {
    if (lines.some(line => line.product === p.id)) {
      setLines(old => old.filter(line => line.product !== p.id));
    } else {
      setLines(old => [...old, { product: p.id, name: p.name, quantity: '1', unit_cost: String(p.cost ?? '0') }]);
    }
  }
  function editLine(id: number, patch: Partial<Draft>) {
    setLines(old => old.map(line => line.product === id ? {...line, ...patch} : line));
  }
  async function create() {
    if (saving || !supplier) return;
    if (!lines.length || lines.some(line => !/^[1-9]\d*$/.test(line.quantity) || Number(line.quantity) > 1000000 ||
      !/^\d+(\.\d{1,2})?$/.test(line.unit_cost) || Number(line.unit_cost) >= 10000000000)) {
      setFormError('Select at least one product and enter valid quantities/costs.');
      return;
    }
    setSaving(true); setFormError('');
    try {
      const po = await apiPost<PO>('/purchase-orders/', {
        supplier, notes: notes.trim(),
        items: lines.map(line => ({product: line.product, quantity: Number(line.quantity), unit_cost: line.unit_cost})),
      });
      setCreating(false);
      await reload();
      setSelectedId(po.id);
      Alert.alert('Draft created', `${po.number} saved. Place it when ready to order.`);
    } catch (e) {setFormError(msg(e));}
    finally {setSaving(false);}
  }
  async function act(action: 'place' | 'cancel') {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await apiPost(`/purchase-orders/${selected.id}/${action}/`, {});
      await reload();
      Alert.alert('Success', action === 'place' ? 'Supplier purchase order placed.' : 'Purchase order cancelled.');
    } catch (e) {Alert.alert('Action failed', msg(e));}
    finally {setSaving(false);}
  }
  function confirmAct(action: 'place' | 'cancel') {
    if (!selected) return;
    Alert.alert(`${action === 'place' ? 'Place' : 'Cancel'} ${selected.number}?`,
      action === 'place' ? 'Placing an order does not change inventory.' : 'You cannot cancel after receiving stock.',
      [{text:'Back',style:'cancel'}, {text:'Confirm',style:action === 'cancel' ? 'destructive':'default',onPress:() => void act(action)}]);
  }
  function beginReceive() {setReceived({});setReceiptNote('');setFormError('');setReceiving(true);}
  function confirmReceive() {
    if (!selected || saving) return;
    const items = selected.items.filter(line => Number(received[line.id] || '0') > 0)
      .map(line => ({item:line.id,quantity:Number(received[line.id])}));
    if (!items.length || items.some(line => !Number.isSafeInteger(line.quantity) || line.quantity < 1 ||
      line.quantity > (selected.items.find(item => item.id === line.item)?.remaining_quantity || 0))) {
      setFormError('Enter a positive quantity no greater than the remaining amount.');return;
    }
    Alert.alert('Confirm receipt', `Add ${items.reduce((sum, line) => sum + line.quantity, 0)} units to inventory? This is audited.`,
      [{text:'Back',style:'cancel'}, {text:'Receive', onPress:() => void saveReceive(selected.id, items)}]);
  }
  async function saveReceive(poId: number, items: {item: number;quantity: number}[]) {
    if (saving) return;
    setSaving(true);setFormError('');
    try {
      await apiPost(`/purchase-orders/${poId}/receive/`, {items, note: receiptNote.trim()});
      setReceiving(false);
      await reload();
      Alert.alert('Received', 'Stock quantities and audit records were updated.');
    } catch (e) {setFormError(msg(e));}
    finally {setSaving(false);}
  }

  async function viewReceiptDocument(receiptId: number, mode: 'preview' | 'share' = 'preview') {
    if (!selected) return;
    try {
      await apiOpenPdf(
        `/purchase-orders/${selected.id}/receipts/${receiptId}/pdf/`,
        `GRN_${selected.number}_${receiptId}.pdf`,
        mode,
      );
    } catch (e) { Alert.alert('Receipt PDF unavailable', msg(e)); }
  }

  return <Page title="Purchase orders" subtitle="Supplier orders and audited stock receipts" refreshing={busy} onRefresh={refresh}>
    <LoadNotice loading={busy && !poData} error={error} onRetry={reload} empty={false}/>
    {manager && <Pressable style={styles.primary} onPress={startCreate}><Text style={styles.primaryText}>＋ New purchase order</Text></Pressable>}
    <SectionTitle>Supplier orders ({orders.length})</SectionTitle>
    {!orders.length && !busy && <Text style={styles.secondary}>No purchase orders yet.</Text>}
    {orders.map(po => <Pressable key={po.id} style={styles.card} onPress={() => setSelectedId(selectedId === po.id ? null : po.id)}>
      <View style={styles.between}><Text style={styles.title}>{po.number}</Text><Text style={styles.status}>{po.status}</Text></View>
      <Text style={styles.secondary}>{po.supplier_name} · {price(po.total)} · {po.items.length} products</Text>
      <Text style={styles.small}>{selectedId === po.id ? 'Tap to collapse' : 'Tap to view, place or receive'}</Text>
    </Pressable>)}
    {selected && <>
      <SectionTitle>{selected.number} details</SectionTitle>
      <View style={styles.card}>
        {selected.items.map(line => <View key={line.id} style={styles.line}>
          <Text style={styles.title}>{line.product_name}</Text><Text style={styles.secondary}>{line.sku}</Text>
          <Text>Ordered {line.quantity} · Received {line.received_quantity} · Remaining {line.remaining_quantity}</Text>
          <Text style={styles.secondary}>Unit cost: {price(line.unit_cost)}</Text>
        </View>)}
        {manager && selected.status === 'draft' && <Pressable style={styles.primary} disabled={saving} onPress={() => confirmAct('place')}><Text style={styles.primaryText}>Place purchase order</Text></Pressable>}
        {['ordered','partial'].includes(selected.status) && <Pressable style={styles.primary} disabled={saving} onPress={beginReceive}><Text style={styles.primaryText}>Receive delivery</Text></Pressable>}
        {manager && ['draft','ordered'].includes(selected.status) && <Pressable style={styles.danger} disabled={saving} onPress={() => confirmAct('cancel')}><Text style={styles.primaryText}>Cancel purchase order</Text></Pressable>}
      </View>
      <SectionTitle>Receipt history ({selected.receipts?.length ?? 0})</SectionTitle>
      {!selected.receipts?.length && <Text style={styles.secondary}>No deliveries recorded yet.</Text>}
      {selected.receipts?.map(receipt => <View key={receipt.id} style={styles.card}>
        <Text style={styles.title}>{new Date(receipt.created_at).toLocaleString('en-IN')} · {receipt.received_by_name}</Text>
        {receipt.movements.map(m => <Text key={m.id} style={styles.secondary}>{m.product_name}: +{m.quantity} units · {m.stock_before ?? '—'} → {m.stock_after ?? '—'}</Text>)}
        {!!receipt.note && <Text style={styles.small}>{receipt.note}</Text>}
        <Pressable style={styles.secondaryButton} onPress={() => void viewReceiptDocument(receipt.id, 'preview')}>
          <Text style={styles.title}>View GRN PDF</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => void viewReceiptDocument(receipt.id, 'share')}>
          <Text style={styles.title}>Save / Share PDF</Text>
        </Pressable>
      </View>)}
    </>}

    <Modal visible={creating} onRequestClose={() => {
  if (!saving) {
    setCreating(false);
  }
}} animationType="slide">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modal}>
        <Text style={styles.heading}>New purchase order</Text><Text style={styles.secondary}>Draft first. No stock change until delivery.</Text>
        <Text style={styles.label}>Choose supplier</Text>
        {suppliers.map(s => <Pressable key={s.id} style={[styles.option, supplier === s.id && styles.active]} onPress={() => {setSupplier(s.id);setLines([]);}}><Text>{s.name}{supplier === s.id ? ' ✓' : ''}</Text></Pressable>)}
        {supplier !== null && <><Text style={styles.label}>Tap to add products ({lines.length} selected)</Text>
          {eligible.map(p => <Pressable key={p.id} style={[styles.option, lines.some(line => line.product === p.id) && styles.active]} onPress={() => addProduct(p)}><Text>{p.name} ({p.sku}){lines.some(line => line.product === p.id) ? ' ✓' : ''}</Text></Pressable>)}
          {lines.map(line => <View key={line.product} style={styles.line}><Text style={styles.title}>{line.name}</Text><Text style={styles.label}>Quantity</Text><TextInput style={styles.input} keyboardType="numeric" value={line.quantity} onChangeText={text => editLine(line.product,{quantity:text})}/><Text style={styles.label}>Unit cost (₹)</Text><TextInput style={styles.input} keyboardType="decimal-pad" value={line.unit_cost} onChangeText={text => editLine(line.product,{unit_cost:text})}/></View>)}
          <Text style={styles.label}>Notes</Text><TextInput style={styles.input} multiline maxLength={2000} value={notes} onChangeText={setNotes}/>
        </>}
        {!!formError && <Text style={styles.error}>{formError}</Text>}
        <Pressable style={styles.primary} disabled={saving} onPress={() => void create()}>{saving ? <ActivityIndicator color="#fff"/> : <Text style={styles.primaryText}>Create draft</Text>}</Pressable>
        <Pressable style={styles.secondaryButton} disabled={saving} onPress={() => setCreating(false)}><Text>Close</Text></Pressable>
      </ScrollView>
    </Modal>
    <Modal visible={receiving && !!selected} onRequestClose={() => {
  if (!saving) {
    setReceiving(false);
  }
}} animationType="slide">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modal}>
        <Text style={styles.heading}>Receive {selected?.number}</Text><Text style={styles.secondary}>Enter the units physically received. Leave 0 for undelivered items.</Text>
        {selected?.items.filter(i => i.remaining_quantity > 0).map(line => <View key={line.id} style={styles.line}>
          <Text style={styles.title}>{line.product_name}</Text><Text style={styles.secondary}>{line.remaining_quantity} units remaining</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={received[line.id] ?? '0'} onChangeText={text => setReceived(old => ({...old,[line.id]:text}))}/>
        </View>)}
        <Text style={styles.label}>Delivery note (optional)</Text><TextInput style={styles.input} maxLength={200} value={receiptNote} onChangeText={setReceiptNote}/>
        {!!formError && <Text style={styles.error}>{formError}</Text>}
        <Pressable style={styles.primary} disabled={saving} onPress={confirmReceive}>{saving ? <ActivityIndicator color="#fff"/> : <Text style={styles.primaryText}>Confirm stock receipt</Text>}</Pressable>
        <Pressable style={styles.secondaryButton} disabled={saving} onPress={() => setReceiving(false)}><Text>Close</Text></Pressable>
      </ScrollView>
    </Modal>
  </Page>;
}

export default function PurchaseOrdersScreen() {
  const {user, loading} = useAuth();
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#047857"/></View>;
  if (!user) return <Redirect href="/"/>;
  if (!['admin','manager','staff'].includes(user.role)) return <Redirect href="/(app)/more"/>;
  return <Content/>;
}

const styles = StyleSheet.create({
  center:{flex:1,justifyContent:'center',alignItems:'center'},
  card:{backgroundColor:'#fff',borderRadius:14,padding:16,marginBottom:10,gap:6},
  between:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  title:{fontSize:15,fontWeight:'800',color:'#0F172A'},
  heading:{fontSize:24,fontWeight:'800',color:'#0F172A',marginBottom:8},
  secondary:{color:'#64748B',fontSize:13,lineHeight:20},
  small:{color:'#64748B',fontSize:12},
  status:{color:'#047857',fontWeight:'800',textTransform:'capitalize'},
  label:{fontWeight:'700',fontSize:13,color:'#334155',marginTop:12,marginBottom:5},
  line:{borderTopColor:'#E2E8F0',borderTopWidth:1,paddingVertical:12,gap:4},
  input:{backgroundColor:'#F8FAFC',borderWidth:1,borderColor:'#CBD5E1',padding:12,borderRadius:9,color:'#0F172A'},
  option:{padding:12,marginTop:6,backgroundColor:'#F8FAFC',borderRadius:9,borderWidth:1,borderColor:'#E2E8F0'},
  active:{backgroundColor:'#D1FAE5',borderColor:'#059669'},
  primary:{backgroundColor:'#047857',padding:15,borderRadius:10,alignItems:'center',marginTop:12},
  primaryText:{color:'#fff',fontWeight:'800'},
  danger:{backgroundColor:'#B91C1C',padding:15,borderRadius:10,alignItems:'center',marginTop:10},
  secondaryButton:{backgroundColor:'#E2E8F0',padding:15,borderRadius:10,alignItems:'center',marginTop:12},
  modal:{padding:22,paddingTop:48,paddingBottom:60,backgroundColor:'#F1F5F9'},
  error:{color:'#B91C1C',marginVertical:10,fontWeight:'600'},
});
