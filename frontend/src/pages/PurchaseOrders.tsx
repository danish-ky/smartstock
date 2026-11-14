import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PackagePlus, RefreshCw, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api';
import { useAuth } from '../auth';
import { canManage } from '../lib';
import { Button, EmptyState, ErrorMessage, Field, FormActions, Loading, Modal, PageHeader, Select, Status } from '../components/UI';

type Supplier = { id: number; name: string };
type Product = { id: number; name: string; sku: string; supplier: number | null; cost: string | number; is_active: boolean };
type POLine = { id: number; product: number; product_name: string; sku: string; quantity: number; received_quantity: number; remaining_quantity: number; unit_cost: string; subtotal: string };
type Receipt = { id: number; note: string; created_at: string; received_by_name: string; movements: { id: number; product_name: string; quantity: number; stock_before: number | null; stock_after: number | null }[] };
type PO = { id: number; number: string; supplier: number; supplier_name: string; status: string; notes: string; total: string; items: POLine[]; receipts: Receipt[]; created_by_name: string; created_at: string; ordered_at: string | null };
type NewLine = { product: string; quantity: string; unit_cost: string };
const emptyLine = (): NewLine => ({ product: '', quantity: '1', unit_cost: '' });
const money = (value: string | number) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (value: string) => new Date(value).toLocaleString('en-IN');

export default function PurchaseOrdersPage() {
  const { user } = useAuth();
  const manager = canManage(user?.role);
  const [orders, setOrders] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState('all');
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [newLines, setNewLines] = useState<NewLine[]>([emptyLine()]);
  const [received, setReceived] = useState<Record<number, string>>({});
  const [receiptNote, setReceiptNote] = useState('');
  const selected = orders.find(o => o.id === selectedId) || null;
  const visible = useMemo(() => orders.filter(o =>
    (state === 'all' || o.status === state) &&
    `${o.number} ${o.supplier_name}`.toLowerCase().includes(query.toLowerCase().trim())), [orders, state, query]);
  const eligible = products.filter(p => p.is_active !== false && (!p.supplier || String(p.supplier) === supplier));

  async function reload() {
    setBusy(true);
    setError('');
    try {
      const [purchaseOrders, vendorRows, productRows] = await Promise.all([
        api.list<PO>('/purchase-orders/'), api.list<Supplier>('/suppliers/'), api.list<Product>('/products/'),
      ]);
      setOrders(purchaseOrders);
      setSuppliers(vendorRows);
      setProducts(productRows);
      setSelectedId(old => old !== null && purchaseOrders.some(p => p.id === old) ? old : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load purchase orders.');
    } finally { setBusy(false); }
  }
  useEffect(() => { void reload(); }, []);

  function beginCreate() {
    setSupplier(''); setNotes(''); setNewLines([emptyLine()]); setCreating(true);
  }
  function updateLine(index: number, values: Partial<NewLine>) {
    setNewLines(old => old.map((line, i) => i === index ? { ...line, ...values } : line));
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    const supplierId = Number(supplier);
    const valid = newLines.every(line => line.product && /^[1-9]\d*$/.test(line.quantity) &&
      Number(line.quantity) <= 1000000 && (line.unit_cost === '' || (Number.isFinite(Number(line.unit_cost)) && Number(line.unit_cost) >= 0)));
    if (!supplierId || !valid || new Set(newLines.map(l => l.product)).size !== newLines.length) {
      toast.error('Choose a supplier and distinct products with valid quantities and costs.');
      return;
    }
    setSaving(true);
    try {
      const po = await api.post<PO>('/purchase-orders/', {
        supplier: supplierId, notes: notes.trim(),
        items: newLines.map(line => ({
          product: Number(line.product), quantity: Number(line.quantity),
          ...(line.unit_cost ? { unit_cost: line.unit_cost } : {}),
        })),
      });
      toast.success(`${po.number} draft created`);
      setCreating(false);
      await reload();
      setSelectedId(po.id);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not create purchase order.'); }
    finally { setSaving(false); }
  }
  async function act(action: 'place' | 'cancel') {
    if (!selected || saving) return;
    if (!window.confirm(`${action === 'place' ? 'Place' : 'Cancel'} ${selected.number}?`)) return;
    setSaving(true);
    try {
      await api.post(`/purchase-orders/${selected.id}/${action}/`, {});
      toast.success(`Purchase order ${action === 'place' ? 'placed' : 'cancelled'}`);
      await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Action failed.'); }
    finally { setSaving(false); }
  }
  function beginReceive() {
    if (!selected) return;
    setReceived({}); setReceiptNote(''); setReceiving(true);
  }
  async function receive(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const lines = selected.items.filter(item => Number(received[item.id] || 0) > 0).map(item => ({
      item: item.id, quantity: Number(received[item.id]),
    }));
    if (!lines.length || lines.some(line => !Number.isSafeInteger(line.quantity) || line.quantity < 1 ||
      line.quantity > (selected.items.find(item => item.id === line.item)?.remaining_quantity || 0))) {
      toast.error('Enter a valid received quantity within each remaining balance.');
      return;
    }
    if (!window.confirm(`Receive ${lines.reduce((sum, line) => sum + line.quantity, 0)} units into inventory for ${selected.number}?`)) return;
    setSaving(true);
    try {
      await api.post(`/purchase-orders/${selected.id}/receive/`, { items: lines, note: receiptNote.trim() });
      toast.success('Stock received and audited');
      setReceiving(false);
      await reload();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Receiving failed.'); }
    finally { setSaving(false); }
  }

  async function receiptDocument(receipt: Receipt, mode: 'view' | 'download') {
    if (!selected) return;
    // Open the tab synchronously to avoid browser popup blocking.
    const tab = mode === 'view' ? window.open('about:blank', '_blank') : null;
    try {
      const blob = await api.pdf(`/purchase-orders/${selected.id}/receipts/${receipt.id}/pdf/`);
      const url = URL.createObjectURL(blob);
      if (mode === 'view' && tab) {
        tab.location.href = url;
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = `GRN_${selected.number}_${receipt.id}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (e) {
      tab?.close();
      toast.error(e instanceof Error ? e.message : 'Unable to open receipt PDF.');
    }
  }

  return <div className="page-stack">
    <PageHeader eyebrow="SUPPLY CHAIN" title="Purchase orders" description="Order from suppliers, track partial deliveries, and receive stock with a complete audit trail." actions={<div className="toolbar-actions"><Button variant="secondary" onClick={() => void reload()} icon={<RefreshCw size={16}/>}>Refresh</Button>{manager && <Button onClick={beginCreate} icon={<PackagePlus size={16}/>}>New purchase order</Button>}</div>}/>
    {error && <ErrorMessage error={error} retry={() => void reload()}/>}
    {busy && !orders.length ? <Loading/> : <>
      <section className="panel table-panel"><div className="table-toolbar"><div><h3>Supplier orders</h3><p>Drafts do not change stock. Inventory increases only on receipt.</p></div><div className="toolbar-actions"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="PO number or supplier" aria-label="Search purchase orders"/><Select value={state} onChange={setState}><option value="all">All statuses</option>{['draft','ordered','partial','received','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}</Select></div></div>
        {visible.length ? <div className="table-scroller"><table className="data-table"><thead><tr><th>PO NUMBER</th><th>SUPPLIER</th><th>STATUS</th><th>PRODUCTS</th><th>ORDER VALUE</th><th>CREATED</th><th>ACTION</th></tr></thead><tbody>{visible.map(po => <tr key={po.id}><td className="td-strong">{po.number}</td><td>{po.supplier_name}</td><td><Status value={po.status}/></td><td>{po.items.length}</td><td>{money(po.total)}</td><td>{when(po.created_at)}</td><td><Button size="sm" variant="secondary" onClick={() => setSelectedId(po.id)}>View details</Button></td></tr>)}</tbody></table></div> : <EmptyState title="No purchase orders" description="Create a draft purchase order or adjust your filters."/>}
      </section>
      {selected && <section className="panel table-panel"><div className="table-toolbar"><div><h3>{selected.number} · {selected.supplier_name}</h3><p>Created by {selected.created_by_name} · {when(selected.created_at)} · {selected.notes || 'No notes'}</p></div><div className="toolbar-actions"><Status value={selected.status}/>{manager && selected.status === 'draft' && <Button size="sm" onClick={() => void act('place') } disabled={saving}>Place PO</Button>}{['ordered','partial'].includes(selected.status) && <Button size="sm" onClick={beginReceive} disabled={saving} icon={<Truck size={16}/>}>Receive stock</Button>}{manager && ['draft','ordered'].includes(selected.status) && <Button variant="danger" size="sm" onClick={() => void act('cancel')} disabled={saving}>Cancel</Button>}<Button variant="secondary" size="sm" onClick={() => setSelectedId(null)}>Close</Button></div></div>
        <div className="table-scroller"><table className="data-table"><thead><tr><th>PRODUCT / SKU</th><th>ORDERED</th><th>RECEIVED</th><th>REMAINING</th><th>UNIT COST</th><th>SUBTOTAL</th></tr></thead><tbody>{selected.items.map(line => <tr key={line.id}><td>{line.product_name}<div className="muted">{line.sku}</div></td><td>{line.quantity}</td><td>{line.received_quantity}</td><td><strong>{line.remaining_quantity}</strong></td><td>{money(line.unit_cost)}</td><td>{money(line.subtotal)}</td></tr>)}</tbody></table></div>
        <div className="table-toolbar"><div><h3>Receipt history</h3><p>{selected.receipts.length} deliveries linked to stock movement snapshots</p></div><strong>{money(selected.total)}</strong></div>
        {selected.receipts.length > 0 && <div className="table-toolbar" style={{flexWrap:'wrap',gap:12}}>
          <div><strong>Goods Received Notes (PDF)</strong><p>View or download each recorded delivery.</p></div>
          <div className="toolbar-actions" style={{flexWrap:'wrap'}}>{selected.receipts.map(r => <div key={r.id} style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
            <span className="muted">GRN #{r.id}</span>
            <Button size="sm" variant="secondary" onClick={() => void receiptDocument(r, 'view')}>View PDF</Button>
            <Button size="sm" variant="secondary" onClick={() => void receiptDocument(r, 'download')}>Download</Button>
          </div>)}</div>
        </div>}
        {selected.receipts.length ? <div className="table-scroller"><table className="data-table"><thead><tr><th>RECEIVED ON</th><th>RECEIVED BY</th><th>PRODUCT</th><th>QTY</th><th>STOCK BEFORE → AFTER</th><th>NOTE</th></tr></thead><tbody>{selected.receipts.flatMap(receipt => receipt.movements.map(m => <tr key={m.id}><td>{when(receipt.created_at)}</td><td>{receipt.received_by_name}</td><td>{m.product_name}</td><td>+{m.quantity}</td><td>{m.stock_before ?? '—'} → {m.stock_after ?? '—'}</td><td>{receipt.note || '—'}</td></tr>))}</tbody></table></div> : <p className="muted" style={{padding:20}}>No deliveries recorded yet.</p>}
      </section>}
    </>}
    <Modal open={creating} onClose={() => !saving && setCreating(false)} title="Create purchase order" subtitle="Manager/Admin can create drafts. Receiving changes the stock later." wide><form className="form-grid" onSubmit={e => void create(e)}>
      <div className="full"><Field label="Supplier" required><Select value={supplier} onChange={v => { setSupplier(v); setNewLines([emptyLine()]); }}><option value="">Choose supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field></div>
      {newLines.map((line, index) => <div className="full" key={index} style={{border:'1px solid #e2e8f0',borderRadius:12,padding:12,display:'grid',gap:10}}><div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:10}}><Field label="Product" required><Select value={line.product} onChange={v => updateLine(index,{ product:v, unit_cost:String(products.find(p => p.id === Number(v))?.cost ?? '') })}><option value="">Choose product</option>{eligible.map(p => <option value={p.id} key={p.id}>{p.name} ({p.sku})</option>)}</Select></Field><Field label="Order quantity" required><input required type="number" min="1" max="1000000" step="1" value={line.quantity} onChange={e => updateLine(index,{quantity:e.target.value})}/></Field><Field label="Unit cost (₹)"><input type="number" min="0" max="9999999999" step="0.01" value={line.unit_cost} onChange={e => updateLine(index,{unit_cost:e.target.value})}/></Field></div>{newLines.length > 1 && <Button type="button" size="sm" variant="danger" onClick={() => setNewLines(old => old.filter((_,i) => i !== index))}>Remove line</Button>}</div>)}
      <div className="full"><Button variant="secondary" type="button" onClick={() => setNewLines(old => [...old, emptyLine()])} disabled={!supplier}>Add another product</Button></div><div className="full"><Field label="Notes"><textarea rows={2} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)}/></Field></div><div className="full"><FormActions busy={saving} onCancel={() => setCreating(false)} text="Save draft"/></div>
    </form></Modal>
    <Modal open={receiving && !!selected} onClose={() => !saving && setReceiving(false)} title={`Receive ${selected?.number || ''}`} subtitle="Stock will increase immediately and be recorded in the audit log." wide><form className="form-grid" onSubmit={e => void receive(e)}>
      {selected?.items.filter(line => line.remaining_quantity > 0).map(line => <div key={line.id} className="full" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><label>{line.product_name} <span className="muted">({line.remaining_quantity} remaining)</span></label><input aria-label={`Receive ${line.product_name}`} style={{maxWidth:130}} type="number" min="0" max={line.remaining_quantity} step="1" value={received[line.id] ?? '0'} onChange={e => setReceived(old => ({...old,[line.id]:e.target.value}))}/></div>)}
      <div className="full"><Field label="Delivery note"><textarea rows={2} maxLength={200} value={receiptNote} onChange={e => setReceiptNote(e.target.value)}/></Field></div><div className="full"><FormActions busy={saving} onCancel={() => setReceiving(false)} text="Confirm receipt"/></div>
    </form></Modal>
  </div>;
}
