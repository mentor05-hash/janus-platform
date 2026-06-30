import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Teacher } from '../api';
import { C, R, SP, ui, gradeColor } from '../theme';

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
    <View style={ui.screen}>
      <Text style={ui.h}>선생님 찾기</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <FlatList
        data={teachers}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={[ui.card, styles.card]} onPress={() => onPick(item)} activeOpacity={0.7}>
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(item.name ?? '?').slice(0, 1)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.name}</Text>
                  <View style={[styles.grade, { backgroundColor: gradeColor(item.grade) }]}>
                    <Text style={styles.gradeText}>{item.grade}</Text>
                  </View>
                </View>
                <Text style={ui.sub}>
                  {item.subjects.join(', ')} · {item.category ?? '-'} · 평점 {item.rating ?? 0}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={!error ? <Text style={ui.sub}>선생님이 없습니다.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: R.md, backgroundColor: C.teal100, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.teal, fontWeight: '800', fontSize: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  name: { fontSize: 16, fontWeight: '700', color: C.ink },
  grade: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: R.md },
  gradeText: { color: C.white, fontWeight: '800', fontSize: 11 },
});
