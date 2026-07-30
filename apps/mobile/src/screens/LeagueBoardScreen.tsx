import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { showAlert } from '../lib/alertHost';
import { R, SP, useTheme, useUI, type Palette } from '../theme';
import { useWebBack } from '../webBack';

/**
 * 리그 Q&A(3부 공개 게시판) — 실행 › 질문. 웹 `CommunityBoardPage` 와 같은 계약.
 *
 * 무료·전원 답변(학생 포함)·무정산·단일 채택·신고 숨김. 답변이 **채택**되면 실적이 쌓이고
 * 요건을 넘으면 자동 승급한다 — 크레딧·승급이 걸린 동선이라 모바일에 없으면 그만큼이 빈다.
 *
 * ⚠ 웹과 다른 점 하나: **실시간 소켓 구독을 넣지 않았다.** 웹은 `community:answer`·
 * `community:accepted` 를 구독해 다른 사람의 답변이 즉시 뜨는데, 폰에서 상시 소켓은
 * 배터리·재연결·백그라운드 복귀를 모두 다뤄야 한다. 이 화면은 대개 짧게 머무는 곳이라
 * **내 동작 뒤 재조회 + 당겨서 새로고침**으로 대신한다. 필요가 확인되면 그때 붙인다.
 */

type ListItem = { id: string; subject: string | null; difficulty: string | null; body: string; status: string; createdAt: string; answerCount: number; hasAiDraft: boolean };
type Answer = { id: string; body: string; accepted: boolean; aiSimilar: boolean; authorName: string; authorRole: string | null; mine: boolean; createdAt: string };
type Detail = { id: string; subject: string | null; difficulty: string | null; body: string; status: string; isOwner: boolean; aiDraft: string | null; createdAt: string; answers: Answer[] };
type TierRule = { minAuthored: number; minAccepted: number; minRate: number };
type MyLeague = { tier: number; label: string; authored: number; accepted: number; acceptRate: number; next: { tier: number; label: string; rule: TierRule } | null };
type LeaderRow = { tier: number; label: string; name: string; role: string | null; accepted: number; authored: number; acceptRate: number };
type RuleRow = { tier: number; label: string; entry?: boolean; rule: TierRule | null };

const SUBJECTS = ['', '국어', '수학', '영어', '과학', '사회'];
const fmtDate = (s: string) => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const roleLabel = (r: string | null) => (r === 'teacher' ? '선생님' : r === 'student' ? '학생' : r === 'guardian' ? '학부모' : (r ?? ''));
const tierIcon = (t: number) => (t === 1 ? '👑' : t === 2 ? '🏅' : '🌱');

export function LeagueBoardScreen({ onBack, backLabel = '‹ 실행' }: { onBack: () => void; backLabel?: string }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => mk(C), [C]);
  const [list, setList] = useState<ListItem[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [subject, setSubject] = useState('');
  const [term, setTerm] = useState('');
  const [applied, setApplied] = useState('');
  const [writing, setWriting] = useState(false);
  const [wBody, setWBody] = useState('');
  const [wSubject, setWSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useWebBack(openId !== null, () => setOpenId(null));

  const load = useCallback(() => {
    setList(null); setError('');
    const qs = new URLSearchParams();
    if (unansweredOnly) qs.set('filter', 'unanswered');
    if (subject) qs.set('subject', subject);
    if (applied.trim()) qs.set('q', applied.trim());
    api.get<ListItem[]>(`/qna/community${qs.toString() ? `?${qs}` : ''}`)
      .then((r) => setList(Array.isArray(r) ? r : []))
      .catch((e) => { setError(e instanceof ApiError ? e.message : '커뮤니티 조회 실패'); setList([]); });
  }, [unansweredOnly, subject, applied]);
  useEffect(() => { load(); }, [load]);

  async function submitQuestion() {
    if (!wBody.trim()) return;
    setBusy(true); setError(''); setMsg('');
    try {
      await api.post('/qna/community', { subject: wSubject || undefined, body: wBody });
      setWBody(''); setWSubject(''); setWriting(false);
      setMsg('질문을 올렸어요. 누구나 답변할 수 있어요.');
      load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '등록 실패'); }
    finally { setBusy(false); }
  }

  if (openId) return <PostDetail postId={openId} onBack={() => { setOpenId(null); load(); }} />;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={s.back}>{backLabel}</Text></TouchableOpacity>
      <Text style={ui.h}>리그 Q&A</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>누구나 답변하고, 질문자가 채택해요. 채택이 쌓이면 등급이 올라갑니다.</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {msg ? <Text style={s.ok}>{msg}</Text> : null}

      <LeaguePanel />

      {/* 질문 올리기 */}
      {writing ? (
        <View style={[ui.card, { marginBottom: SP.md }]}>
          <Text style={s.cardT}>질문 올리기</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
            {SUBJECTS.map((sub) => (
              <TouchableOpacity key={sub || 'none'} style={[s.chipSm, wSubject === sub && s.chipOn]} onPress={() => setWSubject(sub)}>
                <Text style={[s.chipSmT, wSubject === sub && s.chipTOn]}>{sub || '과목 없음'}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TextInput
            style={[ui.input, { marginTop: 8, minHeight: 90, textAlignVertical: 'top' }]}
            value={wBody}
            onChangeText={setWBody}
            placeholder="어디서 막혔는지 적어주세요. 풀이 과정이 있으면 답변이 정확해져요."
            placeholderTextColor={C.muted}
            multiline
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity style={[ui.btn, { flex: 1 }, busy && ui.btnDisabled]} disabled={busy} onPress={submitQuestion}>
              <Text style={ui.btnText}>{busy ? '올리는 중…' : '올리기'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ui.btnGhost, { flex: 1 }]} onPress={() => setWriting(false)}>
              <Text style={ui.btnGhostText}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={[ui.btn, { marginBottom: SP.md }]} onPress={() => setWriting(true)}>
          <Text style={ui.btnText}>＋ 질문 올리기</Text>
        </TouchableOpacity>
      )}

      {/* 필터 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <TouchableOpacity style={[s.chipSm, unansweredOnly && s.chipOn]} onPress={() => setUnansweredOnly((v) => !v)}>
          <Text style={[s.chipSmT, unansweredOnly && s.chipTOn]}>미답변만</Text>
        </TouchableOpacity>
        {SUBJECTS.map((sub) => (
          <TouchableOpacity key={sub || 'all'} style={[s.chipSm, subject === sub && s.chipOn]} onPress={() => setSubject(sub)}>
            <Text style={[s.chipSmT, subject === sub && s.chipTOn]}>{sub || '전체'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={s.searchRow}>
        <TextInput
          style={[ui.input, { flex: 1 }]}
          value={term}
          onChangeText={setTerm}
          placeholder="질문 검색"
          placeholderTextColor={C.muted}
          returnKeyType="search"
          onSubmitEditing={() => setApplied(term)}
        />
        <TouchableOpacity style={s.searchBtn} onPress={() => setApplied(term)}><Text style={s.searchBtnT}>검색</Text></TouchableOpacity>
        {applied ? <TouchableOpacity onPress={() => { setTerm(''); setApplied(''); }} style={{ padding: 6 }}><Text style={{ color: C.muted, fontSize: 16 }}>✕</Text></TouchableOpacity> : null}
      </View>

      {list === null ? (
        <View style={{ paddingVertical: SP.xl }}><ActivityIndicator color={C.teal} /></View>
      ) : list.length === 0 ? (
        <Text style={[ui.sub, { marginTop: SP.lg }]}>{unansweredOnly ? '미답변 질문이 없어요.' : '아직 질문이 없어요. 첫 질문을 올려보세요.'}</Text>
      ) : (
        <View style={{ gap: 8, marginTop: SP.md }}>
          {list.map((p) => (
            <TouchableOpacity key={p.id} style={ui.card} activeOpacity={0.75} onPress={() => setOpenId(p.id)}>
              <View style={s.badgeRow}>
                {p.subject ? <Text style={s.badge}>{p.subject}</Text> : null}
                {p.difficulty ? <Text style={s.badgeSoft}>{p.difficulty}</Text> : null}
                {p.status !== 'open' ? <Text style={s.badgeDone}>채택완료</Text> : null}
                {p.hasAiDraft ? <Text style={s.badgeSoft}>🤖 초안</Text> : null}
                <Text style={[ui.sub, { marginLeft: 'auto', fontSize: 11.5 }]}>{fmtDate(p.createdAt)}</Text>
              </View>
              <Text style={s.postBody} numberOfLines={3}>{p.body}</Text>
              <Text style={[ui.sub, { marginTop: 6, fontSize: 12 }]}>답변 {p.answerCount}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

/** 내 등급·다음 등급·규칙·리더보드 — 웹과 같은 3 엔드포인트. */
function LeaguePanel() {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => mk(C), [C]);
  const [me, setMe] = useState<MyLeague | null>(null);
  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);

  useEffect(() => {
    api.get<MyLeague>('/qna/league/me').then(setMe).catch(() => { /* 리그는 부가 정보 — 실패해도 게시판은 돈다 */ });
    api.get<LeaderRow[]>('/qna/league/leaderboard').then((r) => setBoard(Array.isArray(r) ? r : [])).catch(() => { /* 무시 */ });
    api.get<{ tiers: RuleRow[] }>('/qna/league/rules').then((r) => setRules(r.tiers ?? [])).catch(() => { /* 무시 */ });
  }, []);

  if (!me) return null;
  const need = me.next?.rule;

  return (
    <View style={[ui.card, { marginBottom: SP.md }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={s.tier}>{tierIcon(me.tier)} {me.label}</Text>
        <Text style={[ui.sub, { fontSize: 12 }]}>답변 {me.authored} · 채택 {me.accepted} · 채택률 {me.acceptRate}%</Text>
      </View>
      {me.next && need ? (
        <Text style={[ui.sub, { marginTop: 8 }]}>
          다음 <Text style={{ fontWeight: '800', color: C.ink }}>{me.next.label}</Text>까지 — 채택 {me.accepted}/{need.minAccepted} · 답변 {me.authored}/{need.minAuthored} · 채택률 {me.acceptRate}/{need.minRate}%
        </Text>
      ) : (
        <Text style={[ui.sub, { marginTop: 8 }]}>최고 등급이에요. 커뮤니티의 든든한 답변자!</Text>
      )}

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
        <TouchableOpacity style={[s.chipSm, rulesOpen && s.chipOn]} onPress={() => setRulesOpen((v) => !v)}>
          <Text style={[s.chipSmT, rulesOpen && s.chipTOn]}>📖 규칙 안내 {rulesOpen ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.chipSm, boardOpen && s.chipOn]} onPress={() => setBoardOpen((v) => !v)}>
          <Text style={[s.chipSmT, boardOpen && s.chipTOn]}>🏆 리더보드 {boardOpen ? '▲' : '▼'}</Text>
        </TouchableOpacity>
      </View>

      {rulesOpen && (
        <View style={s.fold}>
          <Text style={[ui.sub, { marginBottom: 8 }]}>답변을 남기고 질문자가 채택하면 실적이 쌓여요. 요건을 모두 넘으면 자동 승급(숫자가 작을수록 상위).</Text>
          {(rules ?? []).slice().sort((a, b) => a.tier - b.tier).map((t) => (
            <View key={t.tier} style={s.ruleRow}>
              <Text style={s.ruleT}>{tierIcon(t.tier)} {t.label}</Text>
              <Text style={[ui.sub, { flex: 1, fontSize: 12 }]}>
                {t.entry || !t.rule ? '가입 시 기본 등급 — 요건 없이 시작' : `답변 ${t.rule.minAuthored}+ · 채택 ${t.rule.minAccepted}+ · 채택률 ${t.rule.minRate}%+`}
              </Text>
            </View>
          ))}
          <Text style={[ui.sub, { fontSize: 11.5, marginTop: 8 }]}>강등은 없어요 · 채택할 때마다 재평가·즉시 승급.</Text>
        </View>
      )}

      {boardOpen && (
        <View style={s.fold}>
          {board === null || board.length === 0 ? (
            <Text style={[ui.sub, { fontSize: 12.5 }]}>아직 승급자가 없어요. 답변으로 첫 승급을 노려보세요.</Text>
          ) : (
            board.map((r, i) => (
              <View key={`${r.name}-${i}`} style={s.leadRow}>
                <Text style={s.leadNo}>{i + 1}</Text>
                <Text style={s.leadName}>{r.name}</Text>
                <Text style={s.badgeSoft}>{r.label}</Text>
                <Text style={[ui.sub, { marginLeft: 'auto', fontSize: 12 }]}>채택 {r.accepted} · {r.acceptRate}%</Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

function PostDetail({ postId, onBack }: { postId: string; onBack: () => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => mk(C), [C]);
  const [d, setD] = useState<Detail | null>(null);
  const [body, setBody] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api.get<Detail>(`/qna/community/${postId}`).then(setD).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [postId]);
  useEffect(() => { load(); }, [load]);

  async function submitAnswer() {
    if (!body.trim()) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await api.post<{ aiSimilar: boolean; warning: string | null }>(`/qna/community/${postId}/answers`, { body });
      setBody('');
      setMsg(r.warning ?? '답변을 등록했어요.');
      load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '답변 실패'); }
    finally { setBusy(false); }
  }
  async function accept(answerId: string) {
    setError(''); setMsg('');
    try { await api.patch(`/qna/community/answers/${answerId}/accept`, {}); setMsg('답변을 채택했어요.'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '채택 실패'); }
  }
  async function saveEdit() {
    if (!editId || !editBody.trim()) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await api.patch<{ warning: string | null }>(`/qna/community/answers/${editId}`, { body: editBody });
      setEditId(null); setEditBody('');
      setMsg(r.warning ?? '답변을 수정했어요.');
      load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '수정 실패'); }
    finally { setBusy(false); }
  }
  function report(targetType: 'post' | 'answer', targetId: string) {
    showAlert('신고', '이 글을 신고할까요? 누적되면 자동으로 숨겨집니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '신고',
        style: 'destructive',
        onPress: () => {
          api.post('/qna/report', { targetType, targetId })
            .then(() => setMsg('신고했습니다.'))
            .catch((e) => setError(e instanceof ApiError ? e.message : '신고 실패'));
        },
      },
    ]);
  }

  if (!d) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}><ActivityIndicator color={C.teal} /></View>;
  const closed = d.status !== 'open';
  const mine = d.answers.find((a) => a.mine) ?? null; // 1인 1건

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={s.back}>‹ 목록으로</Text></TouchableOpacity>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {msg ? <Text style={s.ok}>{msg}</Text> : null}

      <View style={ui.card}>
        <View style={s.badgeRow}>
          {d.subject ? <Text style={s.badge}>{d.subject}</Text> : null}
          {d.difficulty ? <Text style={s.badgeSoft}>{d.difficulty}</Text> : null}
          {closed ? <Text style={s.badgeDone}>채택완료</Text> : null}
          <TouchableOpacity style={{ marginLeft: 'auto' }} onPress={() => report('post', d.id)}>
            <Text style={s.report}>🚩 신고</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.postBody}>{d.body}</Text>
        {d.aiDraft ? (
          <View style={s.ai}>
            <Text style={s.aiT}>🤖 AI 1차 초안</Text>
            <Text style={[ui.sub, { marginTop: 4 }]}>{d.aiDraft}</Text>
          </View>
        ) : null}
      </View>

      <Text style={s.sec}>답변 {d.answers.length}</Text>
      {d.answers.length === 0 ? (
        <Text style={ui.sub}>아직 답변이 없어요. 첫 답변을 남겨보세요.</Text>
      ) : (
        d.answers.map((a) => (
          <View key={a.id} style={[ui.card, { marginBottom: 8 }, a.accepted && s.acceptedCard]}>
            <View style={s.badgeRow}>
              <Text style={s.author}>{a.authorName}</Text>
              {a.authorRole ? <Text style={s.badgeSoft}>{roleLabel(a.authorRole)}</Text> : null}
              {a.accepted ? <Text style={s.badgeDone}>채택</Text> : null}
              {a.aiSimilar ? <Text style={s.badgeSoft}>AI 유사</Text> : null}
              <TouchableOpacity style={{ marginLeft: 'auto' }} onPress={() => report('answer', a.id)}>
                <Text style={s.report}>🚩</Text>
              </TouchableOpacity>
            </View>
            {editId === a.id ? (
              <>
                <TextInput style={[ui.input, { marginTop: 8, minHeight: 80, textAlignVertical: 'top' }]} value={editBody} onChangeText={setEditBody} multiline />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity style={[ui.btn, { flex: 1 }]} disabled={busy} onPress={saveEdit}><Text style={ui.btnText}>저장</Text></TouchableOpacity>
                  <TouchableOpacity style={[ui.btnGhost, { flex: 1 }]} onPress={() => setEditId(null)}><Text style={ui.btnGhostText}>취소</Text></TouchableOpacity>
                </View>
              </>
            ) : (
              <Text style={[s.postBody, { marginTop: 6 }]}>{a.body}</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, alignItems: 'center' }}>
              <Text style={[ui.sub, { fontSize: 11.5 }]}>{fmtDate(a.createdAt)}</Text>
              {a.mine && editId !== a.id ? (
                <TouchableOpacity onPress={() => { setEditId(a.id); setEditBody(a.body); }}><Text style={s.link}>수정</Text></TouchableOpacity>
              ) : null}
              {d.isOwner && !closed && !a.accepted ? (
                <TouchableOpacity style={{ marginLeft: 'auto' }} onPress={() => accept(a.id)}>
                  <Text style={s.acceptBtn}>이 답변 채택</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ))
      )}

      {/* 답변 작성 — 본인 질문/이미 답변함/채택 완료면 폼 자체를 내린다.
          서버가 본인 답변을 403 으로 막으므로(`본인 질문에는 답변할 수 없습니다`),
          폼을 열어 두면 다 쓰고 나서 거절당한다 — 웹과 같은 조건으로 맞춘다. */}
      {d.isOwner && !closed ? (
        <Text style={[ui.sub, { marginTop: SP.md }]}>본인 질문에는 답변할 수 없어요. 마음에 드는 답변을 채택해 주세요.</Text>
      ) : mine ? (
        <Text style={[ui.sub, { marginTop: SP.md }]}>이미 답변을 남겼어요. 위에서 [수정]할 수 있어요.</Text>
      ) : closed ? (
        <Text style={[ui.sub, { marginTop: SP.md }]}>채택이 끝난 질문이라 새 답변은 받지 않아요.</Text>
      ) : (
        <View style={[ui.card, { marginTop: SP.md }]}>
          <Text style={s.cardT}>답변 남기기</Text>
          <TextInput
            style={[ui.input, { marginTop: 8, minHeight: 90, textAlignVertical: 'top' }]}
            value={body}
            onChangeText={setBody}
            placeholder="풀이 과정을 함께 적으면 채택될 확률이 높아요."
            placeholderTextColor={C.muted}
            multiline
          />
          <TouchableOpacity style={[ui.btn, { marginTop: 8 }, busy && ui.btnDisabled]} disabled={busy} onPress={submitAnswer}>
            <Text style={ui.btnText}>{busy ? '등록 중…' : '답변 등록'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const mk = (C: Palette) => StyleSheet.create({
  back: { color: C.teal, fontWeight: '700', marginBottom: 8 },
  ok: { color: C.teal, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  sec: { fontSize: 13, fontWeight: '800', color: C.muted, marginTop: SP.lg, marginBottom: SP.sm, letterSpacing: 0.3 },
  cardT: { fontSize: 14, fontWeight: '800', color: C.ink },
  tier: { fontSize: 15, fontWeight: '800', color: C.ink },
  fold: { marginTop: 10, borderTopWidth: 1, borderTopColor: C.lineSoft, paddingTop: 10 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.lineSoft },
  ruleT: { fontSize: 13, fontWeight: '800', color: C.ink, minWidth: 84 },
  leadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  leadNo: { width: 18, fontSize: 12, color: C.caption, fontVariant: ['tabular-nums'] },
  leadName: { fontSize: 13, fontWeight: '700', color: C.ink },
  chipSm: { borderWidth: 1, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: C.white },
  chipOn: { backgroundColor: C.teal, borderColor: C.teal },
  chipSmT: { fontSize: 12, fontWeight: '700', color: C.body },
  chipTOn: { color: '#fff' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SP.sm },
  searchBtn: { backgroundColor: C.blue, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 11 },
  searchBtnT: { color: '#fff', fontWeight: '700', fontSize: 13 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badge: { fontSize: 11, fontWeight: '800', color: C.blue, backgroundColor: C.blueSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  badgeSoft: { fontSize: 11, fontWeight: '700', color: C.muted, backgroundColor: C.lineSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  badgeDone: { fontSize: 11, fontWeight: '800', color: '#fff', backgroundColor: C.done, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  postBody: { fontSize: 14.5, color: C.ink, lineHeight: 21, marginTop: 6 },
  author: { fontSize: 13, fontWeight: '800', color: C.ink },
  report: { fontSize: 12, color: C.caption },
  link: { fontSize: 12.5, color: C.teal, fontWeight: '700' },
  acceptBtn: { fontSize: 12.5, color: '#fff', fontWeight: '800', backgroundColor: C.teal, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, overflow: 'hidden' },
  acceptedCard: { borderColor: C.done },
  ai: { marginTop: 12, padding: 10, backgroundColor: C.lineSoft, borderRadius: R.md, borderLeftWidth: 3, borderLeftColor: C.teal },
  aiT: { fontSize: 12, color: C.teal, fontWeight: '800' },
});
