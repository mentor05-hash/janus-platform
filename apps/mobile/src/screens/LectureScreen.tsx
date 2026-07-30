import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { R, SP, useTheme, useUI, type Palette } from '../theme';
import { useWebBack } from '../webBack';

/**
 * 강좌(녹화 강의) — 처방 탭 하위. 웹 `LecturePage` 와 같은 계약.
 *
 * **왜 여기가 처방인가**: 무엇을 볼지는 격차·목표가 정한다(O189). 강좌는 진단 결과로 받는
 * 학습 자원이지 시간을 쓰는 활동이 아니다.
 *
 * **왜 지금 만들었나**: 두 곳이 이미 이 화면을 가리키고 있었다 —
 *   ① 통합검색의 강좌 결과(서버 `href` = `/student/lectures`)
 *   ② 처방 탭의 `webOnly` 자리(O189 에서 "없다"고 표시해 둔 행)
 * 가리키는 곳이 없는 상태를 오래 두면 사용자는 그 링크를 눌러 보고 나서야 없다는 걸 안다.
 *
 * ⚠ 영상은 **재생기를 넣지 않았다**. 데모 강좌의 `videoUrl` 이 전부 `null` 이고, 재생기를
 * 붙이려면 `expo-av`(네이티브)와 `<video>`(웹)를 따로 다뤄야 한다 — 재생할 것이 없는데
 * 의존을 먼저 들이지 않는다. URL 이 생기면 `Linking` 으로 열고, 없으면 준비 중이라고 말한다.
 */

type Lecture = { id: string; subject: string; unit: string | null; title: string; summary: string | null; level: string | null; minutes: number | null; enrolled?: boolean };
type Detail = Lecture & { videoUrl: string | null; enrolled: boolean; progress: number; rating: number | null; reviewCount: number; myRating: number | null };
type Review = { id: string; rating: number; text: string | null; name: string; createdAt: string };

const SUBJECTS = ['', '국어', '수학', '영어'];
const STARS = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

export function LectureScreen({ onBack, backLabel = '‹ 처방' }: { onBack: () => void; backLabel?: string }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => mk(C), [C]);
  const [tab, setTab] = useState<'catalog' | 'mine'>('catalog');
  const [subject, setSubject] = useState('');
  const [term, setTerm] = useState('');
  const [applied, setApplied] = useState('');
  const [list, setList] = useState<Lecture[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // 상세가 열려 있으면 뒤로가기는 목록으로(허브로 나가지 않는다).
  useWebBack(openId !== null, () => setOpenId(null));

  const load = useCallback(() => {
    setList(null); setError('');
    let url = '/lectures/me';
    if (tab === 'catalog') {
      const qs = new URLSearchParams();
      if (subject) qs.set('subject', subject);
      if (applied.trim()) qs.set('q', applied.trim());
      url = `/lectures${qs.toString() ? `?${qs.toString()}` : ''}`;
    }
    api.get<Lecture[]>(url).then((r) => setList(Array.isArray(r) ? r : [])).catch((e) => { setError(e instanceof ApiError ? e.message : '조회 실패'); setList([]); });
  }, [tab, subject, applied]);
  useEffect(() => { load(); }, [load]);

  async function enroll(id: string) {
    setMsg(''); setError('');
    try { await api.post(`/lectures/${id}/enroll`, {}); setMsg('수강신청 완료!'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '신청 실패'); }
  }

  if (openId) return <LectureDetail id={openId} onBack={() => { setOpenId(null); load(); }} />;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={s.back}>{backLabel}</Text></TouchableOpacity>
      <Text style={ui.h}>강좌</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>약점 유형을 겨냥한 녹화 강의예요. 수강신청하면 진도가 저장됩니다.</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {msg ? <Text style={s.ok}>{msg}</Text> : null}

      <View style={s.seg}>
        {([['catalog', '전체 강좌'], ['mine', '내 수강']] as const).map(([k, label]) => (
          <TouchableOpacity key={k} style={[s.segItem, tab === k && s.segOn]} onPress={() => setTab(k)}>
            <Text style={[s.segT, tab === k && s.segTOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'catalog' && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: SP.md }}>
            {SUBJECTS.map((sub) => (
              <TouchableOpacity key={sub || 'all'} style={[s.chip, subject === sub && s.chipOn]} onPress={() => setSubject(sub)}>
                <Text style={[s.chipT, subject === sub && s.chipTOn]}>{sub || '전체'}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={s.searchRow}>
            <TextInput
              style={[ui.input, { flex: 1 }]}
              value={term}
              onChangeText={setTerm}
              placeholder="강좌 검색 (제목·유형)"
              placeholderTextColor={C.muted}
              returnKeyType="search"
              onSubmitEditing={() => setApplied(term)}
            />
            <TouchableOpacity style={s.searchBtn} onPress={() => setApplied(term)}><Text style={s.searchBtnT}>검색</Text></TouchableOpacity>
            {applied ? (
              <TouchableOpacity onPress={() => { setTerm(''); setApplied(''); }} style={{ padding: 6 }}><Text style={{ color: C.muted, fontSize: 16 }}>✕</Text></TouchableOpacity>
            ) : null}
          </View>
        </>
      )}

      {list === null ? (
        <View style={{ paddingVertical: SP.xl }}><ActivityIndicator color={C.teal} /></View>
      ) : list.length === 0 ? (
        <Text style={[ui.sub, { marginTop: SP.lg }]}>{tab === 'mine' ? '수강 중인 강좌가 없어요. [전체 강좌]에서 골라 보세요.' : '해당 조건의 강좌가 없어요.'}</Text>
      ) : (
        <View style={{ gap: 8, marginTop: SP.md }}>
          {list.map((l) => (
            <TouchableOpacity key={l.id} style={ui.card} activeOpacity={0.75} onPress={() => setOpenId(l.id)}>
              <View style={s.badgeRow}>
                <Text style={s.badge}>{l.subject}</Text>
                {l.unit ? <Text style={s.badgeSoft}>{l.unit}</Text> : null}
                {l.level ? <Text style={s.badgeSoft}>{l.level}</Text> : null}
                {l.minutes != null ? <Text style={s.mins}>{l.minutes}분</Text> : null}
                {(l.enrolled || tab === 'mine') ? <Text style={s.badgeDone}>수강중</Text> : null}
              </View>
              <Text style={s.title}>{l.title}</Text>
              {l.summary ? <Text style={[ui.sub, { marginTop: 4 }]} numberOfLines={2}>{l.summary}</Text> : null}
              {tab === 'catalog' && !l.enrolled && (
                <TouchableOpacity style={[ui.btn, { marginTop: 10, paddingVertical: 10 }]} onPress={() => enroll(l.id)}>
                  <Text style={ui.btnText}>수강신청</Text>
                </TouchableOpacity>
              )}
              {l.enrolled && tab === 'catalog' ? <Text style={[s.ok, { marginTop: 8 }]}>✓ 수강 중 · 눌러서 보기</Text> : null}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function LectureDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => mk(C), [C]);
  const [d, setD] = useState<Detail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [rtext, setRtext] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api.get<Detail>(`/lectures/${id}`).then((x) => { setD(x); setRating(x.myRating ?? 5); }).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
    api.get<Review[]>(`/lectures/${id}/reviews`).then((r) => setReviews(Array.isArray(r) ? r : [])).catch(() => { /* 후기는 부가 정보 — 실패해도 화면을 막지 않는다 */ });
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function enroll() {
    setError(''); setMsg('');
    try { await api.post(`/lectures/${id}/enroll`, {}); setMsg('수강신청 완료!'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '신청 실패'); }
  }
  async function setProgress(p: number) {
    setError('');
    try { await api.patch(`/lectures/${id}/progress`, { progress: p }); setMsg(p >= 100 ? '수강 완료!' : '진도 저장됨'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '진도 저장 실패'); }
  }
  async function submitReview() {
    setError(''); setMsg('');
    try { await api.post(`/lectures/${id}/reviews`, { rating, text: rtext || undefined }); setMsg('후기를 등록했어요.'); setRtext(''); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '후기 등록 실패'); }
  }

  if (!d) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}><ActivityIndicator color={C.teal} /></View>;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={s.back}>‹ 강좌 목록</Text></TouchableOpacity>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {msg ? <Text style={s.ok}>{msg}</Text> : null}

      <View style={s.badgeRow}>
        <Text style={s.badge}>{d.subject}</Text>
        {d.unit ? <Text style={s.badgeSoft}>{d.unit}</Text> : null}
        {d.level ? <Text style={s.badgeSoft}>{d.level}</Text> : null}
        {d.minutes != null ? <Text style={s.mins}>{d.minutes}분</Text> : null}
      </View>
      <Text style={[ui.h, { marginTop: 6, marginBottom: 4 }]}>{d.title}</Text>
      {d.rating != null ? (
        <Text style={s.rate}>{STARS(Math.round(d.rating))} <Text style={s.rateN}>{d.rating}</Text> <Text style={ui.sub}>· 후기 {d.reviewCount}</Text></Text>
      ) : null}
      {d.summary ? <Text style={[ui.sub, { marginTop: 6 }]}>{d.summary}</Text> : null}

      {/* 영상 — 재생기 대신 열기. 없으면 없다고 말한다(O186 원칙). */}
      <View style={s.video}>
        <Text style={{ fontSize: 30, color: '#8fb8de' }}>▶</Text>
        {d.videoUrl ? (
          <TouchableOpacity onPress={() => { void Linking.openURL(d.videoUrl as string); }} style={{ marginTop: 8 }}>
            <Text style={{ color: '#cfe0f5', fontWeight: '700', fontSize: 13 }}>영상 열기</Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ color: '#8fb8de', fontSize: 12.5, marginTop: 6 }}>영상 준비 중 (데모 강좌)</Text>
        )}
      </View>

      {!d.enrolled ? (
        <View style={ui.card}>
          <Text style={{ fontSize: 14, color: C.ink }}>수강신청하면 진도가 저장돼요.</Text>
          <TouchableOpacity style={[ui.btn, { marginTop: 10 }]} onPress={enroll}><Text style={ui.btnText}>수강신청</Text></TouchableOpacity>
        </View>
      ) : (
        <View style={ui.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: C.ink }}>내 진도</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 13, color: d.progress >= 100 ? C.teal : C.muted, fontWeight: '700' }}>
              {d.progress}%{d.progress >= 100 ? ' · 완료' : ''}
            </Text>
          </View>
          <View style={s.track}><View style={[s.fill, { width: `${d.progress}%`, backgroundColor: d.progress >= 100 ? C.done : C.blue }]} /></View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {[25, 50, 75, 100].map((p) => (
              <TouchableOpacity key={p} style={[s.chip, d.progress >= p && s.chipOn]} onPress={() => setProgress(p)}>
                <Text style={[s.chipT, d.progress >= p && s.chipTOn]}>{p === 100 ? '완료 표시' : `${p}%`}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <Text style={s.sec}>후기 {d.reviewCount > 0 ? `(${d.reviewCount})` : ''}</Text>
      {d.enrolled && (
        <View style={[ui.card, { marginBottom: 8 }]}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink }}>{d.myRating ? '내 후기 수정' : '후기 남기기'}</Text>
          <View style={{ flexDirection: 'row', gap: 2, marginTop: 6 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setRating(n)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Text style={{ fontSize: 22, color: n <= rating ? '#f59e0b' : C.line }}>★</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[ui.input, { marginTop: 8, minHeight: 64, textAlignVertical: 'top' }]}
            value={rtext}
            onChangeText={setRtext}
            placeholder="어떤 점이 도움이 됐나요? (선택)"
            placeholderTextColor={C.muted}
            multiline
          />
          <TouchableOpacity style={[ui.btnGhost, { marginTop: 8 }]} onPress={submitReview}>
            <Text style={ui.btnGhostText}>{d.myRating ? '후기 수정' : '후기 등록'}</Text>
          </TouchableOpacity>
        </View>
      )}
      {reviews.length === 0 ? (
        <Text style={ui.sub}>아직 후기가 없어요.</Text>
      ) : (
        reviews.map((r) => (
          <View key={r.id} style={[ui.card, { marginBottom: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#f59e0b', fontSize: 13 }}>{STARS(r.rating)}</Text>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.ink }}>{r.name}</Text>
              <Text style={[ui.sub, { marginLeft: 'auto', fontSize: 11.5 }]}>{new Date(r.createdAt).toLocaleDateString('ko-KR')}</Text>
            </View>
            {r.text ? <Text style={[ui.sub, { marginTop: 6 }]}>{r.text}</Text> : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const mk = (C: Palette) => StyleSheet.create({
  back: { color: C.teal, fontWeight: '700', marginBottom: 8 },
  ok: { color: C.teal, fontSize: 13, fontWeight: '600' },
  sec: { fontSize: 13, fontWeight: '800', color: C.muted, marginTop: SP.lg, marginBottom: SP.sm, letterSpacing: 0.3 },
  seg: { flexDirection: 'row', gap: 4, backgroundColor: C.ghostBg, borderWidth: 1, borderColor: C.ghostBorder, borderRadius: 10, padding: 3, marginTop: SP.sm },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segOn: { backgroundColor: C.blue },
  segT: { fontSize: 13, fontWeight: '700', color: C.muted },
  segTOn: { color: '#fff' },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.white },
  chipOn: { backgroundColor: C.teal, borderColor: C.teal },
  chipT: { fontSize: 12.5, fontWeight: '700', color: C.body },
  chipTOn: { color: '#fff' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SP.sm },
  searchBtn: { backgroundColor: C.blue, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 11 },
  searchBtnT: { color: '#fff', fontWeight: '700', fontSize: 13 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 },
  badge: { fontSize: 11, fontWeight: '800', color: C.blue, backgroundColor: C.blueSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  badgeSoft: { fontSize: 11, fontWeight: '700', color: C.muted, backgroundColor: C.lineSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  badgeDone: { fontSize: 11, fontWeight: '800', color: '#fff', backgroundColor: C.done, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  mins: { fontSize: 11.5, color: C.caption },
  title: { fontSize: 15, fontWeight: '800', color: C.ink },
  rate: { fontSize: 13, color: '#f59e0b', marginTop: 2 },
  rateN: { color: C.ink, fontWeight: '800' },
  video: { aspectRatio: 16 / 9, width: '100%', borderRadius: R.card, backgroundColor: '#0d1626', alignItems: 'center', justifyContent: 'center', marginVertical: SP.md },
  track: { height: 8, borderRadius: 5, backgroundColor: C.lineSoft, overflow: 'hidden' },
  fill: { height: '100%' },
});
