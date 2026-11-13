import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { InfoCard, Page, SectionTitle, StatTile } from './MobileUI';
import { useAuth } from '../context/AuthContext';

type Trend = { day?: string; date?: string; sales?: string | number; orders?: number };
type TopProduct = {
  product__name?: string;
  product__sku?: string;
  units?: number;
  revenue?: string | number;
};
type CategoryStock = {
  category__name?: string;
  product_count?: number;
  units?: number;
};
type Report = {
  start: string;
  end: string;
  sales: string | number;
  orders: number;
  average_order_value: string | number;
  stock_value: string | number;
  low_stock_count: number;
  sales_trend: Trend[];
  top_products: TopProduct[];
  category_stock: CategoryStock[];
};

function todayLocal(): string {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}
function daysAgo(count: number): string {
  const now = new Date();
  now.setDate(now.getDate() - count);
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}
function dateNumber(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value ? date.getTime() : null;
}
function money(value: string | number | undefined): string {
  const amount = Number(value ?? 0);
  return `₹${(Number.isFinite(amount) ? amount : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to retrieve reports.';
}

export default function ReportsPanel() {
  const { apiGet } = useAuth();
  const [start, setStart] = useState(daysAgo(29));
  const [end, setEnd] = useState(todayLocal());
  const [rangeError, setRangeError] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState(30);

  const load = useCallback(async (first: string, last: string) => {
    const from = dateNumber(first);
    const to = dateNumber(last);
    if (from === null || to === null) {
      setRangeError('Use valid dates in YYYY-MM-DD format.');
      return;
    }
    if (from > to || to - from > 366 * 86400000) {
      setRangeError('Start must precede end; maximum range is 366 days.');
      return;
    }
    setRangeError('');
    setBusy(true);
    setError('');
    try {
      const result = await apiGet<Report>(`/reports/?start=${encodeURIComponent(first)}&end=${encodeURIComponent(last)}`);
      setReport(result);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, [apiGet]);

  useEffect(() => { void load(daysAgo(29), todayLocal()); }, [load]);

  const maxSales = useMemo(() => Math.max(0, ...(report?.sales_trend || []).map(item => Number(item.sales || 0))), [report]);

  function quickPeriod(days: number) {
    const from = daysAgo(days - 1);
    const to = todayLocal();
    setPeriod(days);
    setStart(from);
    setEnd(to);
    void load(from, to);
  }

  return (
    <Page title="Reports & Analytics" subtitle="Sales performance, inventory value and stock insights"
      refreshing={busy} onRefresh={() => { void load(start, end); }}>
      <View style={styles.filters}>
        <Text style={styles.fieldLabel}>Report period</Text>
        <View style={styles.quickRow}>
          {[7, 30, 90].map(days => (
            <Pressable key={days} accessibilityRole="button" onPress={() => quickPeriod(days)}
              style={[styles.quickButton, period === days && styles.quickActive]}>
              <Text style={[styles.quickText, period === days && styles.quickActiveText]}>{days} days</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <Text style={styles.fieldLabel}>From (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={start} maxLength={10} onChangeText={value => { setPeriod(0); setStart(value); }}
              autoCorrect={false} autoCapitalize="none" placeholder="2026-11-01" accessibilityLabel="Report start date" />
          </View>
          <View style={styles.dateField}>
            <Text style={styles.fieldLabel}>To (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={end} maxLength={10} onChangeText={value => { setPeriod(0); setEnd(value); }}
              autoCorrect={false} autoCapitalize="none" placeholder="2026-11-14" accessibilityLabel="Report end date" />
          </View>
        </View>
        {!!rangeError && <Text accessibilityRole="alert" style={styles.error}>{rangeError}</Text>}
        <Pressable accessibilityRole="button" style={[styles.apply, busy && styles.disabled]} disabled={busy}
          onPress={() => { void load(start, end); }}>
          <Text style={styles.applyText}>Apply date range</Text>
        </Pressable>
      </View>

      {busy && <ActivityIndicator size="large" color="#047857" style={styles.loading} />}
      {!!error && <View style={styles.notice}>
        <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={() => { void load(start, end); }}><Text style={styles.retry}>Retry</Text></Pressable>
      </View>}
      {!!report && !error && <>
        <Text style={styles.caption}>Showing {report.start} to {report.end}{busy ? ' · refreshing…' : ''}</Text>
        <View style={styles.tiles}>
          <StatTile label="Sales" value={money(report.sales)} accent />
          <StatTile label="Orders" value={report.orders} />
          <StatTile label="Average order" value={money(report.average_order_value)} />
          <StatTile label="Stock value" value={money(report.stock_value)} />
          <StatTile label="Low-stock products" value={report.low_stock_count} />
        </View>

        <SectionTitle>Sales trend</SectionTitle>
        <View style={styles.panel}>
          {!report.sales_trend?.length && <Text style={styles.muted}>No sales in this period.</Text>}
          {(report.sales_trend || []).slice(-15).map((point, i) => {
            const current = Number(point.sales || 0);
            const percentage = maxSales > 0 ? Math.max(2, Math.min(100, current / maxSales * 100)) : 0;
            return <View style={styles.trendRow} key={`${point.day || point.date || i}-${i}`}>
              <Text style={styles.trendDay}>{String(point.day || point.date || '').slice(5)}</Text>
              <View style={styles.track}>
                <View style={[styles.bar, { width: `${percentage}%` as `${number}%` }]} />
              </View>
              <Text style={styles.trendValue}>{money(point.sales)}</Text>
            </View>;
          })}
          {(report.sales_trend || []).length > 15 && <Text style={styles.muted}>Showing the latest 15 daily totals.</Text>}
        </View>

        <SectionTitle>Top-selling products</SectionTitle>
        {report.top_products?.length ? report.top_products.map((product, i) =>
          <InfoCard key={`${product.product__sku || 'item'}-${i}`}
            title={`${i + 1}. ${product.product__name || 'Product'}`}
            detail={`${product.product__sku || 'No SKU'} · ${product.units || 0} units`}
            trailing={money(product.revenue)} />
        ) : <Text style={styles.muted}>No sold products in this date range.</Text>}

        <SectionTitle>Inventory by category</SectionTitle>
        {report.category_stock?.length ? report.category_stock.map((category, i) =>
          <InfoCard key={`${category.category__name || 'uncategorized'}-${i}`}
            title={category.category__name || 'Uncategorized'}
            detail={`${category.product_count || 0} products`}
            trailing={`${category.units || 0} units`} />
        ) : <Text style={styles.muted}>No category stock data.</Text>}
        <Text style={styles.footer}>Totals and access permissions are calculated by the Django API.</Text>
      </>}
    </Page>
  );
}

const styles = StyleSheet.create({
  filters: { backgroundColor: 'white', borderRadius: 15, padding: 16, marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 7 },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 15 },
  quickButton: { flex: 1, alignItems: 'center', padding: 11, backgroundColor: '#E2E8F0', borderRadius: 9 },
  quickActive: { backgroundColor: '#047857' },
  quickText: { color: '#334155', fontSize: 13, fontWeight: '700' },
  quickActiveText: { color: 'white' },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateField: { flex: 1 },
  input: { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', borderWidth: 1, padding: 11, borderRadius: 9, fontSize: 13, color: '#0F172A' },
  apply: { backgroundColor: '#0F766E', borderRadius: 10, padding: 13, marginTop: 13, alignItems: 'center' },
  applyText: { color: 'white', fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  loading: { marginVertical: 20 },
  notice: { padding: 16, borderRadius: 12, backgroundColor: '#FEF2F2' },
  error: { color: '#B91C1C', fontSize: 13, marginTop: 6 },
  retry: { color: '#047857', marginTop: 10, fontWeight: '800' },
  caption: { color: '#64748B', marginBottom: 12, fontSize: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  panel: { padding: 16, backgroundColor: 'white', borderRadius: 15 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 13 },
  trendDay: { width: 45, color: '#475569', fontSize: 11 },
  track: { flex: 1, backgroundColor: '#E2E8F0', height: 12, borderRadius: 7, overflow: 'hidden' },
  bar: { height: 12, backgroundColor: '#059669', borderRadius: 7 },
  trendValue: { width: 83, fontSize: 10, color: '#475569', textAlign: 'right' },
  muted: { color: '#64748B', fontSize: 13, marginTop: 12, marginBottom: 9 },
  footer: { color: '#64748B', fontSize: 11, marginTop: 12, lineHeight: 17 },
});
