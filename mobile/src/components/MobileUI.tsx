import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function Page({ title, subtitle, children, refreshing, onRefresh }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor="#059669" /> : undefined}
      >
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function StatTile({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <View style={[styles.tile, accent && styles.accentTile]}>
      <Text style={[styles.tileLabel, accent && styles.accentLabel]}>{label}</Text>
      <Text style={[styles.tileValue, accent && styles.accentValue]}>{value}</Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function InfoCard({ title, detail, trailing }: { title: string; detail?: string; trailing?: string }) {
  return (
    <View style={styles.infoCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        {!!detail && <Text style={styles.cardDetail}>{detail}</Text>}
      </View>
      {!!trailing && <Text style={styles.trailing}>{trailing}</Text>}
    </View>
  );
}

export function LoadNotice({ loading, error, onRetry, empty }: { loading: boolean; error: string; onRetry: () => void; empty?: boolean }) {
  if (loading) return <ActivityIndicator size="large" color="#059669" style={{ marginTop: 30 }} />;
  if (error) return (
    <View style={styles.notice}>
      <Text style={styles.error}>{error}</Text>
      <Pressable onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Try Again</Text></Pressable>
    </View>
  );
  if (empty) return <Text style={styles.empty}>No records to display.</Text>;
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F1F5F9' },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 32 },
  title: { color: '#0F172A', fontSize: 27, fontWeight: '800' },
  subtitle: { color: '#64748B', marginTop: 5, marginBottom: 20 },
  tile: { flexBasis: '47%', flexGrow: 1, backgroundColor: 'white', borderRadius: 17, padding: 17, minHeight: 108 },
  accentTile: { backgroundColor: '#047857' },
  tileLabel: { color: '#64748B', fontSize: 12, fontWeight: '600' },
  accentLabel: { color: '#D1FAE5' },
  tileValue: { color: '#0F172A', fontSize: 25, fontWeight: '800', marginTop: 14 },
  accentValue: { color: 'white' },
  section: { color: '#0F172A', fontSize: 18, fontWeight: '700', marginTop: 23, marginBottom: 11 },
  infoCard: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: 'white', borderRadius: 14, padding: 16, marginBottom: 10 },
  cardTitle: { color: '#0F172A', fontWeight: '700', fontSize: 15 },
  cardDetail: { color: '#64748B', fontSize: 12, marginTop: 5 },
  trailing: { color: '#047857', fontWeight: '800' },
  notice: { backgroundColor: 'white', borderRadius: 14, padding: 18, alignItems: 'flex-start', marginTop: 14 },
  error: { color: '#B91C1C', marginBottom: 12 },
  retry: { backgroundColor: '#059669', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: 'white', fontWeight: '700' },
  empty: { color: '#64748B', textAlign: 'center', marginTop: 24 },
});
