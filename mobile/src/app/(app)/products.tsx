import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadNotice, Page, SectionTitle } from '../../components/MobileUI';
import { useAuth } from '../../context/AuthContext';
import { listItems } from '../../lib/api';
import { useRemote } from '../../lib/useRemote';

type Product = {
  id: number;
  name: string;
  sku?: string;
  description?: string;
  category?: number;
  supplier?: number | null;
  supplier_name?: string;
  stock?: number;
  price?: string | number;
  cost?: string | number;
  low_stock_threshold?: number;
  category_name?: string;
  stock_status?: string;
  image_url?: string | null;
};
type Payload = Product[] | { results?: Product[] };
type Choice = { id: number; name: string };
type ChoicePayload = Choice[] | { results?: Choice[] };
type ProductForm = {
  name: string;
  sku: string;
  description: string;
  category: string;
  supplier: string;
  price: string;
  cost: string;
  low_stock_threshold: string;
};
const freshForm: ProductForm = {
  name: '', sku: '', description: '', category: '', supplier: '',
  price: '', cost: '0', low_stock_threshold: '10',
};

function FormField({ label, value, onChangeText, numeric = false, multiline = false }: {
  label: string; value: string; onChangeText: (value: string) => void;
  numeric?: boolean; multiline?: boolean;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor="#94A3B8"
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        autoCapitalize={label === 'SKU' ? 'characters' : 'sentences'}
        multiline={multiline}
        maxLength={multiline ? 2000 : 180}
      />
    </View>
  );
}

// A scanned value must match an existing product SKU; scanning never changes stock.
const barcodeTypes: ('qr' | 'code128' | 'code39' | 'ean13' | 'ean8' | 'upc_a' | 'upc_e' | 'itf14')[] = [
  'qr', 'code128', 'code39', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14',
];

export default function ProductsScreen() {
  const { user, apiGet, apiPost, apiPatch, apiDelete, apiUpload } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'manager';
  const { data, busy, error, reload } = useRemote<Payload>('/products/');
  const products = listItems(data);
  const [catalogSearch, setCatalogSearch] = useState('');
  const filtered = products.filter(product =>
    `${product.name} ${product.sku || ''} ${product.category_name || ''}`
      .toLowerCase().includes(catalogSearch.trim().toLowerCase()),
  );
  const [categories, setCategories] = useState<Choice[]>([]);
  const [suppliers, setSuppliers] = useState<Choice[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(freshForm);
  const [pickedImage, setPickedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [choicesError, setChoicesError] = useState('');

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    Promise.all([
      apiGet<ChoicePayload>('/categories/'),
      apiGet<ChoicePayload>('/suppliers/'),
    ]).then(([c, suppliersResponse]) => {
      if (!active) return;
      setCategories(listItems(c));
      setSuppliers(listItems(suppliersResponse));
      setChoicesError('');
    }).catch(err => {
      if (active) setChoicesError(err instanceof Error ? err.message : 'Unable to load categories or suppliers.');
    });
    return () => { active = false; };
  }, [apiGet, canManage]);

  function openProductForm(product?: Product) {
    setEditing(product || null);
    setForm(product ? {
      name: product.name, sku: product.sku || '', description: product.description || '',
      category: product.category ? String(product.category) : '',
      supplier: product.supplier ? String(product.supplier) : '',
      price: String(product.price ?? ''), cost: String(product.cost ?? '0'),
      low_stock_threshold: String(product.low_stock_threshold ?? 10),
    } : { ...freshForm, category: categories.length ? String(categories[0].id) : '' });
    setPickedImage(null);
    setFormError('');
    setFormOpen(true);
  }

  function changeForm(key: keyof ProductForm, value: string) {
    setForm(previous => ({ ...previous, [key]: value }));
  }

  async function pickProductPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: false, quality: 0.8,
      });
      if (result.canceled || !result.assets.length) return;
      const asset = result.assets[0];
      const mime = asset.mimeType || 'image/jpeg';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
        setFormError('Choose a JPG, PNG or WebP image.');
        return;
      }
      if (asset.fileSize && asset.fileSize > 3 * 1024 * 1024) {
        setFormError('Maximum product image size is 3 MB.');
        return;
      }
      setPickedImage(asset);
      setFormError('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to select an image.');
    }
  }

  async function saveProduct() {
    if (!canManage || formBusy) return;
    const name = form.name.trim();
    const sku = form.sku.trim().toUpperCase();
    const price = Number(form.price);
    const cost = Number(form.cost);
    const threshold = Number(form.low_stock_threshold);
    if (!name || !sku || !form.category) {
      setFormError('Name, SKU and category are required.');
      return;
    }
    if (!form.price.trim() || !form.cost.trim() || !form.low_stock_threshold.trim() ||
        !Number.isFinite(price) || !Number.isFinite(cost) ||
        price < 0 || cost < 0 || price > 9999999999 || cost > 9999999999 ||
        !Number.isInteger(threshold) || threshold < 0) {
      setFormError('Enter valid nonnegative prices and a whole-number low-stock threshold.');
      return;
    }
    if (!categories.some(category => category.id === Number(form.category))) {
      setFormError('Select a valid category before saving.');
      return;
    }
    setFormBusy(true);
    setFormError('');
    try {
      const body = {
        name, sku, description: form.description.trim(),
        category: Number(form.category),
        supplier: form.supplier ? Number(form.supplier) : null,
        price: price.toFixed(2), cost: cost.toFixed(2),
        low_stock_threshold: threshold,
      };
      const saved = editing
        ? await apiPatch<Product>(`/products/${editing.id}/`, body)
        : await apiPost<Product>('/products/', body);

      let photoError = '';
      if (pickedImage) {
        const photo = new FormData();
        // Expo SDK 58 FormData requires a Blob/File, not a { uri, name, type } object.
        // expo-file-system File reads the selected file from its local URI.
        photo.append('image', new File(pickedImage.uri));
        try {
          await apiUpload<Product>(`/products/${saved.id}/image/`, photo);
        } catch (err) {
          photoError = err instanceof Error ? err.message : 'Image upload failed.';
        }
      }
      setFormOpen(false);
      await reload();
      Alert.alert(photoError ? 'Product saved; image not uploaded' : 'Success',
        photoError || (editing ? 'Product updated successfully.' : 'Product created with zero starting stock. Use Inventory → Stock In to receive units.'));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save product.');
    } finally {
      setFormBusy(false);
    }
  }

  function archiveProduct(product: Product) {
    if (!canManage) return;
    if ((product.stock || 0) > 0) {
      Alert.alert('Stock must be zero', 'Use Inventory → Stock Out before archiving this product.');
      return;
    }
    Alert.alert('Archive product?', `Hide ${product.name} from the active catalog? Order history remains intact.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => {
        void (async () => {
          try {
            await apiDelete<unknown>(`/products/${product.id}/`);
            await reload();
            Alert.alert('Archived', 'The product is no longer in the active catalog.');
          } catch (err) {
            Alert.alert('Unable to archive', err instanceof Error ? err.message : 'Try again.');
          }
        })();
      } },
    ]);
  }

  function removeProductPhoto() {
    if (!editing || !canManage || formBusy) return;
    const productId = editing.id;
    Alert.alert('Remove product photo?', 'The existing photo will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        void (async () => {
          setFormBusy(true);
          try {
            await apiDelete<Product>(`/products/${productId}/image/`);
            setEditing(current => current && current.id === productId ? { ...current, image_url: null } : current);
            setPickedImage(null);
            await reload();
          } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Unable to delete photo.');
          } finally {
            setFormBusy(false);
          }
        })();
      } },
    ]);
  }
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const scanLocked = useRef(false);
  const [inputSku, setInputSku] = useState('');
  const [searchedSku, setSearchedSku] = useState('');
  const [foundProduct, setFoundProduct] = useState<Product | null>(null);
  const [searchMessage, setSearchMessage] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');

  async function findExactSku(value: string) {
    const sku = value.trim();
    setFoundProduct(null);
    setSearchMessage('');
    setSearchedSku(sku);
    if (!sku) {
      setSearchMessage('Enter a product SKU or scan a barcode first.');
      return;
    }
    if (sku.length > 128) {
      setSearchMessage('The scanned code is too long for a product SKU.');
      return;
    }
    setSearchBusy(true);
    try {
      // The backend's search parameter matches name/SKU/description, so verify
      // the SKU exactly before displaying a result. This also handles pagination.
      const response = await apiGet<Payload>(`/products/?search=${encodeURIComponent(sku)}`);
      const exact = listItems(response).find(
        product => (product.sku || '').trim().toUpperCase() === sku.toUpperCase(),
      );
      if (exact) {
        setFoundProduct(exact);
      } else {
        setSearchMessage('No active Orevon product has this exact SKU. A retail barcode must be saved as the product SKU to match.');
      }
    } catch (err) {
      setSearchMessage(err instanceof Error ? err.message : 'Unable to search products.');
    } finally {
      setSearchBusy(false);
    }
  }

  async function openScanner() {
    setCameraMessage('');
    scanLocked.current = false;
    try {
      if (!permission?.granted) {
        const result = await requestPermission();
        if (!result.granted) {
          setCameraMessage('Camera permission is needed for scanning. Enable camera access in Android settings, or type a SKU below.');
          return;
        }
      }
      setScannerOpen(true);
    } catch {
      setCameraMessage('Could not start the camera. You can still search by typing the SKU.');
    }
  }

  function onScanned({ data: value }: BarcodeScanningResult) {
    if (scanLocked.current) return;
    scanLocked.current = true; // Camera events often fire multiple times for one code.
    setScannerOpen(false);
    const sku = value.trim();
    setInputSku(sku);
    void findExactSku(sku);
  }

  return (
    <Page title="Products" subtitle="Live catalog & barcode lookup" refreshing={busy} onRefresh={reload}>
      {canManage && (
        <Pressable accessibilityRole="button" style={styles.createButton} onPress={() => openProductForm()}>
          <Text style={styles.actionText}>+ Add product</Text>
        </Pressable>
      )}
      {canManage && (
        <Pressable accessibilityRole="button" style={styles.createButton} onPress={() => router.push('/bulk-products' as Href)}>
          <Text style={styles.actionText}>Import / Export CSV & Excel</Text>
        </Pressable>
      )}
      {!!choicesError && canManage && <Text style={styles.warning}>{choicesError}</Text>}
      <View style={styles.lookupCard}>
        <Text style={styles.lookupTitle}>Find a product</Text>
        <Text style={styles.helper}>Scan a QR or product barcode whose value matches the Orevon SKU, or type the SKU manually.</Text>
        <TextInput
          accessibilityLabel="Product SKU"
          value={inputSku}
          onChangeText={setInputSku}
          placeholder="Enter SKU (e.g. DEMO-001)"
          placeholderTextColor="#94A3B8"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={128}
          returnKeyType="search"
          onSubmitEditing={() => { if (!searchBusy) void findExactSku(inputSku); }}
          style={styles.input}
        />
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={searchBusy}
            onPress={() => { void findExactSku(inputSku); }}
            style={[styles.action, styles.searchAction, searchBusy && styles.disabled]}
          >
            <Text style={styles.actionText}>Find SKU</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { void openScanner(); }} style={[styles.action, styles.scanAction]}>
            <Text style={styles.actionText}>Scan barcode</Text>
          </Pressable>
        </View>
        {!!cameraMessage && <Text style={styles.warning}>{cameraMessage}</Text>}
        {searchBusy && <ActivityIndicator color="#059669" style={styles.resultProgress} />}
        {!!searchMessage && !searchBusy && (
          <Text accessibilityRole="alert" style={styles.warning}>{searchMessage}</Text>
        )}
        {!!foundProduct && !searchBusy && (
          <View style={styles.resultCard}>
            <Text style={styles.foundLabel}>PRODUCT FOUND</Text>
            <Text style={styles.foundTitle}>{foundProduct.name}</Text>
            <Text style={styles.metadata}>SKU: {foundProduct.sku}</Text>
            {!!foundProduct.category_name && <Text style={styles.metadata}>Category: {foundProduct.category_name}</Text>}
            {user?.role !== 'user' && typeof foundProduct.stock === 'number' && (
              <Text style={styles.stock}>{foundProduct.stock} units available</Text>
            )}
            <Text style={styles.resultHint}>Read-only lookup. Open Inventory to make an authorized stock adjustment.</Text>
          </View>
        )}
        {!!searchedSku && !foundProduct && !searchBusy && (
          <Text style={styles.searched}>Last lookup: {searchedSku}</Text>
        )}
      </View>

      <LoadNotice loading={busy && !data} error={error} onRetry={reload} empty={!!data && !products.length} />
      {!!products.length && !error && (
        <>
          <SectionTitle>Product catalog ({products.length})</SectionTitle>
          <TextInput
            accessibilityLabel="Search catalog"
            value={catalogSearch}
            onChangeText={setCatalogSearch}
            style={[styles.input, styles.catalogSearch]}
            placeholder="Filter visible products by name or SKU"
            placeholderTextColor="#94A3B8"
          />
          {!filtered.length && <Text style={styles.helper}>No matching products in the loaded catalog.</Text>}
          {filtered.map(product => (
            <View key={product.id} style={styles.productCard}>
              <View style={styles.productTop}>
                {product.image_url ? (
                  <Image source={{ uri: product.image_url }} style={styles.productImage} resizeMode="cover" />
                ) : (
                  <View style={styles.productImagePlaceholder}><Text style={styles.imagePlaceholderText}>▣</Text></View>
                )}
                <View style={styles.productCopy}>
                  <Text style={styles.productTitle}>{product.name}</Text>
                  <Text style={styles.metadata}>{product.sku || 'No SKU'}</Text>
                  <Text style={styles.metadata}>{product.category_name || 'Uncategorized'}</Text>
                  {product.price != null && <Text style={styles.productPrice}>₹{product.price}</Text>}
                  {user?.role !== 'user' && typeof product.stock === 'number' && (
                    <Text style={styles.stock}>{product.stock} units · {product.stock_status || 'stock'}</Text>
                  )}
                </View>
              </View>
              {canManage && (
                <View style={styles.productActions}>
                  <Pressable accessibilityRole="button" style={styles.editButton} onPress={() => openProductForm(product)}>
                    <Text style={styles.actionText}>Edit / Photo</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" style={styles.archiveButton} onPress={() => archiveProduct(product)}>
                    <Text style={styles.actionText}>Archive</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </>
      )}

      <Modal visible={formOpen} animationType="slide" onRequestClose={() => { if (!formBusy) setFormOpen(false); }}>
        <SafeAreaView style={styles.formScreen}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContent}>
            <Text style={styles.cameraTitle}>{editing ? 'Edit product' : 'Add product'}</Text>
            <Text style={styles.formHelp}>Only Admin and Manager can change catalog details. Stock is managed in Inventory.</Text>
            <FormField label="Name" value={form.name} onChangeText={v => changeForm('name', v)} />
            <FormField label="SKU" value={form.sku} onChangeText={v => changeForm('sku', v.toUpperCase())} />
            <FormField label="Selling price" value={form.price} onChangeText={v => changeForm('price', v)} numeric />
            <FormField label="Cost price" value={form.cost} onChangeText={v => changeForm('cost', v)} numeric />
            <FormField label="Low-stock threshold" value={form.low_stock_threshold} onChangeText={v => changeForm('low_stock_threshold', v)} numeric />
            <Text style={styles.fieldLabel}>Category (required)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.choiceList}>
              {categories.map(category => (
                <Pressable key={category.id} onPress={() => changeForm('category', String(category.id))}
                  style={[styles.choiceChip, form.category === String(category.id) && styles.chosenChip]}>
                  <Text style={[styles.choiceText, form.category === String(category.id) && styles.chosenText]}>{category.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {!categories.length && <Text style={styles.warning}>Create a category on the web first, or check the category API.</Text>}
            <Text style={styles.fieldLabel}>Supplier (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.choiceList}>
              <Pressable onPress={() => changeForm('supplier', '')}
                style={[styles.choiceChip, !form.supplier && styles.chosenChip]}>
                <Text style={[styles.choiceText, !form.supplier && styles.chosenText]}>None</Text>
              </Pressable>
              {suppliers.map(supplier => (
                <Pressable key={supplier.id} onPress={() => changeForm('supplier', String(supplier.id))}
                  style={[styles.choiceChip, form.supplier === String(supplier.id) && styles.chosenChip]}>
                  <Text style={[styles.choiceText, form.supplier === String(supplier.id) && styles.chosenText]}>{supplier.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <FormField label="Description" value={form.description} onChangeText={v => changeForm('description', v)} multiline />
            <Text style={styles.fieldLabel}>Product image (JPG, PNG or WebP; max 3 MB)</Text>
            {(pickedImage?.uri || editing?.image_url) && (
              <Image source={{ uri: pickedImage?.uri || editing?.image_url || '' }} style={styles.previewImage} resizeMode="contain" />
            )}
            <View style={styles.productActions}>
              <Pressable style={styles.editButton} disabled={formBusy} onPress={() => { void pickProductPhoto(); }}>
                <Text style={styles.actionText}>Choose photo</Text>
              </Pressable>
              {!!editing?.image_url && !pickedImage && (
                <Pressable style={styles.archiveButton} disabled={formBusy} onPress={removeProductPhoto}>
                  <Text style={styles.actionText}>Remove photo</Text>
                </Pressable>
              )}
            </View>
            {!!formError && <Text accessibilityRole="alert" style={styles.formError}>{formError}</Text>}
            <Pressable disabled={formBusy} style={[styles.createButton, formBusy && styles.disabled]} onPress={() => { void saveProduct(); }}>
              {formBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionText}>{editing ? 'Save product' : 'Create product'}</Text>}
            </Pressable>
            <Pressable disabled={formBusy} style={styles.closeFormButton} onPress={() => setFormOpen(false)}>
              <Text style={styles.closeFormText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={() => setScannerOpen(false)}
      >
        <SafeAreaView style={styles.cameraScreen}>
          <Text style={styles.cameraTitle}>Scan product barcode</Text>
          <Text style={styles.cameraHelp}>Hold a barcode or QR code steady inside the camera view.</Text>
          {scannerOpen && permission?.granted && (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes }}
              onBarcodeScanned={onScanned}
              onMountError={event => {
                setCameraMessage(event.message || 'Unable to open the camera.');
                setScannerOpen(false);
              }}
            />
          )}
          <Text style={styles.cameraHint}>The value must match an existing product SKU.</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.closeButton}
            onPress={() => setScannerOpen(false)}
          >
            <Text style={styles.actionText}>Close camera</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </Page>
  );
}

const styles = StyleSheet.create({
  lookupCard: { backgroundColor: '#FFFFFF', padding: 17, borderRadius: 16 },
  lookupTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800', marginBottom: 6 },
  helper: { color: '#64748B', fontSize: 12, lineHeight: 19, marginBottom: 14 },
  input: { color: '#0F172A', borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', borderRadius: 10, padding: 13, fontSize: 15 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 12 },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 7, borderRadius: 10 },
  searchAction: { backgroundColor: '#0F766E' },
  scanAction: { backgroundColor: '#059669' },
  disabled: { opacity: 0.55 },
  actionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  warning: { color: '#B45309', fontSize: 12, lineHeight: 18, marginTop: 12 },
  resultProgress: { marginTop: 12 },
  resultCard: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 12, padding: 14, marginTop: 15 },
  foundLabel: { color: '#047857', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  foundTitle: { color: '#064E3B', fontSize: 18, fontWeight: '800', marginTop: 6 },
  metadata: { color: '#065F46', fontSize: 13, marginTop: 5 },
  stock: { color: '#047857', fontSize: 15, fontWeight: '800', marginTop: 10 },
  resultHint: { color: '#64748B', fontSize: 11, marginTop: 10, lineHeight: 16 },
  searched: { color: '#64748B', fontSize: 11, marginTop: 12 },
  cameraScreen: { flex: 1, backgroundColor: '#071B17', padding: 18 },
  cameraTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 10 },
  cameraHelp: { color: '#D1FAE5', fontSize: 13, marginTop: 10, marginBottom: 18 },
  camera: { flex: 1, minHeight: 260, borderRadius: 16, overflow: 'hidden' },
  cameraHint: { color: '#D1FAE5', textAlign: 'center', fontSize: 12, marginVertical: 15 },
  closeButton: { backgroundColor: '#334155', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginBottom: 4 },
  createButton: { backgroundColor: '#059669', alignItems: 'center', paddingVertical: 15, borderRadius: 12, marginBottom: 15 },
  catalogSearch: { marginBottom: 13 },
  productCard: { backgroundColor: '#FFFFFF', borderRadius: 15, padding: 14, marginBottom: 10 },
  productTop: { flexDirection: 'row', gap: 12 },
  productCopy: { flex: 1 },
  productImage: { width: 77, height: 81, borderRadius: 10, backgroundColor: '#F1F5F9' },
  productImagePlaceholder: { width: 77, height: 81, borderRadius: 10, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  imagePlaceholderText: { color: '#64748B', fontSize: 26 },
  productTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  productPrice: { color: '#047857', fontWeight: '700', marginTop: 6 },
  productActions: { flexDirection: 'row', gap: 9, marginTop: 12 },
  editButton: { flex: 1, backgroundColor: '#0F766E', borderRadius: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  archiveButton: { flex: 1, backgroundColor: '#B91C1C', borderRadius: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  formScreen: { flex: 1, backgroundColor: '#F1F5F9' },
  formContent: { padding: 20, paddingBottom: 40 },
  formHelp: { color: '#64748B', fontSize: 12, marginTop: 7, marginBottom: 22, lineHeight: 18 },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { color: '#0F172A', fontWeight: '700', fontSize: 13, marginBottom: 7 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  choiceList: { flexGrow: 0, marginBottom: 18 },
  choiceChip: { backgroundColor: '#FFFFFF', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 18, marginRight: 8, borderWidth: 1, borderColor: '#CBD5E1' },
  chosenChip: { backgroundColor: '#D1FAE5', borderColor: '#059669' },
  choiceText: { color: '#334155', fontWeight: '600', fontSize: 12 },
  chosenText: { color: '#047857' },
  previewImage: { width: 160, height: 140, borderRadius: 12, backgroundColor: '#FFFFFF', marginBottom: 10 },
  formError: { color: '#B91C1C', marginVertical: 14, fontSize: 13 },
  closeFormButton: { paddingVertical: 14, alignItems: 'center' },
  closeFormText: { color: '#334155', fontWeight: '700' },
});
