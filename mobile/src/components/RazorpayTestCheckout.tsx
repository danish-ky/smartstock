/**
 * Expo Go-compatible Razorpay TEST checkout.
 *
 * This is the Standard Checkout web flow, not Razorpay's native Android SDK.
 * Never include a Razorpay key secret, JWT token or card details in the WebView.
 * The host must verify every reported success with Django before recording money.
 */
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

export type RazorpayTestSession = {
  orderId: number;
  orderLabel: string;
  key_id: string;
  razorpay_order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
};

export type RazorpayCheckoutEvent =
  | { type: 'success'; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
  | { type: 'dismiss' }
  | { type: 'failed'; message?: string }
  | { type: 'error'; message?: string };

/** Ensure untrusted descriptive fields cannot break out of a script block. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function isValidTestSession(session: RazorpayTestSession): boolean {
  return session.key_id.startsWith('rzp_test_') &&
    /^order_[a-zA-Z0-9_-]+$/.test(session.razorpay_order_id) &&
    Number.isSafeInteger(session.amount) && session.amount > 0 &&
    session.currency === 'INR';
}

function checkoutHtml(session: RazorpayTestSession): string {
  // Only public checkout fields enter the HTML; authentication stays in native memory.
  const opts = scriptJson({
    key: session.key_id,
    amount: session.amount,
    currency: session.currency,
    name: session.name,
    description: session.description,
    order_id: session.razorpay_order_id,
    theme: { color: '#047857' },
    retry: { enabled: false },
  });
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>body{margin:0;background:#f1f5f9;color:#0f172a;font:15px system-ui,sans-serif;text-align:center;padding:30px 14px;}p{color:#475569}button{border:0;background:#047857;color:white;font-weight:bold;padding:14px 20px;border-radius:12px}</style>
</head><body>
<h3>Opening Razorpay TEST checkout…</h3>
<p>Please use Razorpay test payment details only.</p>
<button id="retry" style="display:none" onclick="start()">Open test checkout</button>
<script>
(function(){
  var options = ${opts};
  var started = false;
  function send(data) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(data)); } catch(e) {}
  }
  window.start = function() {
    if (!window.Razorpay) { send({type:'error',message:'Razorpay checkout could not load.'}); return; }
    if (started) return;
    started = true;
    var checkout;
    try {
      checkout = new window.Razorpay(Object.assign({},options, {
        handler: function(response) {
          send({type:'success',
            razorpay_order_id: String(response.razorpay_order_id || ''),
            razorpay_payment_id: String(response.razorpay_payment_id || ''),
            razorpay_signature: String(response.razorpay_signature || '')});
        },
        modal: {ondismiss: function(){ send({type:'dismiss'}); }}
      }));
      checkout.on('payment.failed',function(){
        send({type:'failed',message:'Razorpay reported a failed payment. No payment has been recorded.'});
      });
      checkout.open();
    } catch(e) {
      started = false;
      document.getElementById('retry').style.display='inline-block';
      send({type:'error',message:'Unable to open Razorpay checkout.'});
    }
  };
  var script=document.createElement('script');
  script.src='https://checkout.razorpay.com/v1/checkout.js';
  script.onload=start;
  script.onerror=function(){
    document.getElementById('retry').style.display='inline-block';
    send({type:'error',message:'Cannot load Razorpay checkout. Check internet access.'});
  };
  document.head.appendChild(script);
})();
</script></body></html>`;
}

export default function RazorpayTestCheckout({
  session,
  verifying,
  onClose,
  onMessage,
}: {
  session: RazorpayTestSession | null;
  verifying: boolean;
  onClose: () => void;
  onMessage: (message: RazorpayCheckoutEvent) => void;
}) {
  const html = useMemo(() => session ? checkoutHtml(session) : '', [session]);
  const handleMessage = (event: WebViewMessageEvent) => {
    if (verifying || !session) return;
    let parsed: unknown;
    try { parsed = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (!parsed || typeof parsed !== 'object') return;
    const payload = parsed as Record<string, unknown>;
    if (payload.type === 'success') {
      if (typeof payload.razorpay_order_id === 'string' &&
        typeof payload.razorpay_payment_id === 'string' &&
        typeof payload.razorpay_signature === 'string') {
        onMessage({type:'success',
          razorpay_order_id: payload.razorpay_order_id,
          razorpay_payment_id: payload.razorpay_payment_id,
          razorpay_signature: payload.razorpay_signature});
      }
    } else if (payload.type === 'dismiss') onMessage({type:'dismiss'});
    else if (payload.type === 'failed' || payload.type === 'error') {
      onMessage({type:payload.type,
        message: typeof payload.message === 'string' ? payload.message.slice(0,240) : undefined});
    }
  };
  return (
    <Modal visible={!!session} animationType="slide" onRequestClose={() => { if (!verifying) onClose(); }}>
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Razorpay TEST checkout</Text>
            <Text style={styles.subtitle}>{session?.orderLabel || 'Orevon order'}</Text>
          </View>
          <Pressable accessibilityRole="button" disabled={verifying} onPress={onClose}
            style={[styles.closeButton, verifying && styles.disabled]}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>

        {session && <WebView
          key={session.razorpay_order_id}
          source={{html, baseUrl:'https://checkout.razorpay.com/'}}
          originWhitelist={['https://*', 'about:blank']}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url.startsWith('https://')}
          onMessage={handleMessage}
          onError={() => { if (!verifying) onMessage({type:'error',message:'Checkout could not connect. Please check your internet connection.'}); }}
          startInLoadingState
          renderLoading={() => <ActivityIndicator color="#047857" style={styles.loader}/>}
          style={styles.webview}
        />}
        {verifying && <View style={styles.verifying}>
          <ActivityIndicator color="#047857" />
          <Text style={styles.verifyText}>Verifying captured payment with the server…</Text>
        </View>}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:'#F1F5F9'},
  header:{paddingHorizontal:17,paddingTop:14,paddingBottom:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  headerText:{flex:1},title:{fontSize:18,fontWeight:'800',color:'#0F172A'},
  subtitle:{fontSize:12,color:'#64748B',marginTop:3},
  closeButton:{padding:10,borderRadius:10,backgroundColor:'#E2E8F0'},
  closeText:{fontWeight:'800',color:'#334155'},disabled:{opacity:0.45},
  warning:{marginHorizontal:17,marginBottom:9,padding:11,color:'#92400E',backgroundColor:'#FFFBEB',fontSize:12,lineHeight:18,borderRadius:9},
  webview:{flex:1,backgroundColor:'#F1F5F9'},loader:{flex:1},
  verifying:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(255,255,255,0.96)',justifyContent:'center',alignItems:'center',gap:16,padding:20},
  verifyText:{color:'#0F172A',fontWeight:'700',textAlign:'center'},
});
