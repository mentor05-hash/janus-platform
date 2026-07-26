import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { SP, useTheme, useUI } from '../theme';
import { ScoreTrendView, type Trend } from './ScoreTrendView';

/** 학생 본인 성적·배치 추이(정책 노출 시). */
export function ScoresScreen({ onBack, showPlacement }: { onBack: () => void; showPlacement: boolean }) {
  const { C } = useTheme();
  const ui = useUI();
  const [trend, setTrend] = useState<Trend | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Trend>('/me/scores/trend').then(setTrend).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, []);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: C.teal, fontWeight: '700', marginBottom: 8 }}>‹ 뒤로</Text></TouchableOpacity>
      <Text style={ui.h}>내 성적·배치</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>회차별 성적 추이와 예상 대학·학과 라인 변화를 확인하세요.</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {trend === null ? <Text style={ui.sub}>불러오는 중…</Text> : (
        <View style={[ui.card]}>
          <ScoreTrendView trend={trend} showPlacement={showPlacement} />
        </View>
      )}
    </ScrollView>
  );
}
