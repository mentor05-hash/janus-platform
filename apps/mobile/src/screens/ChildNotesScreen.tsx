import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Child, Note } from '../api';

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
    <View style={styles.wrap}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← 자녀 목록</Text>
      </TouchableOpacity>
      <Text style={styles.h}>{child.name ?? '자녀'} 상담 기록</Text>
      <Text style={styles.sub}>공개된 기록만 표시됩니다(내부 메모 제외).</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={notes}
        keyExtractor={(n) => n.bookingId}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.coreSummary ?? '(요약 없음)'}</Text>
            {item.homework ? <Text style={styles.sub}>숙제: {item.homework}</Text> : null}
            {item.futureDir ? <Text style={styles.sub}>향후: {item.futureDir}</Text> : null}
          </View>
        )}
        ListEmptyComponent={!error ? <Text style={styles.sub}>공개된 기록이 없습니다.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  back: { color: '#0E5C7C', marginBottom: 8 },
  h: { fontSize: 18, fontWeight: '700', color: '#0E5C7C' },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e3e8eb', padding: 14, marginTop: 10 },
  name: { fontSize: 15, fontWeight: '700' },
  sub: { color: '#5b6b73', fontSize: 13, marginTop: 4 },
  error: { color: '#d23b3b' },
});
