import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, PaymentRequest } from '../api';
import { C, R, ui } from '../theme';

const STATUS: Record<string, { fg: string; bg: string; label: string }> = {
  open: { fg: C.confirmed, bg: C.confirmedBg, label: '대기' },
  done: { fg: C.done, bg: C.doneBg, label: '완료' },
  rejected: { fg: C.mutedChip, bg: C.mutedChipBg, label: '거절' },
  expired: { fg: C.mutedChip, bg: C.mutedChipBg, label: '만료' },
};

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
    <View style={ui.screen}>
      <Text style={ui.h}>결제요청 (대납)</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => {
          const st = STATUS[item.status] ?? STATUS.expired;
          return (
            <View style={[ui.card, styles.card]}>
              <View style={styles.head}>
                <Text style={styles.amount}>{item.needed_credits.toLocaleString()} 크레딧</Text>
                <Text style={[styles.chip, { color: st.fg, backgroundColor: st.bg }]}>{st.label}</Text>
              </View>
              {item.status === 'open' && (
                <TouchableOpacity style={styles.btn} onPress={() => pay(item.id)}>
                  <Text style={ui.btnText}>대납 결제</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={!error ? <Text style={ui.sub}>결제요청이 없습니다.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, marginBottom: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: 17, fontWeight: '800', color: C.ink },
  chip: { fontSize: 12, fontWeight: '700', borderRadius: R.pill, paddingHorizontal: 11, paddingVertical: 4, overflow: 'hidden' },
  btn: { backgroundColor: C.teal, borderRadius: 11, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
});
