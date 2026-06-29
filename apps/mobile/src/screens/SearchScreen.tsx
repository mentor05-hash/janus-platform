import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Teacher } from '../api';

export function SearchScreen({ onPick }: { onPick: (t: Teacher) => void }) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<{ data?: Teacher[] } | Teacher[]>('/teachers')
      .then((r) => setTeachers(Array.isArray(r) ? r : (r.data ?? [])))
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, []);

  return (
    <View style={styles.wrap}>
      <Text style={styles.h}>선생님 찾기</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={teachers}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => onPick(item)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.name}>{item.name}</Text>
              <View style={[styles.grade, item.grade === 'S' ? styles.gradeS : item.grade === 'A' ? styles.gradeA : styles.gradeB]}>
                <Text style={styles.gradeText}>{item.grade}</Text>
              </View>
            </View>
            <Text style={styles.sub}>
              {item.subjects.join(', ')} · {item.category ?? '-'} · 평점 {item.rating ?? 0}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={!error ? <Text style={styles.sub}>선생님이 없습니다.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  h: { fontSize: 18, fontWeight: '700', color: '#0E5C7C', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e3e8eb', padding: 14, marginBottom: 10 },
  name: { fontSize: 16, fontWeight: '700' },
  sub: { color: '#5b6b73', fontSize: 13, marginTop: 4 },
  grade: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  gradeS: { backgroundColor: '#d4af37' },
  gradeA: { backgroundColor: '#0E5C7C' },
  gradeB: { backgroundColor: '#8a979e' },
  gradeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  error: { color: '#d23b3b' },
});
