import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { R, SP, useTheme, useUI, type Palette } from '../theme';
import { showAlert } from '../lib/alertHost';

/* 학원찾기(모바일) — 웹 AcademyFinderPage/AcademyDetailPage 파리티. 검색→상세→상담 신청·재원 동의. */
type Card = { id: string; name: string; addr: string | null; sourceLabel: string; verified: boolean; busPass: boolean; score: number; nearestStation: { name?: string; walk_min?: number } | null; repClass: { subject: string; level: string; tuitionKrw: number | null; tuitionLabel: string } | null };
type Cls = { id: string; subject: string; targetGrades: string[]; level: string; schedule: { dow: string; start: string; end: string }[]; tuitionKrw: number | null; tuitionLabel: string; entryTest: boolean };
type Route = { id: string; name: string; days: string[]; direction: string; stops: { seq: number; name: string; dongCode: string | null; timeHint: string | null }[] };
type Cohort = { kind: string; period: string; payload: unknown; source: string; sourceLabel: string; nTotal: number | null };
type Detail = { id: string; name: string; addr: string | null; sourceLabel: string; nearestStation: { name?: string; walk_min?: number } | null; classes: Cls[]; busRoutes: Route[]; cohortStats: Cohort[] };
type Preview = { name: string | null; grade: string | null; goalTier: string | null };

const LEVEL_KO: Record<string, string> = { basic: '기초', regular: '일반', advanced: '심화', prep: '실전' };
const SUBJECTS = ['', '국어', '수학', '영어', '과학', '사회', '입시'];
const won = (n: number | null) => (n == null ? '-' : `${n.toLocaleString()}원`);

export function AcademyFinderScreen() {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);
  const [q, setQ] = useState('');
  const [dong, setDong] = useState('');
  const [subject, setSubject] = useState('');
  const [rows, setRows] = useState<Card[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: '1', size: '20', sort: 'score' });
    if (q) qs.set('q', q);
    if (subject) qs.set('subject', subject);
    if (dong) qs.set('dong', dong);
    try { setRows(await api.get<Card[]>(`/academies?${qs.toString()}`)); } catch { setRows([]); }
  }, [q, subject, dong]);
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (openId) return <AcademyDetail id={openId} onBack={() => setOpenId(null)} />;

  const chip = (active: boolean) => ({ paddingVertical: 5, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1, borderColor: C.line, backgroundColor: active ? C.teal50 : C.white });

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>학원찾기</Text>
      <Text style={ui.sub}>통학·성적대까지 확인하고 상담을 신청하세요.</Text>

      <View style={[ui.card, { marginTop: SP.md, gap: 8 }]}>
        <TextInput style={s.input} value={q} onChangeText={setQ} placeholder="학원명" placeholderTextColor={C.caption} onSubmitEditing={load} />
        <TextInput style={s.input} value={dong} onChangeText={setDong} placeholder="행정동 코드(통학)" placeholderTextColor={C.caption} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {SUBJECTS.map((sub) => (
            <TouchableOpacity key={sub || 'all'} onPress={() => setSubject(sub)} style={chip(subject === sub)}>
              <Text style={{ fontSize: 13, color: subject === sub ? C.teal : C.ink, fontWeight: subject === sub ? '700' : '400' }}>{sub || '전체'}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity onPress={load} style={{ backgroundColor: C.teal, borderRadius: R.md, paddingVertical: 11, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>검색</Text>
        </TouchableOpacity>
      </View>

      {rows === null ? <ActivityIndicator color={C.teal} style={{ marginTop: 20 }} />
        : rows.length === 0 ? <View style={[ui.card, { marginTop: 10 }]}><Text style={ui.sub}>조건에 맞는 학원이 없어요.</Text></View>
        : rows.map((a) => (
          <TouchableOpacity key={a.id} style={[ui.card, { marginTop: 8 }]} activeOpacity={0.75} onPress={() => setOpenId(a.id)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>{a.name}</Text>
              {a.verified && <Text style={s.badgeV}>야누스 검증 ✓</Text>}
              {a.busPass && <Text style={s.badgeB}>🚌 우리 동네 경유</Text>}
            </View>
            {a.repClass && <Text style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>{a.repClass.subject} · {LEVEL_KO[a.repClass.level] ?? a.repClass.level} · {won(a.repClass.tuitionKrw)} <Text style={{ color: C.muted, fontSize: 12 }}>({a.repClass.tuitionLabel})</Text></Text>}
            <Text style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{a.addr ?? '주소 미상'}{a.nearestStation?.name ? ` · ${a.nearestStation.name}역 도보 ${a.nearestStation.walk_min ?? '?'}분` : ''} · {a.sourceLabel}</Text>
          </TouchableOpacity>
        ))}
    </ScrollView>
  );
}

function AcademyDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);
  const [d, setD] = useState<Detail | null>(null);
  const [openRoute, setOpenRoute] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [share, setShare] = useState({ name: true, grade: true, goal: false });
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');

  useEffect(() => {
    api.get<Detail>(`/academies/${id}`).then(setD).catch(() => setD(null));
    api.get<{ academyId: string }[]>('/enrollments/mine').then((r) => setEnrolled(r.some((x) => x.academyId === id))).catch(() => {});
  }, [id]);

  const toggleEnroll = async () => {
    try {
      if (enrolled) { await api.del(`/enrollments/${id}`); setEnrolled(false); }
      else { await api.post('/enrollments', { academyId: id, consentStats: true }); setEnrolled(true); }
    } catch (e) { showAlert('안내', e instanceof ApiError ? e.message : '처리 실패'); }
  };
  const openSheet = async () => { setSheet(true); try { setPreview(await api.get<Preview>('/leads/preview')); } catch { setPreview(null); } };
  const submit = async () => {
    try {
      const r = await api.post<{ consentScope: string[] }>(`/academies/${id}/leads`, { message: message || undefined, contact: contact || undefined, shareName: share.name, shareGrade: share.grade, shareGoal: share.goal });
      setSheet(false); setMessage(''); setContact('');
      showAlert('신청 완료', `공유 항목: ${r.consentScope.join(', ') || '없음'}. 응답은 학원이 확인 후 회신합니다.`);
    } catch (e) { showAlert('신청 실패', e instanceof ApiError ? e.message : '다시 시도해 주세요.'); }
  };

  if (!d) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={C.teal} /></View>;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: C.teal, fontWeight: '700', marginBottom: 8 }}>← 학원찾기</Text></TouchableOpacity>
      <Text style={ui.h}>{d.name}</Text>
      <Text style={ui.sub}>{d.addr ?? '주소 미상'}{d.nearestStation?.name ? ` · ${d.nearestStation.name}역 도보 ${d.nearestStation.walk_min ?? '?'}분` : ''} · {d.sourceLabel}</Text>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <TouchableOpacity onPress={openSheet} style={{ flex: 1, backgroundColor: C.teal, borderRadius: R.md, paddingVertical: 11, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '800' }}>상담 신청</Text></TouchableOpacity>
        <TouchableOpacity onPress={toggleEnroll} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingVertical: 11, alignItems: 'center' }}><Text style={{ color: C.ink, fontWeight: '700' }}>{enrolled ? '재원 표시 해제' : '재원 중 + 동의'}</Text></TouchableOpacity>
      </View>

      {/* 반 */}
      <Text style={s.sec}>반 정보</Text>
      {d.classes.length === 0 ? <Text style={ui.sub}>등록된 반이 없어요.</Text> : d.classes.map((c) => (
        <View key={c.id} style={[ui.card, { marginTop: 6 }]}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }}>{c.subject} <Text style={{ fontSize: 12, color: C.muted }}>· {LEVEL_KO[c.level] ?? c.level}{c.entryTest ? ' · 입반테스트' : ''}</Text></Text>
          <Text style={{ fontSize: 12.5, color: C.ink, marginTop: 3 }}>{c.targetGrades.join(', ') || '-'} · {c.schedule?.map((x) => `${x.dow} ${x.start}~${x.end}`).join(', ') || '시간 미정'}</Text>
          <Text style={{ fontSize: 13, color: C.ink, marginTop: 3 }}>{won(c.tuitionKrw)} <Text style={{ fontSize: 11, color: C.muted }}>({c.tuitionLabel})</Text></Text>
        </View>
      ))}

      {/* 버스 */}
      {d.busRoutes.length > 0 && (
        <>
          <Text style={s.sec}>🚌 학원버스</Text>
          {d.busRoutes.map((r) => (
            <View key={r.id} style={[ui.card, { marginTop: 6 }]}>
              <TouchableOpacity onPress={() => setOpenRoute(openRoute === r.id ? null : r.id)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.ink }}>{r.name} <Text style={{ fontSize: 12, fontWeight: '400', color: C.muted }}>{r.days.join('·')} · {r.direction === 'pickup' ? '등원' : '하원'}</Text></Text>
                <Text style={{ color: C.muted }}>{openRoute === r.id ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {openRoute === r.id && r.stops.map((st) => <Text key={st.seq} style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>{st.seq}. {st.name}{st.timeHint ? ` (${st.timeHint})` : ''}</Text>)}
            </View>
          ))}
        </>
      )}

      {/* 재원생 통계 */}
      {d.cohortStats.length > 0 && (
        <>
          <Text style={s.sec}>재원생 통계</Text>
          {d.cohortStats.map((cs, i) => <CohortView key={i} cs={cs} C={C} />)}
          <Text style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>※ 개별 학생 정보가 아닌 집계입니다.</Text>
        </>
      )}

      {/* 상담 신청 시트 */}
      {sheet && (
        <View style={s.sheetWrap}>
          <View style={[ui.card, { width: '100%' }]}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink, marginBottom: 4 }}>상담 신청 — {d.name}</Text>
            <Text style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>선택한 항목만 전달됩니다. 성적 상세는 전달되지 않아요.</Text>
            {([['name', '이름', preview?.name], ['grade', '학년', preview?.grade], ['goal', '목표 라인', preview?.goalTier]] as const).map(([k, ko, val]) => (
              <TouchableOpacity key={k} onPress={() => setShare((p) => ({ ...p, [k]: !p[k] }))} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontSize: 16, color: share[k] ? C.teal : C.muted }}>{share[k] ? '☑' : '☐'}</Text>
                <Text style={{ fontSize: 13, color: C.ink }}>{ko}: {val ?? '—'}</Text>
              </TouchableOpacity>
            ))}
            <TextInput style={s.input} value={contact} onChangeText={setContact} placeholder="연락처(선택)" placeholderTextColor={C.caption} />
            <TextInput style={[s.input, { minHeight: 60 }]} value={message} onChangeText={setMessage} placeholder="문의 내용(선택)" placeholderTextColor={C.caption} multiline />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity onPress={() => setSheet(false)} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingVertical: 11, alignItems: 'center' }}><Text style={{ color: C.ink, fontWeight: '700' }}>취소</Text></TouchableOpacity>
              <TouchableOpacity onPress={submit} style={{ flex: 2, backgroundColor: C.teal, borderRadius: R.md, paddingVertical: 11, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '800' }}>신청 전송</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function CohortView({ cs, C }: { cs: Cohort; C: Palette }) {
  const label = <Text style={{ fontSize: 11, fontWeight: '700', color: cs.source === 'verified' ? '#1f7a52' : C.muted }}> · {cs.sourceLabel}</Text>;
  if (cs.kind === 'grade_band') {
    const bands = (cs.payload ?? {}) as Record<string, Record<string, number>>;
    return (
      <View style={{ marginTop: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>성적대 분포{label}</Text>
        {Object.entries(bands).map(([exam, dist]) => (
          <View key={exam} style={{ marginTop: 4 }}>
            <Text style={{ fontSize: 12, color: C.muted }}>{exam}</Text>
            {Object.entries(dist).map(([band, pct]) => (
              <View key={band} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <Text style={{ width: 34, fontSize: 12, color: C.ink }}>{band}</Text>
                <View style={{ flex: 1, height: 12, backgroundColor: C.lineSoft, borderRadius: 3, overflow: 'hidden' }}><View style={{ width: `${pct}%`, height: '100%', backgroundColor: C.teal }} /></View>
                <Text style={{ width: 34, fontSize: 12, color: C.ink, textAlign: 'right' }}>{pct}%</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }
  const schools = (cs.payload ?? []) as { school: string; n: number }[];
  return (
    <View style={{ marginTop: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>출신학교 분포{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        {schools.map((sc) => <Text key={sc.school} style={{ fontSize: 12, color: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: R.pill, paddingVertical: 3, paddingHorizontal: 10 }}>{sc.school} {sc.n}명</Text>)}
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  input: { borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 9, color: C.ink, fontSize: 13, backgroundColor: C.white },
  sec: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: SP.lg, marginBottom: 4 },
  badgeV: { fontSize: 11, fontWeight: '700', color: '#1f7a52', backgroundColor: '#e3f3ea', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  badgeB: { fontSize: 11, fontWeight: '700', color: '#1f6feb', backgroundColor: C.lineSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  sheetWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'center', padding: SP.lg },
});
