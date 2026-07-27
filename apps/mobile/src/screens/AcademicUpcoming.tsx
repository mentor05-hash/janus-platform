import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { R, useTheme, useUI, type Palette } from '../theme';
import { acaMeta, acaDateLabel, acaDdayLabel, acaDday, type AcademicEvent } from '../lib/academic';

/** 다가오는 학사일정 위젯(모바일) — 오늘 이후 N건 D-day. 학생 홈·학부모 홈 공용. */
export function AcademicUpcoming({ limit = 5, title = '다가오는 학사일정' }: { limit?: number; title?: string }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);
  const [events, setEvents] = useState<AcademicEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    api.get<AcademicEvent[]>(`/academic-events?from=${today}`).then((r) => setEvents(Array.isArray(r) ? r : [])).catch(() => { setFailed(true); setEvents([]); });
  }, []);

  const upcoming = (events ?? []).filter((e) => acaDday(e.end_date ?? e.start_date) >= 0).slice(0, limit);

  return (
    <View style={[ui.card, { marginTop: 12 }]}>
      <Text style={s.cardT}>{title}</Text>
      {events === null ? <Text style={ui.sub}>불러오는 중…</Text> : failed ? (
        <Text style={ui.sub}>학사일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</Text>
      ) : upcoming.length === 0 ? (
        <Text style={ui.sub}>예정된 학사일정이 없어요.</Text>
      ) : upcoming.map((e) => {
        const m = acaMeta(e.type);
        const soon = acaDday(e.start_date) <= 7 && acaDday(e.end_date ?? e.start_date) >= 0;
        return (
          <View key={e.id} style={s.row}>
            <Text style={{ fontSize: 18 }}>{m.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>{e.title}</Text>
              <Text style={s.meta}><Text style={{ color: m.color, fontWeight: '700' }}>{m.label}</Text> · {acaDateLabel(e)}{e.grade ? ` · ${e.grade}` : ''}</Text>
            </View>
            <View style={[s.dday, { backgroundColor: soon ? m.color : C.lineSoft }]}>
              <Text style={[s.ddayT, { color: soon ? '#fff' : m.color }]}>{acaDdayLabel(e)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  cardT: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  title: { fontSize: 14, fontWeight: '700', color: C.ink },
  meta: { fontSize: 12, color: C.muted, marginTop: 2 },
  dday: { borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3 },
  ddayT: { fontSize: 12, fontWeight: '800' },
});
