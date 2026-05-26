// Payout setup — opens Stripe Connect onboarding in a browser.
// No IAP. HMU First subscription also opens the web checkout.
import { useAuth } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { apiClient } from '@/lib/api';

WebBrowser.maybeCompleteAuthSession();

export default function PayoutSetup() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<string | null>(null);

  useEffect(() => {
    async function checkStatus() {
      try {
        const token = await getToken();
        const profile = await apiClient<{ stripeAccountId?: string; payoutEnabled?: boolean }>(
          '/users/profile', token,
        );
        if (profile.stripeAccountId) {
          setStripeStatus(profile.payoutEnabled ? 'active' : 'pending');
        } else {
          setStripeStatus('none');
        }
      } catch { setStripeStatus('none'); }
    }
    void checkStatus();
  }, [getToken]);

  async function openStripeOnboarding() {
    setLoading(true);
    try {
      const token = await getToken();
      const { url } = await apiClient<{ url: string }>('/driver/stripe/onboarding-link', token, { method: 'POST' });
      await WebBrowser.openBrowserAsync(url);
    } catch (e: any) {
      // no-op — user closed browser
    } finally {
      setLoading(false);
    }
  }

  async function openHmuFirstUpgrade() {
    await WebBrowser.openBrowserAsync('https://atl.hmucashride.com/driver/upgrade');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Payout Setup</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Stripe Connect</Text>
        {stripeStatus === null && <ActivityIndicator color="#00E676" style={{ marginTop: 8 }} />}
        {stripeStatus === 'active' && <Text style={styles.activeText}>✓ Payout account active</Text>}
        {stripeStatus === 'pending' && <Text style={styles.pendingText}>⏳ Account under review</Text>}
        {stripeStatus === 'none' && (
          <>
            <Text style={styles.cardBody}>Connect your bank or debit card to receive ride payouts.</Text>
            <TouchableOpacity style={styles.btn} onPress={openStripeOnboarding} disabled={loading}>
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Set Up Payouts</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>HMU First — $9.99/mo</Text>
        <Text style={styles.cardBody}>Lower daily fee cap ($25), instant payouts. Sign up on our website.</Text>
        <TouchableOpacity style={styles.btnGold} onPress={openHmuFirstUpgrade}>
          <Text style={styles.btnGoldText}>Upgrade on Web →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808', padding: 16, paddingTop: 24 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 20 },
  card: { backgroundColor: '#18181b', borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#27272a' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 8 },
  cardBody: { fontSize: 14, color: '#888', marginBottom: 16, lineHeight: 20 },
  activeText: { fontSize: 15, color: '#00E676', fontWeight: '700', marginTop: 4 },
  pendingText: { fontSize: 15, color: '#FFB300', fontWeight: '700', marginTop: 4 },
  btn: { backgroundColor: '#00E676', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#000', fontWeight: '700', fontSize: 15 },
  btnGold: { backgroundColor: '#18181b', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#FFB300' },
  btnGoldText: { color: '#FFB300', fontWeight: '700', fontSize: 15 },
});
