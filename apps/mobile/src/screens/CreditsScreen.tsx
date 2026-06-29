import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, CreditAccount } from '../api';

export function CreditsScreen() {
  const [acct, setAcct] = useState<CreditAccount | null>(null);
  const [error, setError] = useState('');

  const load = () =>
    api
      .get<CreditAccount>('/credits/account')
      .then(setAcct)
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));

  useEffect(() => {
    load();
  }, []);

  async function charge() {
    try {
      await api.post('/payments/charge', { amount: 50000 });
      Alert.alert('충전 완료', '50,000 크레딧이 충전되었습니다.');
      load();
    } catch (e) {
      Alert.alert('충전 실패', e instanceof ApiError ? e.message : '오류');
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.h}>크레딧</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {acct && (
        <View style={styles.card}>
          <Text style={styles.total}>{acct.total.toLocaleString()} 크레딧</Text>
          <Text style={styles.sub}>
            구매 {acct.purchasedBalance.toLocaleString()} · 주간부여 {acct.grantedBalance.toLocaleString()}
          </Text>
        </View>
      )}
      <TouchableOpacity style={styles.btn} onPress={charge}>
        <Text style={styles.btnText}>50,000 충전 (모의 PG)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  h: { fontSize: 18, fontWeight: '700', color: '#0E5C7C', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e3e8eb', padding: 20 },
  total: { fontSize: 28, fontWeight: '700', color: '#0E5C7C' },
  sub: { color: '#5b6b73', marginTop: 6 },
  btn: { backgroundColor: '#0E5C7C', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20 },
  btnText: { color: '#fff', fontWeight: '700' },
  error: { color: '#d23b3b' },
});
