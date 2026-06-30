import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, CreditAccount } from '../api';
import { C, SP, ui } from '../theme';

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
    <View style={ui.screen}>
      <Text style={ui.h}>크레딧</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {acct && (
        <View style={ui.card}>
          <Text style={styles.cap}>보유 크레딧</Text>
          <Text style={styles.total}>{acct.total.toLocaleString()}</Text>
          <View style={styles.split}>
            <View style={styles.splitItem}>
              <Text style={styles.splitNum}>{acct.purchasedBalance.toLocaleString()}</Text>
              <Text style={styles.splitLabel}>구매</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.splitItem}>
              <Text style={styles.splitNum}>{acct.grantedBalance.toLocaleString()}</Text>
              <Text style={styles.splitLabel}>주간부여</Text>
            </View>
          </View>
        </View>
      )}
      <TouchableOpacity style={[ui.btn, { marginTop: SP.xl }]} onPress={charge}>
        <Text style={ui.btnText}>50,000 충전 (모의 PG)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  cap: { color: C.caption, fontSize: 12, fontWeight: '600' },
  total: { fontSize: 32, fontWeight: '800', color: C.teal, marginTop: 2, letterSpacing: -0.5 },
  split: { flexDirection: 'row', alignItems: 'center', marginTop: SP.lg, borderTopWidth: 1, borderTopColor: C.lineSoft, paddingTop: SP.md },
  splitItem: { flex: 1, alignItems: 'center' },
  splitNum: { fontSize: 18, fontWeight: '800', color: C.ink },
  splitLabel: { fontSize: 12, color: C.muted, marginTop: 2 },
  divider: { width: 1, height: 32, backgroundColor: C.lineSoft },
});
