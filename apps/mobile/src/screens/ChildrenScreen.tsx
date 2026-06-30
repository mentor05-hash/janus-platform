import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Child, Note, PaymentRequest } from '../api';

type Summary = { notes: number; pending: number };

export function ChildrenScreen({ onPick }: { onPick: (c: Child) => void }) {
  const [children, setChildren] = useState<Child[]>([]);
  const [summary, setSummary] = useState<Record<string, Summary>>({});
  const [loginId, setLoginId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const kids = await api.get<Child[]>('/guardian/children');
      setChildren(kids);
      setError('');
      // 자녀별 집계: 상담기록 수 + 미결 결제요청 수
      const pays = await api.get<PaymentRequest[]>('/payment-requests').catch(() => [] as PaymentRequest[]);
      const sum: Record<string, Summary> = {};
      await Promise.all(
        kids.map(async (c) => {
          const notes = await api.get<Note[]>(`/students/${c.studentId}/notes`).catch(() => [] as Note[]);
          const pending = pays.filter((p) => (p as any).student_id === c.studentId && (p as any).status === 'open').length;
          sum[c.studentId] = { notes: notes.length, pending };
        }),
      );
      setSummary(sum);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function link() {
    if (!loginId) return;
    try {
      await api.post('/guardian/links', { studentLoginId: loginId });
      Alert.alert('신청 완료', '자녀(학생) 승인 후 연결됩니다.');
      setLoginId('');
      await load();
    } catch (e) {
      Alert.alert('연결 실패', e instanceof ApiError ? e.message : '오류');
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.h}>연결 자녀</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={children}
        keyExtractor={(c) => c.linkId}
        renderItem={({ item }) => {
          const s = summary[item.studentId];
          return (
            <TouchableOpacity style={styles.card} onPress={() => onPick(item)}>
              <Text style={styles.name}>{item.name ?? item.studentId}</Text>
              <View style={styles.badges}>
                <Text style={styles.badge}>상담기록 {s?.notes ?? '–'}</Text>
                <Text style={[styles.badge, (s?.pending ?? 0) > 0 ? styles.badgeAlert : null]}>
                  미결제 {s?.pending ?? 0}
                </Text>
              </View>
              <Text style={styles.sub}>{item.relation ?? '자녀'} · 상담기록 보기 ›</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.sub}>연결된 자녀가 없습니다.</Text>}
      />
      <Text style={styles.label}>자녀 연결 신청 (학생 아이디)</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput style={[styles.input, { flex: 1 }]} value={loginId} onChangeText={setLoginId} autoCapitalize="none" placeholder="student01" />
        <TouchableOpacity style={styles.btn} onPress={link}>
          <Text style={styles.btnText}>신청</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  h: { fontSize: 18, fontWeight: '700', color: '#0E5C7C', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e3e8eb', padding: 14, marginBottom: 10 },
  name: { fontSize: 16, fontWeight: '700' },
  badges: { flexDirection: 'row', gap: 8, marginTop: 6 },
  badge: { fontSize: 12, color: '#0E5C7C', backgroundColor: '#e6f0f4', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  badgeAlert: { color: '#b9521a', backgroundColor: '#fbe9dd' },
  sub: { color: '#5b6b73', fontSize: 13, marginTop: 4 },
  label: { color: '#5b6b73', fontSize: 13, marginTop: 16, marginBottom: 4 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e8eb', borderRadius: 8, padding: 10 },
  btn: { backgroundColor: '#0E5C7C', borderRadius: 8, paddingHorizontal: 18, justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  error: { color: '#d23b3b' },
});
