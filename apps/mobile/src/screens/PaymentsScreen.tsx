import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, PaymentRequest } from '../api';

export function PaymentsScreen() {
  const [rows, setRows] = useState<PaymentRequest[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await api.get<PaymentRequest[]>('/payment-requests'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function pay(id: string) {
    try {
      await api.patch(`/payment-requests/${id}/respond`, { action: 'pay' });
      Alert.alert('결제 완료', '자녀 크레딧이 충전되었습니다.');
      await load();
    } catch (e) {
      Alert.alert('결제 실패', e instanceof ApiError ? e.message : '오류');
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.h}>결제요청 (대납)</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.amount}>{item.needed_credits.toLocaleString()} 크레딧</Text>
              <Text style={[styles.badge, item.status === 'open' ? styles.open : styles.muted]}>{item.status}</Text>
            </View>
            {item.status === 'open' && (
              <TouchableOpacity style={styles.btn} onPress={() => pay(item.id)}>
                <Text style={styles.btnText}>대납 결제</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={!error ? <Text style={styles.sub}>결제요청이 없습니다.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  h: { fontSize: 18, fontWeight: '700', color: '#0E5C7C', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e3e8eb', padding: 14, marginBottom: 10 },
  amount: { fontSize: 16, fontWeight: '700' },
  badge: { fontSize: 12, fontWeight: '700', color: '#fff', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  open: { backgroundColor: '#ea7317' },
  muted: { backgroundColor: '#8a979e' },
  btn: { backgroundColor: '#0E5C7C', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#fff', fontWeight: '700' },
  sub: { color: '#5b6b73', fontSize: 13 },
  error: { color: '#d23b3b' },
});
