import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmeraldGradient } from './OrevonPolish';
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

function ReportHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionHeading}>{title}</Text>
      {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

function ReportListRow({ marker, title, detail, trailing }: {
  marker: string; title: string; detail: string; trailing: string;
}) {
  return (
    <View style={styles.listRow}>
      <View style={styles.rowMarker}><Text style={styles.rowMarkerText}>{marker}</Text></View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.rowDetail} numberOfLines={2}>{detail}</Text>
      </View>
      <Text style={styles.rowTrailing} numberOfLines={2}>{trailing}</Text>
    </View>
  );
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
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

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
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.screenContent}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={() => { void load(start, end); }} tintColor="#0AA586" />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View pointerEvents="none" style={styles.heroOrbLarge} />
          <View pointerEvents="none" style={styles.heroOrbSmall} />
          <Text style={styles.heroEyebrow}>OREVON  /  ANALYTICS</Text>
          <Text style={styles.heroTitle}>Reports & Analytics</Text>
          <Text style={styles.heroDescription}>Sales performance, inventory value and the numbers behind your business.</Text>
          <View style={styles.heroFooter}>
            <View style={styles.heroDot} />
            <Text style={styles.heroFooterText}>WORKSPACE INSIGHTS</Text>
          </View>
        </View>

        <View style={styles.filters}>
          <Text style={styles.sectionEyebrow}>REPORT SETTINGS</Text>
          <Text style={styles.filterHeading}>Choose a reporting period</Text>
          <Text style={styles.filterDescription}>Quickly explore results or select your own date range.</Text>
          <Text style={styles.fieldLabel}>Report period</Text>
          <View style={styles.quickRow}>
            {[7, 30, 90].map(days => (
              <Pressable key={days} accessibilityRole="button" accessibilityState={{ selected: period === days }}
                onPress={() => quickPeriod(days)} style={({ pressed }) => [styles.quickButton, period === days && styles.quickActive, pressed && styles.pressed]}>
                <Text style={[styles.quickText, period === days && styles.quickActiveText]}>{days} days</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={styles.fieldLabel}>From (YYYY-MM-DD)</Text>
              <TextInput style={styles.input} value={start} maxLength={10} onChangeText={value => { setPeriod(0); setStart(value); }}
                autoCorrect={false} autoCapitalize="none" placeholder="2026-11-01" placeholderTextColor="#94A8A4"
                accessibilityLabel="Report start date" />
            </View>
            <View style={styles.dateField}>
              <Text style={styles.fieldLabel}>To (YYYY-MM-DD)</Text>
              <TextInput style={styles.input} value={end} maxLength={10} onChangeText={value => { setPeriod(0); setEnd(value); }}
                autoCorrect={false} autoCapitalize="none" placeholder="2026-11-14" placeholderTextColor="#94A8A4"
                accessibilityLabel="Report end date" />
            </View>
          </View>
          {!!rangeError && <Text accessibilityRole="alert" style={styles.error}>{rangeError}</Text>}
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.apply, busy && styles.disabled, pressed && styles.pressed]}
            disabled={busy} onPress={() => { void load(start, end); }}>
            <EmeraldGradient radius={14} />
            <Text style={styles.applyText}>Apply date range</Text>
          </Pressable>
        </View>

        {busy && <ActivityIndicator size="large" color="#0AA586" style={styles.loading} />}
        {!!error && <View style={styles.notice}>
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void load(start, end); }}><Text style={styles.retry}>Retry</Text></Pressable>
        </View>}
        {!!report && !error && <>
          <ReportHeading eyebrow="BUSINESS SNAPSHOT" title="At a glance" subtitle="Tap any metric to highlight it" />
          <View style={styles.dateBadge}><Text style={styles.dateBadgeText}>Showing {report.start} to {report.end}{busy ? ' · refreshing…' : ''}</Text></View>
          <View style={styles.tiles}>
            {[
              { key: 'sales', label: 'Sales', value: money(report.sales), mark: '₹' },
              { key: 'orders', label: 'Orders', value: report.orders, mark: '≡' },
              { key: 'average', label: 'Average order', value: money(report.average_order_value), mark: '◉' },
              { key: 'stock', label: 'Stock value', value: money(report.stock_value), mark: '▦' },
              { key: 'low', label: 'Low-stock products', value: report.low_stock_count, mark: '!' },
            ].map(item => {
              const selected = selectedMetric === item.key;
              return (
                <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`${item.label}: ${item.value}`}
                  accessibilityHint="Highlights this report metric" accessibilityState={{ selected }}
                  onPress={() => setSelectedMetric(old => old === item.key ? null : item.key)}
                  style={({ pressed }) => [styles.metric, selected && styles.metricSelected, pressed && styles.pressed]}>
                  {selected && <View pointerEvents="none" style={styles.metricSelectionBar} />}
                  <View style={styles.metricTop}>
                    <Text style={[styles.metricLabel, selected && styles.metricLabelSelected]}>{item.label}</Text>
                    <View style={[styles.metricIcon, selected && styles.metricIconSelected]}><Text style={styles.metricMark}>{item.mark}</Text></View>
                  </View>
                  <Text style={[styles.metricValue, selected && styles.metricValueSelected]}
                    numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{item.value}</Text>
                </Pressable>
              );
            })}
          </View>

          <ReportHeading eyebrow="SALES PERFORMANCE" title="Sales trend" subtitle="Daily revenue across the selected period" />
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
                <Text style={styles.trendValue} numberOfLines={1}>{money(point.sales)}</Text>
              </View>;
            })}
            {(report.sales_trend || []).length > 15 && <Text style={styles.muted}>Showing the latest 15 daily totals.</Text>}
          </View>

          <ReportHeading eyebrow="PRODUCT PERFORMANCE" title="Top-selling products" subtitle="Products ranked by sales in this period" />
          {report.top_products?.length ? report.top_products.map((product, i) =>
            <ReportListRow key={`${product.product__sku || 'item'}-${i}`}
              marker={String(i + 1).padStart(2, '0')}
              title={product.product__name || 'Product'}
              detail={`${product.product__sku || 'No SKU'} · ${product.units || 0} units`}
              trailing={money(product.revenue)} />
          ) : <View style={styles.emptyCard}><Text style={styles.muted}>No sold products in this date range.</Text></View>}

          <ReportHeading eyebrow="INVENTORY INSIGHTS" title="Inventory by category" subtitle="Distribution of products and stock units" />
          {report.category_stock?.length ? report.category_stock.map((category, i) =>
            <ReportListRow key={`${category.category__name || 'uncategorized'}-${i}`}
              marker="▦"
              title={category.category__name || 'Uncategorized'}
              detail={`${category.product_count || 0} products`}
              trailing={`${category.units || 0} units`} />
          ) : <View style={styles.emptyCard}><Text style={styles.muted}>No category stock data.</Text></View>}
          <Text style={styles.footer}>Totals and access permissions are calculated by the Django API.</Text>
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F9F7' },
  screenContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 44 },
  hero: { backgroundColor: '#122A3B', borderRadius: 23, paddingHorizontal: 20, paddingTop: 23, paddingBottom: 19, marginBottom: 18, overflow: 'hidden' },
  heroOrbLarge: { position: 'absolute', right: -66, top: -84, width: 220, height: 220, borderRadius: 120, backgroundColor: 'rgba(10,165,134,0.16)' },
  heroOrbSmall: { position: 'absolute', right: 20, bottom: -54, width: 100, height: 100, borderRadius: 60, backgroundColor: 'rgba(95,219,179,0.10)' },
  heroEyebrow: { color: '#76E3C6', fontSize: 10, fontWeight: '900', letterSpacing: 1.8, marginBottom: 12 },
  heroTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', letterSpacing: -0.5, marginBottom: 8 },
  heroDescription: { color: '#C2D5DD', fontSize: 13, lineHeight: 20, maxWidth: 280 },
  heroFooter: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 19, paddingTop: 13, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  heroDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#42D2AB' },
  heroFooterText: { color: '#B8EADA', letterSpacing: 1, fontSize: 10, fontWeight: '800' },
  filters: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 17, marginBottom: 8, borderWidth: 1, borderColor: '#DBEBE6', elevation: 2, shadowColor: '#153E38', shadowOpacity: 0.05, shadowRadius: 9, shadowOffset: { width: 0, height: 3 } },
  sectionEyebrow: { color: '#079878', fontSize: 10, fontWeight: '900', letterSpacing: 1.45 },
  filterHeading: { color: '#173048', fontSize: 20, fontWeight: '900', letterSpacing: -0.35, marginTop: 7 },
  filterDescription: { color: '#718497', fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 19 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: '#486374', marginBottom: 8 },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 17 },
  quickButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, backgroundColor: '#EFF5F3', borderWidth: 1, borderColor: '#E4EEEA', borderRadius: 11 },
  quickActive: { backgroundColor: '#E1F8EF', borderColor: '#33BE9A' },
  quickText: { color: '#597282', fontSize: 12, fontWeight: '800' },
  quickActiveText: { color: '#067C63' },
  dateRow: { flexDirection: 'row', gap: 9 },
  dateField: { flex: 1, minWidth: 0 },
  input: { backgroundColor: '#F7FBFA', borderColor: '#D7E7E3', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 11, fontSize: 12, color: '#173048' },
  apply: { overflow: 'hidden', backgroundColor: '#0AA586', borderRadius: 14, paddingVertical: 15, marginTop: 16, alignItems: 'center' },
  applyText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 0.2 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.83 },
  loading: { marginVertical: 20 },
  notice: { padding: 16, borderRadius: 14, backgroundColor: '#FFF3F2', borderWidth: 1, borderColor: '#F9D6D3', marginTop: 10 },
  error: { color: '#B91C1C', fontSize: 12, marginTop: 9, lineHeight: 18 },
  retry: { color: '#087D65', marginTop: 10, fontWeight: '900' },
  sectionHeader: { marginTop: 23, marginBottom: 12 },
  sectionHeading: { color: '#173048', fontSize: 21, fontWeight: '900', letterSpacing: -0.4, marginTop: 5 },
  sectionSubtitle: { color: '#748596', fontSize: 12, lineHeight: 18, marginTop: 4 },
  dateBadge: { alignSelf: 'flex-start', backgroundColor: '#E4F6EF', borderRadius: 11, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 13 },
  dateBadgeText: { color: '#267F69', fontSize: 11, fontWeight: '700' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 12 },
  metric: { overflow: 'hidden', backgroundColor: '#FFFFFF', borderRadius: 19, paddingHorizontal: 16, paddingVertical: 16, borderWidth: 1, borderColor: '#E2EEE9', flexBasis: '46%', flexGrow: 1, minWidth: 0, minHeight: 118, justifyContent: 'space-between', elevation: 2, shadowColor: '#153E38', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  metricSelected: { backgroundColor: '#E5F9F0', borderColor: '#40C5A2', elevation: 4, shadowColor: '#0C9B78', shadowOpacity: 0.14 },
  metricSelectionBar: { height: 3, backgroundColor: '#14B58F', position: 'absolute', top: 0, left: 14, right: 14, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  metricTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' },
  metricLabel: { color: '#637B8B', fontWeight: '800', fontSize: 12, flex: 1 },
  metricLabelSelected: { color: '#087D65' },
  metricIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#EAF6F2', alignItems: 'center', justifyContent: 'center' },
  metricIconSelected: { backgroundColor: '#CBF1E2' },
  metricMark: { color: '#079B79', fontWeight: '900', fontSize: 15 },
  metricValue: { color: '#173048', fontSize: 24, fontWeight: '900', letterSpacing: -0.5, marginTop: 10 },
  metricValueSelected: { color: '#096A57' },
  panel: { padding: 17, backgroundColor: '#FFFFFF', borderRadius: 19, borderWidth: 1, borderColor: '#DBEBE6' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 15 },
  trendDay: { width: 43, color: '#637B8B', fontSize: 11, fontWeight: '700' },
  track: { flex: 1, backgroundColor: '#EBF4F0', height: 12, borderRadius: 8, overflow: 'hidden' },
  bar: { height: 12, backgroundColor: '#0AA586', borderRadius: 8 },
  trendValue: { width: 86, fontSize: 10, color: '#35596B', textAlign: 'right', fontWeight: '700' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DBEBE6', borderRadius: 16, marginBottom: 10 },
  rowMarker: { width: 35, height: 35, borderRadius: 11, backgroundColor: '#E6F8F0', alignItems: 'center', justifyContent: 'center' },
  rowMarkerText: { color: '#087D65', fontSize: 12, fontWeight: '900' },
  rowContent: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13, fontWeight: '900', color: '#173048' },
  rowDetail: { fontSize: 11, color: '#718497', marginTop: 4 },
  rowTrailing: { maxWidth: 95, textAlign: 'right', color: '#087D65', fontWeight: '900', fontSize: 12 },
  emptyCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DBEBE6', padding: 17, borderRadius: 17 },
  muted: { color: '#718497', fontSize: 12, lineHeight: 19 },
  footer: { color: '#748596', fontSize: 11, marginTop: 18, lineHeight: 17, textAlign: 'center' },
});
