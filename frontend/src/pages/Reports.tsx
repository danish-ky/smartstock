import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, Download, IndianRupee, PackageCheck, ShoppingCart, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api';
import type { Report } from '../types';
import { money, number, saveCsv } from '../lib';
import { Button, EmptyState, ErrorMessage, Loading, Metric, PageHeader, Panel } from '../components/UI';

const iso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export default function ReportsPage(){
 const today=new Date();const thirty=new Date();thirty.setDate(today.getDate()-29);
 const [start,setStart]=useState(iso(thirty));const [end,setEnd]=useState(iso(today));
 const [report,setReport]=useState<Report|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(true);
 async function load(){setBusy(true);try{setReport(await api.get<Report>(`/reports/?start=${start}&end=${end}`));setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{void load();},[]);
 if(busy&&!report)return <Loading/>;
 if(error&&!report)return <ErrorMessage error={error} retry={load}/>;
 if(!report)return null;
 const chart=report.sales_trend.map(x=>({day:x.day,display:new Date(x.day+'T12:00:00').toLocaleDateString('en-IN',{month:'short',day:'numeric'}),sales:Number(x.sales)}));
 const pie=report.category_stock.map((x,i)=>({name:x.category__name,units:x.units,fill:['#20b58c','#637de5','#f1b457','#9d7de8','#f18482','#4abfd2'][i%6]}));
 function exportReport(){saveCsv(`smartstock-sales-${start}-to-${end}.csv`,['Date','Sales','Orders'],report!.sales_trend.map(x=>[x.day,x.sales,x.orders]));toast.success('Sales report exported');}
 return <div className="page-stack"><PageHeader eyebrow="BUSINESS INTELLIGENCE" title="Reports & analytics" description="Make confident decisions with clear sales and stock insights." actions={<Button variant="secondary" onClick={exportReport} icon={<Download size={16}/>}>Export sales CSV</Button>}/>
 <div className="date-range-panel"><div className="date-range-label"><CalendarDays size={19}/><div><strong>Reporting period</strong><span>Choose the dates to analyze</span></div></div><div className="date-fields"><label>From<input type="date" value={start} max={end} onChange={e=>setStart(e.target.value)}/></label><label>To<input type="date" value={end} min={start} onChange={e=>setEnd(e.target.value)}/></label><Button onClick={load} loading={busy}>Apply filters</Button></div></div>{error&&<ErrorMessage error={error}/>}
 <div className="metric-grid"><Metric label="Net sales" value={money(report.sales)} tone="green" icon={<IndianRupee size={21}/>} caption="Excluding cancelled orders"/><Metric label="Orders placed" value={number(report.orders)} tone="blue" icon={<ShoppingCart size={21}/>} caption="In selected period"/><Metric label="Avg. order value" value={money(report.average_order_value)} tone="purple" icon={<TrendingUp size={21}/>} caption="Across completed sales"/><Metric label="Inventory value" value={money(report.stock_value)} tone="orange" icon={<PackageCheck size={21}/>} caption="At product cost"/></div>
 <div className="dashboard-row"><Panel className="chart-panel" title="Sales performance" action={<span className="chart-period">Selected date range</span>}><div className="chart-wrap report-chart">{chart.length?<ResponsiveContainer width="100%" height="100%"><BarChart data={chart} margin={{top:10,right:8,left:-20,bottom:0}}><CartesianGrid vertical={false} stroke="#edf0f5" strokeDasharray="3 5"/><XAxis dataKey="display" axisLine={false} tickLine={false} tick={{fill:'#8b96a9',fontSize:11}}/><YAxis axisLine={false} tickLine={false} tick={{fill:'#8b96a9',fontSize:11}}/><Tooltip formatter={(v:unknown)=>money(Number(v))} contentStyle={{borderRadius:12,border:'1px solid #e8edf2'}}/><Bar dataKey="sales" fill="#27ba91" radius={[6,6,0,0]} maxBarSize={38}/></BarChart></ResponsiveContainer>:<EmptyState title="No sales in this period" description="Select a different period or place a sales order."/>}</div></Panel>
 <Panel title="Stock by category" className="attention-panel"><div className="category-chart">{pie.length?<ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pie} dataKey="units" nameKey="name" innerRadius={65} outerRadius={95} paddingAngle={3}>{pie.map((x,i)=><Cell fill={x.fill} key={i}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer>:<EmptyState title="No inventory data"/>}</div><div className="pie-legend">{pie.map(x=><div key={x.name}><i style={{background:x.fill}}/><span>{x.name}</span><strong>{number(x.units)}</strong></div>)}</div></Panel></div>
 <Panel title="Best-selling products" action={<span className="table-count">By units sold</span>}>{report.top_products.length?<div className="table-scroller"><table className="data-table"><thead><tr><th>RANK</th><th>PRODUCT</th><th>SKU</th><th>UNITS SOLD</th><th>REVENUE</th></tr></thead><tbody>{report.top_products.map((p,i)=><tr key={p.product__sku}><td><span className={`ranking ${i===0?'first':''}`}>{String(i+1).padStart(2,'0')}</span></td><td className="td-strong">{p.product__name}</td><td className="sku-cell">{p.product__sku}</td><td>{number(p.units)}</td><td className="td-strong">{money(p.revenue)}</td></tr>)}</tbody></table></div>:<EmptyState title="No top products yet" description="Product sales will appear once orders are placed."/>}</Panel>
 </div>;
}
