import { Navigate, Route, Routes } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { useAuth } from './auth';
import { canManage, canOperate } from './lib';
import Layout from './components/Layout';
import Login from './pages/Login';
import DashboardPage from './pages/Dashboard';
import ProductsPage from './pages/Products';
import InventoryPage from './pages/Inventory';
import OrdersPage from './pages/Orders';
import ContactsPage from './pages/Contacts';
import CategoriesPage from './pages/Categories';
import ReportsPage from './pages/Reports';
import TeamPage from './pages/Team';
import { CustomerHomePage, MyOrdersPage, CustomerCatalogPage } from './pages/CustomerPortal';

export default function App(){
 const {user,loading}=useAuth();
 if(loading)return <div className="app-boot"><LoaderCircle className="spin" size={35}/><p>Connecting to SmartStock...</p></div>;
 return <Routes><Route path="/login" element={user?<Navigate to="/" replace/>:<Login/>}/>{user&&<Route element={<Layout/>}>
   <Route path="/" element={canOperate(user.role)?<DashboardPage/>:<Navigate to="/customer" replace/>}/>
   <Route path="/products" element={canOperate(user.role)?<ProductsPage/>:<Navigate to="/catalog" replace/>}/>
   <Route path="/customer" element={user.role==='user'?<CustomerHomePage/>:<Navigate to="/" replace/>}/>
   <Route path="/my/orders" element={user.role==='user'?<MyOrdersPage/>:<Navigate to="/" replace/>}/>
   <Route path="/catalog" element={user.role==='user'?<CustomerCatalogPage/>:<Navigate to="/" replace/>}/>
   <Route path="/inventory" element={canOperate(user.role)?<InventoryPage/>:<Navigate to="/" replace/>}/>
   <Route path="/orders" element={canOperate(user.role)?<OrdersPage/>:<Navigate to="/" replace/>}/>
   <Route path="/customers" element={canOperate(user.role)?<ContactsPage kind="customers"/>:<Navigate to="/" replace/>}/>
   <Route path="/suppliers" element={canManage(user.role)?<ContactsPage kind="suppliers"/>:<Navigate to="/" replace/>}/>
   <Route path="/categories" element={canManage(user.role)?<CategoriesPage/>:<Navigate to="/" replace/>}/>
   <Route path="/reports" element={canManage(user.role)?<ReportsPage/>:<Navigate to="/" replace/>}/>
   <Route path="/team" element={user.role==='admin'?<TeamPage/>:<Navigate to="/" replace/>}/>
 </Route>}<Route path="*" element={<Navigate to={user?'/':'/login'} replace/>}/></Routes>;
}
