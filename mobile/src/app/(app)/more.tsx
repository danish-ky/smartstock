import { useState } from 'react';
import { router, type Href } from 'expo-router';
import { Alert } from 'react-native';
import OrevonAccountView, { type OrevonAccountSection } from '../../components/account/OrevonAccountView';
import { useAuth } from '../../context/AuthContext';

/**
 * Stage 5.3: presentation is delegated to OrevonAccountView.
 * Existing role checks, route destinations, and sign-out behavior are preserved.
 */
export default function AccountScreen() {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const canOperate = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'staff';
  const canManage = user?.role === 'admin' || user?.role === 'manager';
  const isAdmin = user?.role === 'admin';

  async function logout() {
    setBusy(true);
    try {
      const revoked = await signOut();
      if (!revoked) Alert.alert('Signed out on this device', 'Server-side token revocation could not be confirmed.');
    } catch (e) {
      Alert.alert('Sign-out failed', e instanceof Error ? e.message : 'Could not clear stored credentials.');
    } finally {
      setBusy(false);
    }
  }

  // Keep the same permission gates and onPress destinations as the original Account screen.
  const sections: OrevonAccountSection[] = [];
  if (canOperate) {
    sections.push({
      key: 'management',
      title: 'Management',
      actions: [
        {
          key: 'purchase-orders',
          title: 'Purchase orders',
          description: 'Supplier orders and received stock',
          onPress: () => router.push('/purchase-orders' as Href),
        },
        {
          key: 'categories',
          title: 'Categories',
          description: 'Manage product categories',
          onPress: () => router.push('/management?kind=categories' as Href),
        },
        {
          key: 'suppliers',
          title: 'Suppliers',
          description: 'View and manage supplier contacts',
          onPress: () => router.push('/management?kind=suppliers' as Href),
        },
        {
          key: 'customers',
          title: 'Customers',
          description: 'View and manage customer contacts',
          onPress: () => router.push('/management?kind=customers' as Href),
        },
      ],
    });
  }
  if (canManage) {
    sections.push(
      {
        key: 'bulk-catalog',
        title: 'Bulk catalog tools',
        actions: [
          {
            key: 'bulk-products',
            title: 'Import / Export products',
            description: 'CSV and Excel · preview & download',
            onPress: () => router.push('/bulk-products' as Href),
          },
        ],
      },
      {
        key: 'analytics',
        title: 'Analytics',
        actions: [
          {
            key: 'reports',
            title: 'Reports & Analytics',
            description: 'Sales, top products and stock by category',
            onPress: () => router.push('/reports' as Href),
          },
        ],
      },
    );
  }
  if (isAdmin) {
    sections.push({
      key: 'administration',
      title: 'Administration',
      actions: [
        {
          key: 'team',
          title: 'Team & Access',
          description: 'Manage login accounts, roles and permissions',
          onPress: () => router.push('/team' as Href),
        },
      ],
    });
  }

  return (
    <OrevonAccountView
      displayName={user?.full_name || user?.name || user?.username || 'Orevon User'}
      email={user?.email || user?.username || ''}
      role={user?.role || 'User'}
      subtitle="Orevon mobile profile"
      sections={sections}
      onSignOut={logout}
      signOutDisabled={busy}
      signOutLoading={busy}
    />
  );
}
