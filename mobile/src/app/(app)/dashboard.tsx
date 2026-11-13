import { View } from 'react-native';
import { InfoCard, LoadNotice, Page, SectionTitle, StatTile } from '../../components/MobileUI';
import { useAuth } from '../../context/AuthContext';
import { listItems } from '../../lib/api';
import { useRemote } from '../../lib/useRemote';

type LowProduct = { id: number; name: string; sku?: string; stock?: number };
type Dashboard = {
  total_products?: number;
  total_customers?: number;
  total_orders?: number;
  stock_units?: number;
  low_stock_count?: number;
  total_sales?: number | string;
  low_stock_products?: LowProduct[];
};
type Order = { id: number; status?: string; total?: number | string };
type OrdersPayload = Order[] | { results?: Order[] };

function OperatorDashboard() {
  const { data, busy, error, reload } = useRemote<Dashboard>('/dashboard/');
  return (
    <Page title="Overview" subtitle="Your inventory at a glance" refreshing={busy} onRefresh={reload}>
      <LoadNotice loading={busy && !data} error={error} onRetry={reload} />
      {data && !error && <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <StatTile label="Products" value={data.total_products ?? '—'} accent />
          <StatTile label="Stock Units" value={data.stock_units ?? '—'} />
          <StatTile label="Orders" value={data.total_orders ?? '—'} />
          <StatTile label="Low Stock" value={data.low_stock_count ?? '—'} />
          <StatTile label="Customers" value={data.total_customers ?? '—'} />
          <StatTile label="Total Sales" value={data.total_sales ?? '—'} />
        </View>
        <SectionTitle>Products needing attention</SectionTitle>
        {data.low_stock_products?.length ? data.low_stock_products.map(p => (
          <InfoCard key={p.id} title={p.name} detail={p.sku} trailing={`${p.stock ?? 0} left`} />
        )) : <InfoCard title="No low-stock products" detail="Current inventory is above configured warning levels." />}
      </>}
    </Page>
  );
}

function CustomerDashboard() {
  const { data, busy, error, reload } = useRemote<OrdersPayload>('/my/orders/');
  const orders = listItems(data);
  return (
    <Page title="My Account" subtitle="Your SmartStock customer portal" refreshing={busy} onRefresh={reload}>
      <LoadNotice loading={busy && !data} error={error} onRetry={reload} />
      {data && !error && <>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatTile label="My Orders" value={orders.length} accent />
          <StatTile label="Open Orders" value={orders.filter(o => !['completed', 'cancelled', 'delivered'].includes(o.status || '')).length} />
        </View>
        <SectionTitle>Recent orders</SectionTitle>
        {orders.slice(0, 5).map(o => <InfoCard key={o.id} title={`Order #${o.id}`} detail={`Status: ${o.status ?? 'Unknown'}`} trailing={o.total == null ? undefined : `₹${o.total}`} />)}
        {!orders.length && <InfoCard title="No orders yet" detail="Browse products to explore the catalog." />}
      </>}
    </Page>
  );
}

export default function DashboardScreen() {
  const { user } = useAuth();
  return user?.role === 'user' ? <CustomerDashboard /> : <OperatorDashboard />;
}
