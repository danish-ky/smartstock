import { useEffect, useMemo, useState } from 'react';
import { Barcode, ScanLine, Download, Edit3, PackagePlus, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { BarcodeLabel, BarcodeScanner } from '../components/BarcodeTools';
import toast from 'react-hot-toast';
import { api } from '../api';
import { useAuth } from '../auth';
import { canManage, money, number, saveCsv } from '../lib';
import type { Category, Product, Supplier } from '../types';
import { Button, Confirm, EmptyState, ErrorMessage, Field, FormActions, Loading, Modal, PageHeader, ProductAvatar, SearchBox, Select, Status } from '../components/UI';

type ProductForm={name:string;sku:string;description:string;category:string;supplier:string;price:string;cost:string;low_stock_threshold:string;};
const emptyForm:ProductForm={name:'',sku:'',description:'',category:'',supplier:'',price:'',cost:'',low_stock_threshold:'10'};
export default function ProductsPage(){
 const {user}=useAuth();const editable=canManage(user?.role);
 const [products,setProducts]=useState<Product[]>([]);const [categories,setCategories]=useState<Category[]>([]);const [suppliers,setSuppliers]=useState<Supplier[]>([]);
 const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [search,setSearch]=useState('');const [categoryFilter,setCategoryFilter]=useState('');const [stockFilter,setStockFilter]=useState('all');
 const [labelProduct,setLabelProduct]=useState<Product|null>(null);
 const [scanning,setScanning]=useState(false);
 const [open,setOpen]=useState(false);const [editing,setEditing]=useState<Product|null>(null);
 const [imageFile,setImageFile]=useState<File|null>(null);const [removeImage,setRemoveImage]=useState(false);const [imagePreview,setImagePreview]=useState<string|null>(null);const [form,setForm]=useState<ProductForm>(emptyForm);const [saving,setSaving]=useState(false);const [deleting,setDeleting]=useState<Product|null>(null);
 async function load(){try{const [p,c,s]=await Promise.all([api.list<Product>('/products/'),api.list<Category>('/categories/'),editable?api.list<Supplier>('/suppliers/'):Promise.resolve([] as Supplier[])]);setProducts(p);setCategories(c);setSuppliers(s);setError('');}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 const shown=useMemo(()=>products.filter(p=>{
  const q=search.toLowerCase();return (!q||[p.name,p.sku,p.category_name].some(x=>x.toLowerCase().includes(q))) && (!categoryFilter||String(p.category)===categoryFilter) && (stockFilter==='all'||p.stock_status===stockFilter);
 }),[products,search,categoryFilter,stockFilter]);
 function begin(p?:Product){setImageFile(null);setRemoveImage(false);setImagePreview(null);setEditing(p||null);setForm(p?{name:p.name,sku:p.sku,description:p.description,category:String(p.category),supplier:p.supplier?String(p.supplier):'',price:p.price,cost:p.cost,low_stock_threshold:String(p.low_stock_threshold)}:{...emptyForm,category:categories[0]?String(categories[0].id):''});setOpen(true);}
 function update<K extends keyof ProductForm>(key:K,value:ProductForm[K]){setForm(p=>({...p,[key]:value}));}
 async function save(e:React.FormEvent){e.preventDefault();setSaving(true);try{
  const body={...form,category:Number(form.category),supplier:form.supplier?Number(form.supplier):null,price:Number(form.price),cost:Number(form.cost),low_stock_threshold:Number(form.low_stock_threshold)};
  const saved=editing?await api.patch<Product>(`/products/${editing.id}/`,body):await api.post<Product>('/products/',body);
  if(imageFile)await api.uploadImage<Product>(saved.id,imageFile);
  else if(removeImage&&editing)await api.removeImage<Product>(saved.id);
  toast.success(editing?'Product updated successfully':'Product created successfully');setOpen(false);await load();
 }catch(e){toast.error((e as Error).message);}finally{setSaving(false);}}
 async function remove(){if(!deleting)return;setSaving(true);try{await api.del(`/products/${deleting.id}/`);toast.success('Product archived');setDeleting(null);await load();}catch(e){toast.error((e as Error).message);}finally{setSaving(false);}}
 if(loading)return <Loading/>;if(error&&!products.length)return <ErrorMessage error={error} retry={load}/>;
 return <div className="page-stack"><PageHeader eyebrow="CATALOG MANAGEMENT" title="Products" description="A complete view of every item in your inventory." actions={<><Button variant="secondary" icon={<ScanLine size={16}/>} onClick={()=>setScanning(true)}>Scan barcode</Button><Button variant="secondary" icon={<Download size={16}/>} onClick={()=>saveCsv('smartstock-products.csv',['SKU','Product','Category','Stock','Price','Cost'],shown.map(p=>[p.sku,p.name,p.category_name,p.stock,p.price,p.cost]))}>Export CSV</Button>{editable&&<Button icon={<Plus size={16}/>} onClick={()=>begin()}>Add product</Button>}</>}/>
 <div className="product-stat-strip"><div><span>Active products</span><strong>{number(products.length)}</strong></div><div><span>In stock</span><strong>{number(products.filter(p=>p.stock>0).length)}</strong></div><div><span>Low stock</span><strong className="amber-text">{number(products.filter(p=>p.stock_status==='low').length)}</strong></div><div><span>Out of stock</span><strong className="red-text">{number(products.filter(p=>p.stock_status==='out').length)}</strong></div></div>
 <section className="panel table-panel"><div className="table-toolbar"><div><h3>Product catalog</h3><p>{shown.length} of {products.length} products</p></div><div className="toolbar-actions"><SearchBox value={search} onChange={setSearch} placeholder="Search name or SKU..."/><Select value={categoryFilter} onChange={setCategoryFilter}><option value="">All categories</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select><Select value={stockFilter} onChange={setStockFilter}><option value="all">All stock</option><option value="healthy">Healthy</option><option value="low">Low stock</option><option value="out">Out of stock</option></Select></div></div>
 {shown.length?<div className="table-scroller"><table className="data-table"><thead><tr><th>PRODUCT</th><th>SKU</th><th>CATEGORY</th><th>PRICE</th><th>IN STOCK</th><th>STATUS</th><th>BARCODE</th>{editable&&<th className="th-right">ACTIONS</th>}</tr></thead><tbody>{shown.map(p=><tr key={p.id}><td><div className="product-cell"><ProductAvatar name={p.name} category={p.category_name} imageUrl={p.image_url}/><div><strong>{p.name}</strong><span>{p.description?.slice(0,54)||'Inventory product'}</span></div></div></td><td><span className="sku-cell">{p.sku}</span></td><td>{p.category_name}</td><td className="td-strong">{money(p.price)}</td><td><strong>{number(p.stock)}</strong> <span className="muted">units</span></td><td><Status value={p.stock_status}/></td><td><button className="barcode-label-link" onClick={()=>setLabelProduct(p)}><Barcode size={15}/> Label</button></td>{editable&&<td><div className="row-actions"><button aria-label={`Edit ${p.name}`} onClick={()=>begin(p)}><Edit3 size={16}/></button><button aria-label={`Archive ${p.name}`} className="remove-btn" onClick={()=>setDeleting(p)}><Trash2 size={16}/></button></div></td>}</tr>)}</tbody></table></div>:<EmptyState title="No matching products" description="Clear the filters or add a new product to your catalog." action={editable?<Button icon={<Plus size={16}/>} onClick={()=>begin()}>Add product</Button>:undefined}/>}
 <div className="table-bottom"><span>Showing {shown.length} products</span><span>Products with past orders are archived, never erased from history.</span></div></section>
 <Modal open={open} onClose={()=>setOpen(false)} title={editing?'Edit product':'Add new product'} subtitle="Set the details for this catalog item." wide><form onSubmit={save} className="form-grid"><Field label="Product name" required><input required maxLength={180} value={form.name} onChange={e=>update('name',e.target.value)} placeholder="e.g. Wireless Headphones"/></Field><Field label="SKU" required><input required maxLength={64} value={form.sku} onChange={e=>update('sku',e.target.value.toUpperCase())} placeholder="e.g. AUD-1001"/></Field><Field label="Category" required><Select value={form.category} onChange={v=>update('category',v)}><option value="">Select category</option>{categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</Select></Field><Field label="Supplier"><Select value={form.supplier} onChange={v=>update('supplier',v)}><option value="">No supplier</option>{suppliers.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</Select></Field><Field label="Selling price" required><input type="number" required min="0" step="0.01" value={form.price} onChange={e=>update('price',e.target.value)} placeholder="0.00"/></Field><Field label="Cost price" required><input type="number" required min="0" step="0.01" value={form.cost} onChange={e=>update('cost',e.target.value)} placeholder="0.00"/></Field><Field label="Low-stock alert threshold"><input type="number" required min="0" value={form.low_stock_threshold} onChange={e=>update('low_stock_threshold',e.target.value)}/></Field><Field label="Stock quantity"><div className="disabled-field">Managed via Inventory → Stock movements</div></Field><div className="field full"><span>Product image (optional, JPG/PNG/WebP · max 3 MB)</span>
  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{
    const file=e.target.files?.[0]||null;
    if(file && file.size>3*1024*1024){toast.error('Image must be 3 MB or smaller');e.target.value='';return;}
    setImageFile(file);setRemoveImage(false);setImagePreview(null);
    if(file){const reader=new FileReader();reader.onload=()=>setImagePreview(typeof reader.result==='string'?reader.result:null);reader.readAsDataURL(file);}
  }}/>
  {(imagePreview||(!removeImage&&editing?.image_url))&&<img className="product-image-preview" src={imagePreview||editing?.image_url||''} alt="Product preview"/>}
  {editing?.image_url&&!imageFile&&<button className="product-image-remove" type="button" onClick={()=>{setRemoveImage(true);setImagePreview(null);}}>Remove current image</button>}
  {removeImage&&<small>The existing image will be removed when you save.</small>}
</div><div className="field full"><span>Description</span><textarea rows={3} value={form.description} onChange={e=>update('description',e.target.value)} placeholder="Additional details about the product..."/></div><div className="full"><FormActions onCancel={()=>setOpen(false)} busy={saving} text={editing?'Save changes':'Create product'}/></div></form></Modal>
 {labelProduct&&<BarcodeLabel sku={labelProduct.sku} name={labelProduct.name} onClose={()=>setLabelProduct(null)}/>}
 {scanning&&<BarcodeScanner onScan={code=>{setSearch(code);setCategoryFilter('');setStockFilter('all');}} onClose={()=>setScanning(false)}/>}
 <Confirm open={!!deleting} onClose={()=>setDeleting(null)} title="Archive this product?" body={`“${deleting?.name}” will be hidden from the active catalog. Existing orders and stock history will be preserved.`} busy={saving} onConfirm={remove}/>
 </div>;
}
