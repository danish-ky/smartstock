import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Clock3, FileDown, LayoutDashboard, Package, Receipt,
  Search, ShieldCheck, ShoppingBag, Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api, downloadInvoice } from '../api';
import { useAuth } from '../auth';
import { money, shortDate } from '../lib';
import type { OrderItem } from '../types';
import { Button, EmptyState, ErrorMessage, Loading, PageHeader, SearchBox, Status } from '../components/UI';

type CustomerOrder = {
  id: number; number: string; status: 'placed'|'fulfilled'|'cancelled'; total: string;
  items: OrderItem[]; created_at: string; paid_amount: string;
  payment_status: 'unpaid'|'partial'|'paid';
};
type PaymentRecord = { id:number; amount:string; method:string; created_at:string };
type PaymentHistory = { payments:PaymentRecord[]; paid_amount:string; payment_status:string };
type CatalogProduct = {
  id:number; name:string; sku:string; description:string; category_name:string;
  price:string; image_url?:string|null; stock_status:'healthy'|'low'|'out';
};

function CustomerProductImage({product}:{product:CatalogProduct}){
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[product.image_url]);
  return <div className="customer-product-image">{product.image_url&&!failed
    ? <img src={product.image_url} alt={product.name} loading="lazy" onError={()=>setFailed(true)}/>
    : <Package size={32}/>}</div>;
}

function useCustomerOrders(){
  const [orders,setOrders]=useState<CustomerOrder[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  async function load(){
    try { setOrders(await api.list<CustomerOrder>('/my/orders/')); setError(''); }
    catch(e){ setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(()=>{void load();},[]);
  return {orders,error,loading,load};
}

function outstanding(o:CustomerOrder){
  return o.status==='cancelled' ? 0 : Math.max(0,Number(o.total)-Number(o.paid_amount));
}

/** After login, Customer role lands on this overview instead of the internal operations dashboard. */
export function CustomerHomePage(){
  const {user}=useAuth();
  const {orders,error,loading,load}=useCustomerOrders();
  const active=orders.filter(o=>o.status!=='cancelled');
  const balance=active.reduce((sum,o)=>sum+outstanding(o),0);
  const fulfilled=orders.filter(o=>o.status==='fulfilled').length;
  const recent=orders.slice(0,4);
  if(loading)return <Loading label="Loading your customer account..."/>;
  if(error)return <ErrorMessage error={error} retry={()=>void load()}/>;
  return <div className="page-stack customer-space">
    <PageHeader eyebrow="CUSTOMER PORTAL" title={`Welcome, ${user?.first_name||user?.name||user?.username||'Customer'}`}
      description="A private view of your purchases, invoices and order updates."/>
    <section className="customer-hero">
      <div className="customer-hero-text"><span className="customer-hero-label"><ShieldCheck size={15}/> Your private account</span>
        <h2>Everything about your orders, in one place.</h2>
        <p>Track the latest order status, browse products and download your invoices. Our team handles order placement and payments.</p>
        <div className="customer-hero-actions"><Link to="/my/orders" className="customer-hero-btn">View my orders <ArrowRight size={17}/></Link><Link to="/catalog" className="customer-hero-link">Explore catalog <ArrowRight size={15}/></Link></div>
      </div>
      <div className="customer-hero-icon" aria-hidden="true"><ShoppingBag size={92} strokeWidth={1.2}/></div>
    </section>
    <div className="customer-summary">
      <div><Receipt size={21}/><span>Total orders</span><strong>{orders.length}</strong><small>Your order history</small></div>
      <div><Wallet size={21}/><span>Balance shown as due</span><strong>{money(balance)}</strong><small>Updated by the store</small></div>
      <div><ShieldCheck size={21}/><span>Fulfilled orders</span><strong>{fulfilled}</strong><small>Successfully completed</small></div>
    </div>
    <section className="panel customer-recent-panel">
      <div className="customer-section-heading"><div><h3>Recent orders</h3><p>Only purchases associated with your account</p></div><Link to="/my/orders">See all orders <ArrowRight size={16}/></Link></div>
      {recent.length===0 ? <EmptyState title="No orders yet" description="When the store creates an order for you, it will appear here."/>
       : <div className="customer-recent-list">{recent.map(o=><Link to={`/my/orders?order=${o.id}`} key={o.id} className="customer-recent-row">
        <div className="customer-recent-icon"><Package size={19}/></div><div className="customer-recent-title"><strong>{o.number}</strong><small>{shortDate(o.created_at)} · {o.items.length} item types</small></div>
        <Status value={o.status}/><strong>{money(o.total)}</strong><ArrowRight size={17}/>
       </Link>)}</div>}
    </section>
    <p className="customer-note"><Clock3 size={16}/> For new orders, payment questions or cancellations, please contact the store. This customer portal is read-only.</p>
  </div>;
}

/** Customers see their own order records and invoice/payment history; never a payment action. */
export function MyOrdersPage(){
  const {orders,error,loading,load}=useCustomerOrders();
  const initial=new URLSearchParams(window.location.search).get('order');
  const [active,setActive]=useState<number|null>(initial&&/^\d+$/.test(initial)?Number(initial):null);
  const [history,setHistory]=useState<PaymentHistory|null>(null);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('all');
  const shown=useMemo(()=>orders.filter(o=>
    (filter==='all'||o.status===filter) &&
    (`${o.number} ${o.items.map(i=>i.product_name).join(' ')}`).toLowerCase().includes(query.trim().toLowerCase())
  ),[orders,filter,query]);

  useEffect(()=>{
    if(!active)return;
    // Load payment history for links to an individual order on the overview page.
    setHistoryLoading(true);
    api.get<PaymentHistory>(`/orders/${active}/payments/`).then(setHistory)
      .catch(()=>setHistory(null)).finally(()=>setHistoryLoading(false));
  },[active]);

  async function expand(o:CustomerOrder){
    if(active===o.id){setActive(null);setHistory(null);return;}
    setActive(o.id);
    setHistory(null);
  }
  if(loading)return <Loading label="Loading your orders..."/>;
  if(error&&!orders.length)return <ErrorMessage error={error} retry={()=>void load()}/>;
  return <div className="page-stack customer-space">
    <PageHeader eyebrow="MY ACCOUNT" title="My orders" description="Track purchases, check payment status and download your invoices."/>
    <div className="customer-summary">
      <div><Receipt size={20}/><span>Total orders</span><strong>{orders.length}</strong></div>
      <div><Wallet size={20}/><span>Balance shown as due</span><strong>{money(orders.reduce((sum,o)=>sum+outstanding(o),0))}</strong></div>
      <div><ShieldCheck size={20}/><span>Paid orders</span><strong>{orders.filter(o=>o.payment_status==='paid').length}</strong></div>
    </div>
    <section className="panel table-panel">
      <div className="customer-section-heading customer-filter-bar"><div><h3>Order history</h3><p>Private to your linked customer account</p></div><div className="customer-filter-actions">
        <SearchBox value={query} onChange={setQuery} placeholder="Search orders..."/>
        <select className="customer-select" aria-label="Filter orders by status" value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="all">All orders</option><option value="placed">Placed</option><option value="fulfilled">Fulfilled</option><option value="cancelled">Cancelled</option>
        </select>
      </div></div>
      {shown.length===0?<EmptyState title={orders.length?'No matching orders':'No orders linked to your account'}
        description={orders.length?'Try another search or status.':'Orders placed by the business will appear here once your account is linked to a customer record.'}/>
      : <div className="customer-order-list">{shown.map(o=><article className="customer-order" key={o.id}>
        <div className="customer-order-row">
          <div><small>{shortDate(o.created_at)}</small><h3>{o.number}</h3><div className="customer-status"><Status value={o.status}/><Status value={o.payment_status}/></div></div>
          <div className="customer-order-right"><strong>{money(o.total)}</strong><small>Paid {money(o.paid_amount)}</small><Button variant="secondary" size="sm" onClick={()=>void expand(o)}>{active===o.id?'Hide details':'View details'}</Button></div>
        </div>
        {active===o.id&&<div className="customer-order-detail">
          <h4>Items purchased</h4>
          {o.items.map(item=><div className="customer-item" key={item.id}><div><strong>{item.product_name}</strong><small>{item.quantity} × {money(item.unit_price)}</small></div><strong>{money(item.subtotal)}</strong></div>)}
          <div className="customer-balance"><span>Remaining balance</span><strong>{money(outstanding(o))}</strong></div>
          <div className="customer-payment-history"><h4>Recorded payments</h4>
            {historyLoading?<p>Loading payment records...</p>:history&&history.payments.length?
              history.payments.map(p=><div key={p.id}><span>{shortDate(p.created_at)} · {p.method.toUpperCase()}</span><strong>{money(p.amount)}</strong></div>):
              <p>No payments recorded for this order.</p>}
          </div>
          <div className="customer-actions"><Button variant="secondary" icon={<FileDown size={16}/>} onClick={()=>void downloadInvoice(o.id,o.number).catch(e=>toast.error((e as Error).message))}>Download invoice PDF</Button></div>
        </div>}
      </article>)}</div>}
    </section>
    <p className="customer-note"><ShieldCheck size={16}/> Payments and cancellations are handled by authorized store staff. This page only displays their recorded status.</p>
  </div>;
}

export function CustomerCatalogPage(){
  const [products,setProducts]=useState<CatalogProduct[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  async function load(){
    try {setProducts(await api.list<CatalogProduct>('/products/'));setError('');}
    catch(e){setError((e as Error).message);}
    finally {setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  const shown=useMemo(()=>products.filter(p=>[p.name,p.sku,p.category_name].join(' ').toLowerCase().includes(query.toLowerCase())),[products,query]);
  if(loading)return <Loading label="Loading available products..."/>;
  if(error&&!products.length)return <ErrorMessage error={error} retry={()=>void load()}/>;
  return <div className="page-stack customer-space">
    <PageHeader eyebrow="PRODUCT CATALOG" title="Browse products" description="Explore products and contact the store to place your order."
      actions={<SearchBox value={query} onChange={setQuery} placeholder="Search the catalog..."/>}/>
    {shown.length?<div className="customer-catalog">{shown.map(p=><article key={p.id} className="panel customer-product-card">
      <CustomerProductImage product={p}/>
      <small>{p.category_name} · {p.sku}</small><h3>{p.name}</h3>
      <p>{p.description||'Product available from Orevon.'}</p>
      <div><strong>{money(p.price)}</strong><Status value={p.stock_status==='out'?'out':'available'}/></div>
    </article>)}</div>:<section className="panel"><EmptyState title="No matching products" description="Try a different search."/></section>}
    <p className="customer-note"><Search size={16}/> Customers can browse products but cannot edit prices, inventory, orders or payments.</p>
  </div>;
}
