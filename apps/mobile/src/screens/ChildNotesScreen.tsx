import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Child, Note } from '../api';
import { C, SP, ui } from '../theme';

export function ChildNotesScreen({ child, onBack }: { child: Child; onBack: () => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Note[]>(`/students/${child.studentId}/notes`)
      .then(setNotes)
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [child.studentId]);

  return (
    <View style={ui.screen}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← 자녀 목록</Text>
      </TouchableOpacity>
      <Text style={ui.h}>{child.name ?? '자녀'} 상담 기록</Text>
      <Text style={ui.sub}>공개된 기록만 표시됩니다(내부 메모 제외).</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <FlatList
        style={{ marginTop: SP.md }}
        data={notes}
        keyExtractor={(n) => n.bookingId}
        renderItem={({ item }) => (
          <View style={[ui.card, styles.card]}>
            <Text style={styles.name}>{item.coreSummary ?? '(요약 없음)'}</Text>
            {item.homework ? <Text style={styles.line}><Text style={styles.k}>숙제 </Text>{item.homework}</Text> : null}
            {item.futureDir ? <Text style={styles.line}><Text style={styles.k}>향후 </Text>{item.futureDir}</Text> : null}
          </View>
        )}
        ListEmptyComponent={!error ? <Text style={ui.sub}>공개된 기록이 없습니다.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: C.teal, marginBottom: SP.sm, fontWeight: '600' },
  card: { padding: 14, marginBottom: 10 },
  name: { fontSize: 15, fontWeight: '700', color: C.ink },
  line: { color: C.body, fontSize: 13, marginTop: 6 },
  k: { color: C.muted, fontWeight: '700' },
});
