import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Page, SectionTitle } from '../components/MobileUI';
import { useAuth } from '../context/AuthContext';

type Report = {
  valid: boolean;
  committed: boolean;
  total: number;
  created: number;
  updated: number;
  error_count: number;
  errors: { row: number; sku: string; field: string; message: string }[];
};

type Mode = 'create' | 'upsert';

export default function BulkProductsScreen() {
  const { user, apiUpload, apiShareCatalog } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'manager';
  const [asset, setAsset] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [mode, setMode] = useState<Mode>('create');
  const [preview, setPreview] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  async function selectFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets.length) return;
      const selected = result.assets[0];
      if (!/\.(csv|xlsx)$/i.test(selected.name)) {
        Alert.alert('Unsupported file', 'Choose a .csv or .xlsx file.');
        return;
      }
      if (selected.size != null && selected.size > 2 * 1024 * 1024) {
        Alert.alert('File too large', 'Maximum upload size is 2 MB.');
        return;
      }
      setAsset(selected);
      setPreview(null);
    } catch (error) {
      Alert.alert('File picker failed', error instanceof Error ? error.message : 'Try again.');
    }
  }

  async function upload(commit: boolean) {
    if (!asset || busy) return;
    setBusy(true);
    try {
      const file = new File(asset.uri);
      const form = new FormData();
      // Expo SDK 58: expo-file-system File implements Blob; no legacy {uri,type,name} object.
      form.append('file', file, asset.name);
      form.append('mode', mode);
      form.append('commit', String(commit));
      const result = await apiUpload<Report>('/products/bulk/import/', form);
      setPreview(result);
      if (result.committed) {
        Alert.alert('Import complete', `${result.created} created and ${result.updated} updated. Stock was not changed.`);
      } else if (!result.valid) {
        Alert.alert('Validation failed', 'Correct the listed row errors and choose the file again. No products were changed.');
      } else {
        Alert.alert('Preview passed', 'Review the counts and select Confirm import to save changes.');
      }
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function share(format: 'csv' | 'xlsx', template: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      await apiShareCatalog(format, template);
    } catch (error) {
      Alert.alert('Download failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return <Page title="Bulk catalog" subtitle="Restricted access"><Text style={styles.warning}>Only Admin and Manager can use bulk product tools.</Text></Page>;
  }

  return (
    <Page title="Bulk catalog" subtitle="Import and export CSV / Excel" refreshing={busy}>
      <Text style={styles.info}>Stock and product photos remain read-only during import. Use Inventory to adjust stock. Maximum 500 products and 2 MB per upload.</Text>
      <SectionTitle>Export product inventory</SectionTitle>
      <View style={styles.group}>
        <Action label="Share inventory CSV" disabled={busy} onPress={() => { void share('csv', false); }} />
        <Action label="Share inventory Excel" disabled={busy} onPress={() => { void share('xlsx', false); }} />
        <Text style={styles.hint}>Exports contain stock values for reporting. They are not import templates.</Text>
      </View>
      <SectionTitle>Download import template</SectionTitle>
      <View style={styles.group}>
        <Action label="CSV template" disabled={busy} onPress={() => { void share('csv', true); }} />
        <Action label="Excel template" disabled={busy} onPress={() => { void share('xlsx', true); }} />
      </View>
      <SectionTitle>Preview / import products</SectionTitle>
      <View style={styles.group}>
        <Action label={asset ? `Selected: ${asset.name}` : 'Choose CSV / Excel file'} disabled={busy} onPress={() => { void selectFile(); }} />
        <Text style={styles.hint}>Categories and suppliers must already exist. Duplicate SKU rows are rejected.</Text>
        <Text style={styles.label}>Existing SKU handling</Text>
        <Action label={mode === 'create' ? '✓ Create new products only' : 'Create new products only'} disabled={busy} onPress={() => { setMode('create'); setPreview(null); }} />
        <Action label={mode === 'upsert' ? '✓ Update existing products or create new' : 'Update existing products or create new'} disabled={busy} onPress={() => { setMode('upsert'); setPreview(null); }} />
        <Action label="Validate / Preview" disabled={!asset || busy} onPress={() => { void upload(false); }} />
        {preview && (
          <View style={styles.result}>
            <Text style={styles.resultTitle}>{preview.committed ? 'Import complete' : preview.valid ? 'Preview valid' : 'Validation errors'}</Text>
            <Text style={styles.resultText}>{preview.total} rows · {preview.created} new · {preview.updated} updates</Text>
            {preview.errors.slice(0, 30).map((issue, index) => (
              <Text key={`${issue.row}-${issue.field}-${index}`} style={styles.warning}>
                Row {issue.row} ({issue.sku || 'no SKU'}) {issue.field}: {issue.message}
              </Text>
            ))}
            {preview.errors.length > 30 && <Text style={styles.hint}>More errors exist; fix the file and preview again.</Text>}
          </View>
        )}
        <Action label="Confirm import" disabled={!asset || !preview?.valid || preview.committed || busy} onPress={() => { void upload(true); }} />
      </View>
      {busy && <ActivityIndicator color="#059669" />}
    </Page>
  );
}

function Action({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}>
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  info: { color: '#334155', lineHeight: 21, marginBottom: 10 },
  group: { gap: 10, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16 },
  button: { backgroundColor: '#047857', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.45 },
  hint: { color: '#64748B', lineHeight: 20 },
  label: { color: '#0F172A', fontWeight: '700' },
  warning: { color: '#B45309', marginTop: 5 },
  result: { backgroundColor: '#F0FDF4', borderRadius: 10, padding: 13, gap: 5 },
  resultTitle: { fontWeight: '800', color: '#065F46' },
  resultText: { color: '#0F172A' },
});
