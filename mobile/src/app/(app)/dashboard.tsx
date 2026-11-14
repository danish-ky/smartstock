import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LoadNotice, Page } from '../../components/MobileUI';
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
type ForecastRow = {
  id: number;
  name: string;
  sku: string;
  stock: number;
  on_order_units: number;
  alert: 'out' | 'low' | 'at_risk' | 'healthy';
  recent_units_sold: number;
  days_remaining: number | null;
  suggested_reorder: number;
};
type InventoryForecast = {
  history_days: number;
  lead_days: number;
  out_of_stock_count: number;
  forecast_risk_count: number;
  reorder_count: number;
  products: ForecastRow[];
};
type Order = { id: number; status?: string; total?: number | string };
type OrdersPayload = Order[] | { results?: Order[] };

const theme = {
  navy: '#12243A',
  deepNavy: '#0C1C2F',
  green: '#059A75',
  mint: '#6CE3B8',
  text: '#18283C',
  muted: '#64758B',
  border: '#E6EBF1',
  surface: '#FFFFFF',
};

function niceName(value: string) {
  const first = value.trim().split(/\s+/)[0];
  return first.length > 22 ? `${first.slice(0, 21)}…` : first;
}

function Greeting({ name, customer = false }: { name: string; customer?: boolean }) {
  return (
    <View style={styles.hero}>
      <View pointerEvents="none" style={styles.heroGlowLarge} />
      <View pointerEvents="none" style={styles.heroGlowSmall} />
      <Text style={styles.heroEyebrow}>OREVON  /  {customer ? 'MY ACCOUNT' : 'WORKSPACE'}</Text>
      <Text style={styles.heroTitle} numberOfLines={2}>Welcome back, {niceName(name)}</Text>
      <Text style={styles.heroText}>
        {customer ? 'Your orders and account activity, in one place.' : 'A clear view of the products, orders and stock that matter.'}
      </Text>
      <View style={styles.heroBottom}>
        <View style={styles.heroDot} />
        <Text style={styles.heroFoot}>Inventory & order management</Text>
      </View>
    </View>
  );
}

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

function Metric({ label, value, mark, highlight = false }: {
  label: string;
  value: string | number;
  mark: string;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.metric, highlight && styles.metricHighlight]}>
      <View style={styles.metricTop}>
        <Text style={[styles.metricLabel, highlight && styles.lightLabel]}>{label}</Text>
        <View style={[styles.metricMark, highlight && styles.metricMarkHighlight]}>
          <Text style={[styles.metricMarkText, highlight && styles.lightValue]}>{mark}</Text>
        </View>
      </View>
      <Text style={[styles.metricValue, highlight && styles.lightValue]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
        {value}
      </Text>
    </View>
  );
}

function Action({ title, hint, symbol, onPress }: { title: string; hint: string; symbol: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${title}`} onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <View style={styles.actionIcon}><Text style={styles.actionSymbol}>{symbol}</Text></View>
      <View style={styles.actionTextBlock}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionHint}>{hint}</Text>
      </View>
      <Text style={styles.actionArrow}>›</Text>
    </Pressable>
  );
}

function AlertItem({ item }: { item: LowProduct }) {
  return (
    <View style={styles.rowCard}>
      <View style={styles.warningIcon}><Text style={styles.warningIconText}>!</Text></View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.rowMeta}>{item.sku ? `SKU ${item.sku}` : 'Product inventory'}</Text>
      </View>
      <View style={styles.stockBadge}>
        <Text style={styles.stockBadgeText}>{item.stock ?? 0} left</Text>
      </View>
    </View>
  );
}

function ForecastItem({ item, historyDays }: { item: ForecastRow; historyDays: number }) {
  const label = item.alert === 'out' ? 'OUT' : item.alert === 'low' ? 'LOW' : item.alert === 'at_risk' ? 'AT RISK' : 'HEALTHY';
  const urgent = item.alert === 'out' || item.alert === 'low';
  return (
    <View style={styles.forecastCard}>
      <View style={styles.forecastTitleLine}>
        <View style={styles.flex}>
          <Text style={styles.rowTitle} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.rowMeta}>SKU {item.sku}</Text>
        </View>
        <View style={[styles.forecastPill, urgent && styles.forecastPillUrgent]}>
          <Text style={[styles.forecastPillText, urgent && styles.forecastPillUrgentText]}>{label}</Text>
        </View>
      </View>
      <View style={styles.factStrip}>
        <View style={styles.fact}><Text style={styles.factLabel}>IN STOCK</Text><Text style={styles.factNumber}>{item.stock}</Text></View>
        <View style={styles.fact}><Text style={styles.factLabel}>INCOMING</Text><Text style={styles.factNumber}>{item.on_order_units}</Text></View>
        <View style={styles.fact}><Text style={styles.factLabel}>REORDER</Text><Text style={[styles.factNumber, styles.greenText]}>{item.suggested_reorder}</Text></View>
      </View>
      <Text style={styles.forecastNote}>
        {item.days_remaining == null ? 'Coverage unknown — no recent sales estimate' : `Estimated coverage: ~${item.days_remaining} days`}
        {` · Sold ${item.recent_units_sold} in ${historyDays} days`}
      </Text>
    </View>
  );
}

function OperatorDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { data, busy, error, reload } = useRemote<Dashboard>('/dashboard/');
  const { data: forecast, busy: forecastBusy, error: forecastError, reload: reloadForecast } = useRemote<InventoryForecast>('/inventory/forecast/?limit=8');
  const displayName = user?.full_name || user?.name || user?.username || 'there';
  const refresh = () => { void reload(); void reloadForecast(); };

  return (
    <Page title="Overview" subtitle="Your operations dashboard" refreshing={busy || forecastBusy} onRefresh={refresh}>
      <Greeting name={displayName} />
      <LoadNotice loading={busy && !data} error={error} onRetry={reload} />
      {data && !error && <>
        <SectionHeader eyebrow="BUSINESS SNAPSHOT" title="At a glance" subtitle="Current figures from your workspace" />
        <View style={styles.metricGrid}>
          <Metric label="Products" value={data.total_products ?? '—'} mark="▦" highlight />
          <Metric label="Stock units" value={data.stock_units ?? '—'} mark="◫" />
          <Metric label="Orders" value={data.total_orders ?? '—'} mark="≡" />
          <Metric label="Low stock" value={data.low_stock_count ?? '—'} mark="!" />
          <Metric label="Customers" value={data.total_customers ?? '—'} mark="◉" />
          <Metric label="Total sales" value={data.total_sales == null ? '—' : `₹${data.total_sales}`} mark="₹" />
        </View>
        <SectionHeader eyebrow="QUICK ACCESS" title="Go to" />
        <View style={styles.quickActions}>
          <Action title="Products" hint="Browse catalog" symbol="▦" onPress={() => router.push('/products')} />
          <Action title="Orders" hint="View sales" symbol="≡" onPress={() => router.push('/orders')} />
          <Action title="Inventory" hint="Stock movements" symbol="◫" onPress={() => router.push('/inventory')} />
        </View>
        <SectionHeader eyebrow="STOCK WATCH" title="Needs attention" subtitle="Products at or below warning levels" />
        {data.low_stock_products?.length ? data.low_stock_products.map(p => <AlertItem key={p.id} item={p} />) : (
          <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Stock looks healthy</Text><Text style={styles.emptyText}>No low-stock products are reported.</Text></View>
        )}
        <SectionHeader eyebrow="INVENTORY INTELLIGENCE" title="Forecast & restock" subtitle="Estimates based on recent sales and open supplier orders" />
        <LoadNotice loading={forecastBusy && !forecast} error={forecastError} onRetry={reloadForecast} />
        {forecast && !forecastError && <>
          <View style={styles.forecastCounters}>
            <View style={styles.counter}><Text style={styles.counterValue}>{forecast.out_of_stock_count}</Text><Text style={styles.counterLabel}>Out of stock</Text></View>
            <View style={styles.counter}><Text style={styles.counterValue}>{forecast.forecast_risk_count}</Text><Text style={styles.counterLabel}>Lead-time risk</Text></View>
            <View style={styles.counter}><Text style={styles.counterValue}>{forecast.reorder_count}</Text><Text style={styles.counterLabel}>Reorder hints</Text></View>
          </View>
          {forecast.products.length ? forecast.products.map(p => <ForecastItem key={p.id} item={p} historyDays={forecast.history_days} />) : (
            <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No reorder alerts</Text><Text style={styles.emptyText}>Current stock meets configured demand and minimum levels.</Text></View>
          )}
          <Text style={styles.disclaimer}>Planning estimates only · {forecast.history_days}-day sales window · {forecast.lead_days}-day assumed lead time. Pending supplier deliveries reduce reorder suggestions. No automatic purchases.</Text>
        </>}
      </>}
    </Page>
  );
}

function CustomerDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { data, busy, error, reload } = useRemote<OrdersPayload>('/my/orders/');
  const orders = listItems(data);
  const displayName = user?.full_name || user?.name || user?.username || 'there';
  return (
    <Page title="My account" subtitle="Your Orevon customer portal" refreshing={busy} onRefresh={reload}>
      <Greeting name={displayName} customer />
      <LoadNotice loading={busy && !data} error={error} onRetry={reload} />
      {data && !error && <>
        <SectionHeader eyebrow="YOUR ACTIVITY" title="My orders" />
        <View style={styles.metricGrid}>
          <Metric label="All orders" value={orders.length} mark="≡" highlight />
          <Metric label="Open orders" value={orders.filter(o => !['completed', 'cancelled', 'delivered'].includes(o.status || '')).length} mark="◉" />
        </View>
        <SectionHeader eyebrow="QUICK ACCESS" title="Explore" />
        <Action title="My orders" hint="Track purchases" symbol="≡" onPress={() => router.push('/orders')} />
        <Action title="Products" hint="Browse catalog" symbol="▦" onPress={() => router.push('/products')} />
        <SectionHeader eyebrow="RECENT ACTIVITY" title="Latest orders" />
        {orders.slice(0, 5).map(o => (
          <View style={styles.rowCard} key={o.id}>
            <View style={styles.orderIcon}><Text style={styles.orderIconText}>≡</Text></View>
            <View style={styles.flex}><Text style={styles.rowTitle}>Order #{o.id}</Text><Text style={styles.rowMeta}>{o.status || 'Unknown status'}</Text></View>
            {o.total != null && <Text style={styles.orderTotal}>₹{o.total}</Text>}
          </View>
        ))}
        {!orders.length && <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No orders yet</Text><Text style={styles.emptyText}>Browse the product catalog to get started.</Text></View>}
      </>}
    </Page>
  );
}

export default function DashboardScreen() {
  const { user } = useAuth();
  return user?.role === 'user' ? <CustomerDashboard /> : <OperatorDashboard />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { marginTop: 3, backgroundColor: theme.navy, borderRadius: 24, padding: 22, minHeight: 196, marginBottom: 5, overflow: 'hidden' },
  heroGlowLarge: { position: 'absolute', width: 210, height: 210, borderRadius: 110, right: -85, top: -105, backgroundColor: '#1A967C', opacity: 0.26 },
  heroGlowSmall: { position: 'absolute', width: 114, height: 114, borderRadius: 60, right: 18, bottom: -80, backgroundColor: '#40D0AA', opacity: 0.14 },
  heroEyebrow: { color: '#91E9C7', fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  heroTitle: { color: '#FFFFFF', fontSize: 25, lineHeight: 31, fontWeight: '800', marginTop: 15, maxWidth: '87%' },
  heroText: { color: '#D3E2EA', fontSize: 13, lineHeight: 20, marginTop: 7, maxWidth: '88%' },
  heroBottom: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 16 },
  heroDot: { width: 6, height: 6, borderRadius: 5, backgroundColor: theme.mint },
  heroFoot: { color: '#B8D1DE', fontSize: 11, fontWeight: '600' },
  sectionHead: { marginTop: 23, marginBottom: 12 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.3, color: '#078A71', marginBottom: 5 },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: theme.text },
  sectionSubtitle: { color: theme.muted, fontSize: 12, marginTop: 5, lineHeight: 17 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  metric: { backgroundColor: theme.surface, borderRadius: 19, padding: 15, borderWidth: 1, borderColor: theme.border, flexBasis: '47%', flexGrow: 1, minHeight: 112, justifyContent: 'space-between' },
  metricHighlight: { backgroundColor: theme.green, borderColor: theme.green },
  metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  metricLabel: { color: theme.muted, fontSize: 12, fontWeight: '600' },
  lightLabel: { color: '#E6FFF5' },
  metricMark: { backgroundColor: '#F1F7F8', width: 26, height: 26, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  metricMarkHighlight: { backgroundColor: '#2EB491' },
  metricMarkText: { color: theme.green, fontWeight: '800', fontSize: 15 },
  metricValue: { fontSize: 23, fontWeight: '800', color: theme.text, marginTop: 14 },
  lightValue: { color: '#FFFFFF' },
  quickActions: { gap: 9 },
  action: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  pressed: { opacity: 0.75 },
  actionIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#E6F7F1', alignItems: 'center', justifyContent: 'center' },
  actionSymbol: { fontSize: 21, fontWeight: '800', color: theme.green },
  actionTextBlock: { flex: 1 },
  actionTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
  actionHint: { color: theme.muted, fontSize: 11, marginTop: 3 },
  actionArrow: { fontSize: 28, color: '#7E93A4', marginRight: 4, marginTop: -4 },
  rowCard: { borderRadius: 15, borderWidth: 1, borderColor: theme.border, backgroundColor: '#FFFFFF', padding: 13, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 11 },
  warningIcon: { width: 37, height: 37, borderRadius: 11, backgroundColor: '#FFF2E9', justifyContent: 'center', alignItems: 'center' },
  warningIconText: { fontSize: 18, fontWeight: '900', color: '#C66B24' },
  rowTitle: { color: theme.text, fontSize: 13, fontWeight: '700' },
  rowMeta: { marginTop: 4, fontSize: 11, color: theme.muted },
  stockBadge: { paddingVertical: 7, paddingHorizontal: 9, backgroundColor: '#FFF0ED', borderRadius: 9, maxWidth: 94 },
  stockBadgeText: { fontSize: 11, color: '#BB4B39', fontWeight: '800' },
  emptyCard: { backgroundColor: '#FFFFFF', borderColor: theme.border, borderWidth: 1, borderRadius: 15, padding: 17 },
  emptyTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
  emptyText: { marginTop: 5, color: theme.muted, fontSize: 12, lineHeight: 18 },
  forecastCounters: { flexDirection: 'row', gap: 9, marginBottom: 9 },
  counter: { flex: 1, minWidth: 0, borderRadius: 14, backgroundColor: '#E8F4F0', paddingVertical: 14, paddingHorizontal: 9, alignItems: 'center' },
  counterValue: { fontSize: 21, fontWeight: '800', color: theme.deepNavy },
  counterLabel: { marginTop: 5, color: '#416B64', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  forecastCard: { backgroundColor: theme.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 14, marginTop: 7 },
  forecastTitleLine: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  forecastPill: { backgroundColor: '#E8F5F0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  forecastPillUrgent: { backgroundColor: '#FFF0E9' },
  forecastPillText: { fontSize: 10, color: '#0B7F60', fontWeight: '800' },
  forecastPillUrgentText: { color: '#AE5737' },
  factStrip: { flexDirection: 'row', marginTop: 14, backgroundColor: '#F5F8FA', borderRadius: 12, padding: 11 },
  fact: { flex: 1, alignItems: 'center' },
  factLabel: { fontSize: 9, letterSpacing: 0.4, fontWeight: '700', color: theme.muted },
  factNumber: { color: theme.text, fontSize: 17, fontWeight: '800', marginTop: 5 },
  greenText: { color: theme.green },
  forecastNote: { color: theme.muted, fontSize: 11, lineHeight: 17, marginTop: 10 },
  disclaimer: { color: '#7B8999', fontSize: 11, lineHeight: 17, marginTop: 14, marginBottom: 10 },
  orderIcon: { width: 37, height: 37, borderRadius: 11, backgroundColor: '#E6F7F1', justifyContent: 'center', alignItems: 'center' },
  orderIconText: { color: theme.green, fontSize: 19, fontWeight: '800' },
  orderTotal: { color: theme.text, fontSize: 13, fontWeight: '800' },
});
