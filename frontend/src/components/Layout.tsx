import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardList,
  ContactRound,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  RefreshCw,
  Truck,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../api';
import { useAuth } from '../auth';
import { canManage, canOperate, initials } from '../lib';
import type { Dashboard } from '../types';

const customerLinks = [
  { path: '/customer', label: 'Overview', icon: LayoutDashboard },
  { path: '/my/orders', label: 'My orders', icon: ClipboardList },
  { path: '/catalog', label: 'Browse products', icon: Package },
];

const groups = [
  {
    label: 'WORKSPACE',
    links: [
      { path: '/', label: 'Overview', icon: LayoutDashboard },
      { path: '/products', label: 'Products', icon: Package },
      { path: '/inventory', label: 'Inventory', icon: Warehouse },
      { path: '/orders', label: 'Orders', icon: ClipboardList },
    ],
  },
  {
    label: 'MANAGEMENT',
    links: [
      { path: '/customers', label: 'Customers', icon: ContactRound },
      { path: '/suppliers', label: 'Suppliers', icon: Truck },
      { path: '/categories', label: 'Categories', icon: FolderTree },
    ],
  },
  {
    label: 'ANALYTICS',
    links: [
      { path: '/reports', label: 'Reports', icon: ChartNoAxesCombined },
      { path: '/team', label: 'Team & access', icon: Users },
    ],
  },
];

const titles: Record<string, string> = {
  '/customer': 'Customer overview',
  '/my/orders': 'My orders',
  '/catalog': 'Browse products',
  '/': 'Overview',
  '/products': 'Products',
  '/inventory': 'Inventory',
  '/orders': 'Orders',
  '/customers': 'Customers',
  '/suppliers': 'Suppliers',
  '/categories': 'Categories',
  '/reports': 'Reports',
  '/team': 'Team & access',
};

type OpenMenu = 'notifications' | 'profile' | null;
type StockAlerts = Pick<Dashboard, 'low_stock_count' | 'low_stock_products'>;
type ApiHealth = { status: string };

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const menuContainer = useRef<HTMLDivElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [alerts, setAlerts] = useState<StockAlerts | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState('');
  const [apiHealth, setApiHealth] = useState<'checking' | 'connected' | 'offline'>('checking');

  const isManager = canManage(user?.role);
  const isOperator = canOperate(user?.role);

  const loadAlerts = useCallback(async () => {
    if (!isOperator) return;
    setAlertsLoading(true);
    try {
      const result = await api.get<StockAlerts>('/dashboard/');
      setAlerts(result);
      setAlertsError('');
    } catch (error) {
      setAlertsError(error instanceof Error ? error.message : 'Unable to load stock alerts.');
    } finally {
      setAlertsLoading(false);
    }
  }, [isOperator]);

  // The existing dashboard endpoint provides current low/out-of-stock information.
  useEffect(() => {
    if (isOperator) void loadAlerts();
    else {
      setAlerts(null);
      setAlertsError('');
    }
  }, [isOperator, loadAlerts]);

  // A reachable API is not proof of database health; label the indicator accordingly.
  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        const response = await api.get<ApiHealth>('/health/');
        if (active) setApiHealth(response.status === 'ok' ? 'connected' : 'offline');
      } catch {
        if (active) setApiHealth('offline');
      }
    };
    void checkHealth();
    const interval = window.setInterval(() => void checkHealth(), 60000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  // Clicking outside either menu, pressing Escape or navigating closes the dropdown.
  useEffect(() => {
    const handleOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuContainer.current?.contains(event.target)) {
        setOpenMenu(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [location.pathname]);

  function toggleNotifications() {
    if (openMenu === 'notifications') {
      setOpenMenu(null);
    } else {
      setOpenMenu('notifications');
      void loadAlerts();
    }
  }

  async function signOut() {
    setOpenMenu(null);
    await logout();
    toast.success('You have signed out');
    navigate('/login');
  }

  const displayName = user?.name || user?.username || 'Your account';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#smartstock-main">Skip to main content</a>
      {mobileOpen && (
        <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-mark"><Boxes size={23} strokeWidth={2.4} /></div>
          <div className="brand-copy">
            <strong>smartstock<span>.</span></strong>
            <small>INVENTORY INTELLIGENCE</small>
          </div>
          <button className="sidebar-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
            <X size={21} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {user?.role === 'user' ? (
            <section>
              <div className="nav-label">MY ACCOUNT</div>
              {customerLinks.map(({ path, label, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon size={18} /><span>{label}</span>
                </NavLink>
              ))}
            </section>
          ) : groups.map((group) => (
            <section key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.links.filter((link) => {
                if (link.path === '/team') return user?.role === 'admin';
                if (['/reports', '/suppliers', '/categories'].includes(link.path)) return isManager;
                if (['/orders', '/inventory', '/customers', '/'].includes(link.path)) return isOperator;
                return true;
              }).map(({ path, label, icon: Icon }) => (
                <NavLink
                  end={path === '/'}
                  key={path}
                  to={path}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon size={18} strokeWidth={1.9} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </section>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="sidebar-logout" onClick={() => void signOut()}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu size={22} />
            </button>
            <span className="breadcrumb">Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{titles[location.pathname] || 'SmartStock'}</strong>
          </div>
          <div className="topbar-right">
            <span className="header-date">
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <span className="topbar-divider" />
            <div className="topbar-menus" ref={menuContainer}>
              {isOperator && (
                <button
                  type="button"
                  className={`topbar-bell ${openMenu === 'notifications' ? 'is-open' : ''}`}
                  aria-label={`Stock notifications${alerts ? `, ${alerts.low_stock_count} products need attention` : ''}`}
                  aria-expanded={openMenu === 'notifications'}
                  aria-controls="smartstock-notification-menu"
                  onClick={toggleNotifications}
                >
                  <Bell size={19} />
                  {alerts && alerts.low_stock_count > 0 && <span className="notification-dot" aria-hidden="true" />}
                </button>
              )}
              <button
                type="button"
                className={`user-chip ${openMenu === 'profile' ? 'is-open' : ''}`}
                aria-label={`Account menu for ${displayName}`}
                aria-expanded={openMenu === 'profile'}
                aria-controls="smartstock-profile-menu"
                onClick={() => setOpenMenu((current) => current === 'profile' ? null : 'profile')}
              >
                <div className="user-avatar">{initials(user?.name || user?.username)}</div>
                <div className="profile-meta">
                  <strong>{displayName}</strong>
                  <span>{user?.role}</span>
                </div>
                <ChevronDown className={`profile-chevron ${openMenu === 'profile' ? 'is-open' : ''}`} size={15} />
              </button>

              {isOperator && openMenu === 'notifications' && (
                <section className="topbar-popover notification-menu" id="smartstock-notification-menu" aria-label="Stock notifications">
                  <div className="popover-heading">
                    <div>
                      <h2>Stock notifications</h2>
                      <p>{alerts ? `${alerts.low_stock_count} products need attention` : 'Current inventory alerts'}</p>
                    </div>
                    <button type="button" aria-label="Refresh notifications" title="Refresh notifications" onClick={() => void loadAlerts()} disabled={alertsLoading}>
                      <RefreshCw size={16} className={alertsLoading ? 'spin' : ''} />
                    </button>
                  </div>
                  {alertsError && <p className="popover-error" role="alert">{alertsError}</p>}
                  {alertsLoading && !alerts && <div className="popover-empty">Loading inventory alerts…</div>}
                  {!alertsLoading && !alerts && !alertsError && <div className="popover-empty">No alert data yet.</div>}
                  {alerts && alerts.low_stock_count === 0 && (
                    <div className="popover-empty popover-healthy">All active products have healthy stock.</div>
                  )}
                  {alerts && alerts.low_stock_count > 0 && (
                    <>
                      <div className="notification-list">
                        {alerts.low_stock_products.map((product) => (
                          <Link key={product.id} to="/inventory" className="notification-item" onClick={() => setOpenMenu(null)}>
                            <span className={`notification-icon ${product.stock === 0 ? 'is-out' : ''}`}>
                              <AlertTriangle size={18} />
                            </span>
                            <span className="notification-copy">
                              <strong>{product.name}</strong>
                              <small>{product.sku} · Minimum {product.low_stock_threshold}</small>
                            </span>
                            <span className={`notification-quantity ${product.stock === 0 ? 'is-out' : ''}`}>
                              {product.stock === 0 ? 'Out of stock' : `${product.stock} left`}
                            </span>
                          </Link>
                        ))}
                      </div>
                      {alerts.low_stock_count > alerts.low_stock_products.length && (
                        <p className="popover-hint">Showing {alerts.low_stock_products.length} of {alerts.low_stock_count} alerts.</p>
                      )}
                    </>
                  )}
                  <Link to="/inventory" className="popover-footer-link" onClick={() => setOpenMenu(null)}>
                    View inventory <ArrowRight size={15} />
                  </Link>
                </section>
              )}

              {openMenu === 'profile' && (
                <section className="topbar-popover profile-menu" id="smartstock-profile-menu" aria-label="My account">
                  <div className="popover-heading"><div><h2>My account</h2><p>Signed in to SmartStock</p></div></div>
                  <div className="profile-details">
                    <div className="profile-detail-avatar">{initials(user?.name || user?.username)}</div>
                    <strong>{displayName}</strong>
                    <span>{user?.email || user?.username}</span>
                    <span className="profile-role">{user?.role}</span>
                  </div>
                  <button type="button" className="profile-signout" onClick={() => void signOut()}>
                    <LogOut size={16} /> Sign out
                  </button>
                </section>
              )}
            </div>
          </div>
        </header>
        <main id="smartstock-main" className="main-content"><Outlet /></main>
        <footer className="app-footer">
          <span>© {new Date().getFullYear()} SmartStock. Crafted for better operations.</span>
          <span className="api-health-status" role="status" aria-live="polite">
            <span className={`footer-dot health-${apiHealth}`} />
            {apiHealth === 'connected' ? 'API reachable' : apiHealth === 'offline' ? 'API unavailable' : 'Checking API'}
            {' · v1.0'}
          </span>
        </footer>
      </div>
    </div>
  );
}
