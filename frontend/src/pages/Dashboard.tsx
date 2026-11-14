import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, ArrowUpRight, Boxes, CircleAlert, Clock3, IndianRupee, Package, Plus, ShoppingCart, TrendingUp, Users, Wallet, Warehouse } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import type { Dashboard } from '../types';
import { canManage, money, number, shortDate } from '../lib';
import { EmptyState, ErrorMessage, Loading, Metric, PageHeader, Panel, ProductAvatar, Status } from '../components/UI';

type ForecastProduct = {
 id:number; name:string; sku:string; stock:number; low_stock_threshold:number;
 alert:'out'|'low'|'at_risk'|'healthy'; on_order_units:number; recent_units_sold:number;
 average_daily_sales:number; days_remaining:number|null; suggested_reorder:number;
 has_recent_sales:boolean;
};
type InventoryForecast = {
 history_days:number; lead_days:number; target_days:number;
 out_of_stock_count:number; low_stock_count:number; forecast_risk_count:number;
 reorder_count:number; products:ForecastProduct[]; methodology:string;
};

export default function DashboardPage(){
 const {user}=useAuth();
 const [data,setData]=useState<Dashboard|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(true);
 const [forecast,setForecast]=useState<InventoryForecast|null>(null);
 const [forecastError,setForecastError]=useState('');
 const [forecastBusy,setForecastBusy]=useState(true);
 async function load(){setBusy(true);try{setData(await api.get<Dashboard>('/dashboard/'));setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function loadForecast(){setForecastBusy(true);try{setForecast(await api.get<InventoryForecast>('/inventory/forecast/?limit=12'));setForecastError('');}catch(e){setForecastError((e as Error).message);}finally{setForecastBusy(false);}}
 useEffect(()=>{void load();void loadForecast();},[]);
 if(busy&&!data)return <Loading/>;
 if(error&&!data)return <ErrorMessage error={error} retry={load}/>;
 if(!data)return null;
 const chart=data.sales_trend.map(x=>({name:new Date(x.date+'T12:00:00').toLocaleDateString('en-IN',{weekday:'short'}),sales:Number(x.sales),orders:x.orders}));
 const healthyProducts=Math.max(0, data.total_products-data.low_stock_count);
 const healthyPercentage=data.total_products>0?Math.round(healthyProducts/data.total_products*100):0;
 return <div className="page-stack"><PageHeader eyebrow="LIVE OPERATIONS OVERVIEW" title="Good to see you again 👋" description="Here's what's happening across your inventory and sales today." actions={<>{canManage(user?.role)&&<Link className="btn btn-secondary btn-normal" to="/reports"><TrendingUp size={16}/> View reports</Link>}<Link className="btn btn-primary btn-normal" to="/orders"><Plus size={16}/> New order</Link></>}/>
   <div className="welcome-strip"><div className="welcome-strip-icon"><span>✦</span></div><div><strong>Stay in control of every moving part.</strong><p>Live inventory counts, sales activity, and low-stock alerts — all in one place.</p></div><Link to="/inventory">Manage inventory <ArrowRight size={16}/></Link></div>
   <div className="metric-grid"><Metric label="Order value" value={money(data.total_sales)} icon={<Wallet size={21}/>} tone="green" caption="Across active orders"/><Metric label="Products" value={number(data.total_products)} icon={<Boxes size={21}/>} tone="blue" caption={`${number(data.stock_units)} units in stock`}/><Metric label="Total orders" value={number(data.total_orders)} icon={<ShoppingCart size={21}/>} tone="purple" caption="Excluding cancelled"/><Metric label="Low stock items" value={number(data.low_stock_count)} icon={<CircleAlert size={21}/>} tone="orange" caption="Needs your attention"/></div>
   <div className="dashboard-row"><Panel className="chart-panel" title="Order value overview" action={<div className="chart-period"><span/> Last 7 days</div>}><div className="chart-summary"><strong>{money(data.total_sales)}</strong><span>Across all active orders</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{top:10,right:10,left:-25,bottom:0}}><defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00c993" stopOpacity={.24}/><stop offset="100%" stopColor="#00c993" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0f5" strokeDasharray="3 5"/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:'#8d99ad',fontSize:12}} dy={12}/><YAxis axisLine={false} tickLine={false} tick={{fill:'#8d99ad',fontSize:11}} tickFormatter={(v:number)=>v>=1000?`${(v/1000).toFixed(0)}k`:String(v)}/><Tooltip contentStyle={{border:'1px solid #eef1f6',borderRadius:12,boxShadow:'0 9px 30px #101a3315',fontSize:12}} formatter={(v:unknown)=>money(Number(v))}/><Area type="monotone" dataKey="sales" stroke="#04ad80" strokeWidth={3} fill="url(#revenueFill)" activeDot={{r:5,strokeWidth:3,stroke:'#fff'}}/></AreaChart></ResponsiveContainer></div></Panel>
   <Panel className="attention-panel" title="Stock health" action={<Link to="/inventory" className="text-link">View all <ArrowUpRight size={14}/></Link>}><div className="stock-health-ring"><div className="ring-visual" style={{background:`conic-gradient(#00bf8b 0 ${healthyPercentage}%, #f8ae43 0 100%)`}}><div><strong>{healthyPercentage}%</strong><span>Healthy stock</span></div></div></div><div className="stock-legend"><div><span className="legend-circle green"/>Healthy products<strong>{healthyProducts}</strong></div><div><span className="legend-circle amber"/>Low / out of stock<strong>{data.low_stock_count}</strong></div><div><span className="legend-circle blue"/>Stock valuation<strong>{money(data.stock_value)}</strong></div></div></Panel></div>
   <div className="dashboard-row bottom-row"><Panel title="Recent orders" className="recent-orders" action={<Link to="/orders" className="text-link">All orders <ArrowUpRight size={14}/></Link>}>{data.recent_orders.length?<div className="table-scroller"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>DATE</th><th>TOTAL</th><th>STATUS</th></tr></thead><tbody>{data.recent_orders.map(o=><tr key={o.id}><td><strong className="code-cell">{o.number}</strong></td><td>{o.customer_name}</td><td>{shortDate(o.created_at)}</td><td className="td-strong">{money(o.total)}</td><td><Status value={o.status}/></td></tr>)}</tbody></table></div>:<EmptyState title="No orders yet" description="Your orders will appear here as soon as you create them."/>}</Panel>
   <Panel title="Needs attention" className="needs-attention" action={<Link to="/inventory" className="text-link">Restock <ArrowUpRight size={14}/></Link>}>{data.low_stock_products.length?<div className="attention-list">{data.low_stock_products.map(p=><div className="attention-item" key={p.id}><ProductAvatar name={p.name} category={p.category_name} imageUrl={p.image_url}/><div><strong>{p.name}</strong><span>{p.sku}</span></div><div className="attention-stock"><strong>{p.stock} left</strong><span>Min {p.low_stock_threshold}</span></div></div>)}</div>:<div className="all-good"><div>✓</div><strong>Everything looks good!</strong><p>No products currently need restocking.</p></div>}</Panel></div>
   <div className="dashboard-row" style={{gridTemplateColumns:'minmax(0,1fr)'}}>
     <Panel title="Forecast & restock alerts" action={<button type="button" className="btn btn-secondary btn-normal" onClick={()=>void loadForecast()} disabled={forecastBusy}>{forecastBusy?'Refreshing…':'Refresh estimates'}</button>}>
       <p style={{fontSize:13,color:'#77839a',margin:'0 0 14px'}}>Read-only estimates from non-cancelled sales orders. Reorder suggestions are not automatic purchase orders.</p>
       {forecastError && <ErrorMessage error={forecastError} retry={loadForecast}/>}
       {forecastBusy && !forecast && <Loading/>}
       {forecast && <>
         <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:16}}>
           <div style={{padding:'12px 16px',border:'1px solid #e7edf0',borderRadius:12}}><strong>{forecast.out_of_stock_count}</strong><div style={{fontSize:12,color:'#748295'}}>Out of stock</div></div>
           <div style={{padding:'12px 16px',border:'1px solid #e7edf0',borderRadius:12}}><strong>{forecast.low_stock_count}</strong><div style={{fontSize:12,color:'#748295'}}>Low / out of stock</div></div>
           <div style={{padding:'12px 16px',border:'1px solid #e7edf0',borderRadius:12}}><strong>{forecast.forecast_risk_count}</strong><div style={{fontSize:12,color:'#748295'}}>Forecast lead-time risk</div></div>
           <div style={{padding:'12px 16px',border:'1px solid #e7edf0',borderRadius:12}}><strong>{forecast.reorder_count}</strong><div style={{fontSize:12,color:'#748295'}}>Products with reorder suggestions</div></div>
         </div>
         {forecast.products.length?<div className="table-scroller"><table><thead><tr><th>PRODUCT</th><th>STOCK</th><th>ON ORDER</th><th>ALERT</th><th>SOLD ({forecast.history_days}D)</th><th>DAYS LEFT*</th><th>SUGGESTED REORDER</th></tr></thead><tbody>{forecast.products.map(p=><tr key={p.id}><td><strong>{p.name}</strong><div className="code-cell" style={{fontSize:12}}>{p.sku}</div></td><td>{p.stock}</td><td>{p.on_order_units}</td><td><Status value={p.alert==='at_risk'?'low':p.alert}/>{p.alert==='at_risk'&&<span style={{fontSize:11,marginLeft:6}}>Lead-time risk</span>}</td><td>{p.recent_units_sold}</td><td>{p.days_remaining===null?'No recent sales':`${p.days_remaining} days`}</td><td><strong>{p.suggested_reorder}</strong></td></tr>)}</tbody></table></div>:<EmptyState title="No restock alerts" description="There are no stock shortages or recommended reorders in the current window."/>}
         <p style={{fontSize:12,color:'#77839a',marginTop:14}}> * Days left uses a simple {forecast.history_days}-day average. Assumes {forecast.lead_days} delivery days and {forecast.target_days} additional cover days. Outstanding placed purchase orders reduce the new reorder suggestion. No recent sales = unknown coverage. Actual demand may differ.</p>
       </>}
     </Panel>
   </div>
 </div>;
}
