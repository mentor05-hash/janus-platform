import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Child, Note, PaymentRequest } from '../api';
import { C, R, SP, ui } from '../theme';

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
    <View style={ui.screen}>
      <Text style={ui.h}>연결 자녀</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <FlatList
        data={children}
        keyExtractor={(c) => c.linkId}
        renderItem={({ item }) => {
          const s = summary[item.studentId];
          const alert = (s?.pending ?? 0) > 0;
          return (
            <TouchableOpacity style={[ui.card, styles.card]} onPress={() => onPick(item)} activeOpacity={0.7}>
              <View style={styles.row}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{(item.name ?? '자').slice(0, 1)}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name ?? item.studentId}</Text>
                  <Text style={ui.sub}>{item.relation ?? '자녀'} · 상담기록 보기 ›</Text>
                </View>
              </View>
              <View style={styles.badges}>
                <Text style={styles.chip}>상담기록 {s?.notes ?? '–'}</Text>
                <Text style={[styles.chip, alert ? styles.chipAlert : styles.chipMuted]}>미결제 {s?.pending ?? 0}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={ui.sub}>연결된 자녀가 없습니다.</Text>}
      />
      <Text style={ui.label}>자녀 연결 신청 (학생 아이디)</Text>
      <View style={{ flexDirection: 'row', gap: SP.sm }}>
        <TextInput style={[ui.input, { flex: 1 }]} value={loginId} onChangeText={setLoginId} autoCapitalize="none" placeholder="student01" placeholderTextColor={C.caption} />
        <TouchableOpacity style={styles.linkBtn} onPress={link}>
          <Text style={ui.btnText}>신청</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: R.md, backgroundColor: C.teal100, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.teal, fontWeight: '800', fontSize: 16 },
  name: { fontSize: 16, fontWeight: '700', color: C.ink },
  badges: { flexDirection: 'row', gap: SP.sm, marginTop: 10 },
  chip: { fontSize: 12, fontWeight: '600', color: C.teal, backgroundColor: C.teal50, borderRadius: R.pill, paddingHorizontal: 11, paddingVertical: 4, overflow: 'hidden' },
  chipMuted: { color: C.mutedChip, backgroundColor: C.mutedChipBg },
  chipAlert: { color: C.danger, backgroundColor: C.dangerBg },
  linkBtn: { backgroundColor: C.teal, borderRadius: R.md, paddingHorizontal: 18, justifyContent: 'center' },
});
