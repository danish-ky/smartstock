import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, ArrowUpRight, BarChart3, Bell, Boxes, ChartNoAxesCombined, ChevronDown, CircleHelp, ClipboardList, ContactRound, FolderTree, LayoutDashboard, LogOut, Menu, Package, PackageCheck, Search, Settings2, ShieldCheck, Truck, Users, Warehouse, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../auth';
import { canManage, canOperate, initials } from '../lib';

const customerLinks=[{path:'/customer',label:'Overview',icon:LayoutDashboard},{path:'/my/orders',label:'My orders',icon:ClipboardList},{path:'/catalog',label:'Browse products',icon:Package}];
const groups=[
 {label:'WORKSPACE', links:[{path:'/',label:'Overview',icon:LayoutDashboard},{path:'/products',label:'Products',icon:Package},{path:'/inventory',label:'Inventory',icon:Warehouse},{path:'/orders',label:'Orders',icon:ClipboardList}]},
 {label:'MANAGEMENT', links:[{path:'/customers',label:'Customers',icon:ContactRound},{path:'/suppliers',label:'Suppliers',icon:Truck},{path:'/categories',label:'Categories',icon:FolderTree}]},
 {label:'ANALYTICS', links:[{path:'/reports',label:'Reports',icon:ChartNoAxesCombined},{path:'/team',label:'Team & access',icon:Users}]},
];
const titles:Record<string,string>={'/customer':'Customer overview','/my/orders':'My orders','/catalog':'Browse products','/':'Overview','/products':'Products','/inventory':'Inventory','/orders':'Orders','/customers':'Customers','/suppliers':'Suppliers','/categories':'Categories','/reports':'Reports','/team':'Team & access'};

export default function Layout(){
 const {user,logout}=useAuth();const location=useLocation();const navigate=useNavigate();
 const [mobileOpen,setMobileOpen]=useState(false);
 const isManager=canManage(user?.role);const isOperator=canOperate(user?.role);
 async function signOut(){await logout();toast.success('You have signed out');navigate('/login');}
 return <div className="app-shell">
  {mobileOpen&&<div className="sidebar-scrim" onClick={()=>setMobileOpen(false)}/>}
  <aside className={`sidebar ${mobileOpen?'sidebar-open':''}`}>
   <div className="sidebar-logo"><div className="logo-mark"><Boxes size={23} strokeWidth={2.4}/></div><div><strong>smartstock<span>.</span></strong><small>INVENTORY INTELLIGENCE</small></div><button className="sidebar-close" aria-label="Close menu" onClick={()=>setMobileOpen(false)}><X size={21}/></button></div>
   <div className="workspace-switch"><div className="workspace-icon"><Warehouse size={18}/></div><div><strong>{user?.role==='user'?'Customer Portal':'Main Workspace'}</strong><small>{user?.role==='user'?'My account':'Operations dashboard'}</small></div><ChevronDown size={16}/></div>
   <nav className="sidebar-nav">
    {user?.role==='user' ? <section><div className="nav-label">MY ACCOUNT</div>{customerLinks.map(({path,label,icon:Icon})=><NavLink key={path} to={path} className={({isActive})=>`nav-item ${isActive?'active':''}`} onClick={()=>setMobileOpen(false)}><Icon size={18}/><span>{label}</span></NavLink>)}</section> : groups.map(group=><section key={group.label}><div className="nav-label">{group.label}</div>{group.links.filter(l=>{
      if(l.path==='/team') return user?.role==='admin';
      if(['/reports','/suppliers','/categories'].includes(l.path))return isManager;
      if(['/orders','/inventory','/customers','/'].includes(l.path))return isOperator;
      return true;
     }).map(({path,label,icon:Icon})=><NavLink end={path==='/'} key={path} to={path} className={({isActive})=>`nav-item ${isActive?'active':''}`} onClick={()=>setMobileOpen(false)}><Icon size={18} strokeWidth={1.9}/><span>{label}</span>{path==='/inventory'&&<span className="nav-indicator"/>}</NavLink>)}</section>)}
   </nav>
   <div className="sidebar-bottom"><div className="sidebar-support"><div className="support-icon"><Activity size={17}/></div><strong>All systems ready</strong><p>Your inventory workspace is connected to the SmartStock API.</p><span className="online-pill"><span/> Operational</span></div><button className="sidebar-logout" onClick={signOut}><LogOut size={18}/> Sign out</button></div>
  </aside>
  <div className="main-area">
    <header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={()=>setMobileOpen(true)} aria-label="Open menu"><Menu size={22}/></button><span className="breadcrumb">Workspace</span><span className="breadcrumb-slash">/</span><strong>{titles[location.pathname]||'SmartStock'}</strong></div><div className="topbar-right"><span className="header-date">{new Date().toLocaleDateString('en-IN',{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</span><span className="topbar-divider"/><div className="topbar-bell" aria-label="Notifications"><Bell size={19}/><span/></div><div className="user-chip"><div className="user-avatar">{initials(user?.name||user?.username)}</div><div><strong>{user?.name||user?.username}</strong><span>{user?.role}</span></div><ChevronDown size={15}/></div></div></header>
    <main className="main-content"><Outlet/></main>
    <footer className="app-footer"><span>© {new Date().getFullYear()} SmartStock. Crafted for better operations.</span><span><span className="footer-dot"/> API connected • v1.0</span></footer>
  </div>
 </div>;
}
