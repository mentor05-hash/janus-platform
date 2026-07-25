import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Child, ChildCredits, Note, PaymentRequest } from '../api';
import { R, SP, useTheme, useUI, type Palette } from '../theme';
import { showAlert } from '../lib/alertHost';
import { ScoreTrendView, type Trend } from './ScoreTrendView';
import { AcademicUpcoming } from './AcademicUpcoming';
import { GuardianPlanScreen } from './GuardianPlanScreen';
import { GuardianLinkScreen } from './GuardianLinkScreen';

const won = (n: number) => `${n.toLocaleString()}원`;
const fmt = (n: number) => n.toLocaleString();
const KST = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const DKST = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }) : '');

type Props = { children: Child[]; activeId: string | null; setActiveId: (id: string) => void; goTab?: (t: string) => void; onLinked?: () => void };

/** 학부모 주간 통합 리포트(GET /guardian/report) — 성적·출석·상담·Q&A 요약. */
type WeeklyReport = {
  headline: string;
  period?: { days: number };
  sections: {
    score: { nb?: number; label: string } | null;
    attendance: { done: number; upcoming: number; noshow: number; cancelled: number; rate: number | null; label: string };
    consultation: { count: number; recent?: { at: string; teacher?: string; summary: string | null }[] };
    qna: { count: number };
  };
};

function KidSwitcher({ children, activeId, setActiveId }: Props) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (children.length <= 1) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }} style={{ marginBottom: 8 }}>
      {children.map((c) => (
        <TouchableOpacity key={c.studentId} style={[s.kid, activeId === c.studentId && s.kidOn]} onPress={() => setActiveId(c.studentId)}>
          <Text style={[s.kidT, activeId === c.studentId && { color: C.white }]}>{c.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const makeTxMeta = (C: Palette): Record<string, { label: string; sign: 1 | -1; color: string }> => ({
  charge: { label: '크레딧 충전', sign: 1, color: C.done },
  refund: { label: '크레딧 환원', sign: 1, color: C.done },
  weekly_grant: { label: '주간 크레딧 부여', sign: 1, color: C.done },
  spend: { label: '크레딧 차감', sign: -1, color: C.ink },
  weekly_expire: { label: '주간 크레딧 소멸', sign: -1, color: C.confirmed },
});

/** 최근 상담 기록 상세 — 선생님이 공개(final·보호자 공개)한 노트. 탭하면 핵심요약·과제·방향 펼침. 웹 GuardianReportPage 파리티. */
function GuardianConsultNotes({ studentId, fallbackCount }: { studentId: string | null; fallbackCount: number }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    setNotes(null); setOpenId(null);
    if (!studentId) return;
    api.get<Note[]>(`/students/${studentId}/notes`).then((n) => setNotes(Array.isArray(n) ? n : [])).catch(() => setNotes([]));
  }, [studentId]);
  const list = notes ?? [];
  return (
    <>
      <Text style={[s.repLabel, { marginTop: 10, marginBottom: 6 }]}>최근 상담 {notes === null ? fallbackCount : list.length}건</Text>
      {notes === null ? (
        <ActivityIndicator color={C.teal} style={{ marginVertical: 8, alignSelf: 'flex-start' }} />
      ) : list.length === 0 ? (
        <Text style={{ fontSize: 12.5, color: C.muted }}>공개된 상담 기록이 없어요.</Text>
      ) : (
        list.slice(0, 6).map((n) => {
          const on = openId === n.bookingId;
          const empty = !n.coreSummary && !n.homework && !n.futureDir;
          return (
            <View key={n.bookingId} style={s.consItem}>
              <TouchableOpacity onPress={() => setOpenId(on ? null : n.bookingId)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.ink }}>{n.teacherName ? `${n.teacherName} 선생님` : '상담'}</Text>
                    <Text style={{ fontSize: 11, color: C.muted }}>{DKST(n.createdAt)}{n.consultType ? ` · ${n.consultType}` : ''}</Text>
                  </View>
                  {!on && n.coreSummary ? <Text style={{ fontSize: 12.5, color: C.muted, lineHeight: 18, marginTop: 2 }} numberOfLines={1}>{n.coreSummary}</Text> : null}
                </View>
                <Text style={{ fontSize: 12, color: C.muted }}>{on ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {on && (
                empty ? <Text style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>요약 없음</Text> : (
                  <View style={{ marginTop: 6 }}>
                    {n.coreSummary ? <Text style={{ fontSize: 13, color: C.ink, lineHeight: 19, marginBottom: 6 }}>{n.coreSummary}</Text> : null}
                    {n.homework ? <Text style={{ fontSize: 12.5, color: C.muted, lineHeight: 18 }}><Text style={{ color: C.ink, fontWeight: '700' }}>과제</Text> · {n.homework}</Text> : null}
                    {n.futureDir ? <Text style={{ fontSize: 12.5, color: C.muted, lineHeight: 18, marginTop: 2 }}><Text style={{ color: C.ink, fontWeight: '700' }}>방향</Text> · {n.futureDir}</Text> : null}
                  </View>
                )
              )}
            </View>
          );
        })
      )}
    </>
  );
}

/** 공유받은 상담 리포트(학부모용 요약) — 학생이 "학부모께 공유"한 것만. 웹 GuardianConsultReportsPage 파리티. */
type ShareItem = { bookingId: string; sharedAt: string | null; openedAt: string | null; startAt: string | null; teacherName: string | null; category: string | null };
type ShareDetail = { bookingId: string; sentAt: string | null; progress: string; recommendedActions: string[]; effort: string };

function GuardianConsultReports({ studentId }: { studentId: string | null }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);
  const [items, setItems] = useState<ShareItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [det, setDet] = useState<ShareDetail | null>(null);
  useEffect(() => {
    setItems([]); setOpenId(null); setDet(null);
    if (!studentId) return;
    api.get<ShareItem[]>(`/media/reports/guardian/${studentId}`).then((r) => setItems(Array.isArray(r) ? r : [])).catch(() => setItems([]));
  }, [studentId]);
  const open = async (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id); setDet(null);
    try { setDet(await api.get<ShareDetail>(`/media/reports/guardian/${studentId}/${id}`)); } catch { setDet(null); }
  };
  if (!studentId || items.length === 0) return null;
  return (
    <View style={[ui.card, { marginBottom: 8 }]}>
      <Text style={s.sec}>📋 공유받은 상담 리포트</Text>
      {items.map((it) => (
        <View key={it.bookingId} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, marginTop: 8 }}>
          <TouchableOpacity onPress={() => open(it.bookingId)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: C.ink }}>
              {it.teacherName ?? '선생님'} 선생님 <Text style={{ fontSize: 11, fontWeight: '400', color: C.muted }}>{DKST(it.startAt)}{it.category ? ` · ${it.category}` : ''}</Text>
            </Text>
            <Text style={{ fontSize: 12, color: C.muted }}>{openId === it.bookingId ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {openId === it.bookingId && (
            !det ? <ActivityIndicator color={C.teal} style={{ marginVertical: 8 }} /> : (
              <View style={{ marginTop: 8 }}>
                <Text style={s.repLabel}>진척 요지</Text>
                <Text style={{ fontSize: 13, color: C.ink, lineHeight: 19, marginBottom: 8 }}>{det.progress}</Text>
                <Text style={s.repLabel}>권장 다음 액션</Text>
                {det.recommendedActions.map((a, i) => <Text key={i} style={{ fontSize: 13, color: C.ink, lineHeight: 19 }}>• {a}</Text>)}
                {det.effort ? <Text style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>{det.effort}</Text> : null}
              </View>
            )
          )}
        </View>
      ))}
    </View>
  );
}

/**
 * 본부 결정 ① 학부모 동의·본인확인 — 미성년 자녀 정보 전달 게이트. 웹 GuardianConsentPage 파리티.
 * 본인확인(어댑터·데모) → 전달 동의 → 철회. 원본 휴대폰·생년월일은 저장하지 않음(마스킹 참조만).
 */
type ConsentStatus = {
  studentId: string; isMinor: boolean;
  verifyStatus: 'unverified' | 'verified' | 'failed';
  verifiedName: string | null; verifiedAt: string | null;
  consentDelivery: boolean; consentAt: string | null; revokedAt: string | null; policyVersion: string;
};

function GuardianConsentSection({ studentId }: { studentId: string | null }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);
  const [st, setSt] = useState<ConsentStatus | null>(null);
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!studentId) return;
    api.get<ConsentStatus>(`/guardian/consent?studentId=${studentId}`).then(setSt).catch(() => setSt(null));
  }, [studentId]);
  useEffect(() => { setSt(null); setAgree(false); load(); }, [studentId, load]);
  if (!studentId) return null;

  const verified = st?.verifyStatus === 'verified';
  const inputStyle = { borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: C.ink, marginBottom: 8, fontSize: 13 };

  const verify = async () => {
    if (name.trim().length < 2) { showAlert('안내', '보호자 성함을 입력하세요.'); return; }
    setBusy(true);
    try { await api.post('/guardian/consent/verify', { studentId, name: name.trim(), method: 'phone', birth: birth || undefined, phone: phone || undefined }); setName(''); setBirth(''); setPhone(''); load(); }
    catch (e) { showAlert('본인확인 실패', e instanceof ApiError ? e.message : '다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  const grant = async () => {
    if (!agree) { showAlert('안내', '동의 항목에 체크해야 합니다.'); return; }
    setBusy(true);
    try { await api.post('/guardian/consent', { studentId }); setAgree(false); load(); }
    catch (e) { showAlert('동의 실패', e instanceof ApiError ? e.message : '다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  const revoke = () => showAlert('동의 철회', '전달 동의를 철회할까요?', [
    { text: '취소', style: 'cancel' },
    { text: '철회', style: 'destructive', onPress: async () => { setBusy(true); try { await api.del(`/guardian/consent?studentId=${studentId}`); load(); } catch { /* noop */ } finally { setBusy(false); } } },
  ]);

  return (
    <View style={[ui.card, { marginBottom: 8 }]}>
      <Text style={s.sec}>🔐 동의 · 본인확인</Text>
      <Text style={s.policy}>자녀 정보를 전달받으려면 성인 본인확인과 전달 동의가 필요해요. 입력한 휴대폰·생년월일 원본은 저장하지 않아요(마스킹 참조만).</Text>

      {/* 1) 본인확인 */}
      <Text style={s.repLabelWide}>1. 본인확인</Text>
      {verified ? (
        <Text style={{ fontSize: 13, color: C.teal, fontWeight: '700', marginBottom: 6 }}>✓ 확인 완료 ({st?.verifiedName}) · {DKST(st?.verifiedAt ?? null)}</Text>
      ) : (
        <View style={{ marginTop: 4 }}>
          {st?.verifyStatus === 'failed' && <Text style={{ fontSize: 12, color: C.danger ?? '#c0392b', marginBottom: 4 }}>실패 — 다시 시도</Text>}
          <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="보호자 성함" placeholderTextColor={C.caption} />
          <TextInput style={inputStyle} value={birth} onChangeText={setBirth} placeholder="생년월일 8자리(선택)" placeholderTextColor={C.caption} keyboardType="number-pad" />
          <TextInput style={inputStyle} value={phone} onChangeText={setPhone} placeholder="휴대폰 번호" placeholderTextColor={C.caption} keyboardType="phone-pad" />
          <TouchableOpacity onPress={verify} disabled={busy} style={{ backgroundColor: C.teal, borderRadius: 8, paddingVertical: 11, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>본인확인</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 2) 전달 동의 */}
      <Text style={[s.repLabelWide, { marginTop: 14 }]}>2. 데이터 전달 동의</Text>
      {!verified ? (
        <Text style={{ fontSize: 12.5, color: C.muted }}>본인확인을 먼저 완료해 주세요.</Text>
      ) : st?.consentDelivery ? (
        <View>
          <Text style={{ fontSize: 13, color: C.teal, fontWeight: '700', marginBottom: 8 }}>✓ 동의됨 · {DKST(st?.consentAt ?? null)} (약관 {st?.policyVersion})</Text>
          <TouchableOpacity onPress={revoke} disabled={busy} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: C.ink, fontWeight: '700', fontSize: 13 }}>동의 철회</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <TouchableOpacity onPress={() => setAgree((v) => !v)} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
            <Text style={{ fontSize: 16, color: agree ? C.teal : C.muted }}>{agree ? '☑' : '☐'}</Text>
            <Text style={{ flex: 1, fontSize: 12.5, color: C.ink, lineHeight: 18 }}>자녀의 상담 리포트 등 학습 정보를 보호자(본인)에게 전달받는 것에 동의합니다. 언제든 철회할 수 있어요.</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={grant} disabled={busy || !agree} style={{ backgroundColor: agree ? C.teal : C.line, borderRadius: 8, paddingVertical: 11, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>동의하기</Text>
          </TouchableOpacity>
        </View>
      )}
      <Text style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 16 }}>ℹ️ 동의해도 플랫폼이 개인정보를 외부로 자동 발송하지 않아요. 직접 통지 채널은 본부 확정·연동 후 활성화됩니다.</Text>
    </View>
  );
}

/** 자녀 격차 리포트 이력 행 — 열람은 O105 연령 게이트를 통과해야 온다. */
type GapHist = {
  id: string; created_at: string;
  payload: { unit: { label: string; suffix: string }; gap: { band: string; shortfall: number }; target: { univ: string; dept: string; cut: number }; generatedFor: { value: number } };
};
const HIST_BAND: Record<string, string> = { 안정: '#2a8a5f', 적정: '#57a86a', 소신: '#cf9f2f', 상향: '#d06b52' };

export function GuardianHome({ children, activeId, setActiveId, goTab, onLinked }: Props) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);
  const [reqs, setReqs] = useState<PaymentRequest[]>([]);
  const [access, setAccess] = useState<{ showTrend: boolean; showPlacement: boolean } | null>(null);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [notifs, setNotifs] = useState<{ id: string; title?: string; body?: string; read_at: string | null; created_at?: string }[]>([]);
  const loadNotifs = () => api.get<typeof notifs>('/notifications').then((r) => setNotifs(Array.isArray(r) ? r : [])).catch(() => {});
  useEffect(() => { api.get<PaymentRequest[]>('/payment-requests').then((r) => setReqs(Array.isArray(r) ? r : [])).catch(() => {}); }, []);
  useEffect(() => { loadNotifs(); }, []);
  const readNotif = (id: string) => { api.patch(`/notifications/${id}/read`, {}).then(loadNotifs).catch(() => {}); };
  const readAllNotifs = () => { api.patch('/notifications/read-all', {}).then(loadNotifs).catch(() => {}); };
  useEffect(() => { api.get<{ showTrend: boolean; showPlacement: boolean }>('/me/scores/access').then(setAccess).catch(() => setAccess({ showTrend: false, showPlacement: false })); }, []);
  const child0 = activeId ?? children[0]?.studentId ?? null;
  const [report, setReport] = useState<WeeklyReport | null>(null);
  // 자녀 계획(O106) 하위 화면 + 자녀 산출물 이력(O104·O105 게이트).
  const [planOpen, setPlanOpen] = useState(false);
  // 자녀 연결 하위 화면 — 자녀가 1명 이상이어도 둘째를 잇거나 신청 상태를 확인할 경로가 필요하다.
  const [linkOpen, setLinkOpen] = useState(false);
  const [gapHist, setGapHist] = useState<GapHist[] | null>(null);
  const [gapGate, setGapGate] = useState('');
  useEffect(() => {
    if (!access?.showTrend || !child0) { setTrend(null); return; }
    api.get<Trend>(`/guardian/scores/trend?studentId=${child0}`).then(setTrend).catch(() => setTrend(null));
  }, [access, child0]);
  useEffect(() => {
    if (!child0) { setReport(null); return; }
    api.get<WeeklyReport>(`/guardian/report?studentId=${child0}`).then(setReport).catch(() => setReport(null));
  }, [child0]);
  useEffect(() => {
    if (!child0) { setGapHist(null); setGapGate(''); return; }
    setGapHist(null); setGapGate('');
    api.get<GapHist[]>(`/guardian/reports?studentId=${child0}&kind=gap&limit=5`)
      .then((r) => setGapHist(Array.isArray(r) ? r : []))
      .catch((e) => { setGapHist([]); setGapGate(e instanceof ApiError ? e.message : '열람 권한이 없습니다.'); });
  }, [child0]);
  // 보호자 동의(본부 결정 2026-07-19) — 상담 녹음·AI 요약(외부 STT)은 동의 자녀 한정. 주 사용 채널(모바일) 우선 노출.
  const [consent, setConsent] = useState<{ granted: boolean; grantedAt: string | null; retentionDays: number } | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const loadConsent = useCallback(() => {
    if (!child0) { setConsent(null); return; }
    api.get<{ granted: boolean; grantedAt: string | null; retentionDays: number }>(`/media/guardian-consent/${child0}`)
      .then(setConsent).catch(() => setConsent(null));
  }, [child0]);
  useEffect(() => { loadConsent(); }, [loadConsent]);
  const applyConsent = (next: boolean) => {
    if (!child0 || consentBusy) return;
    setConsentBusy(true);
    api.post('/media/guardian-consent', { studentId: child0, granted: next })
      .then(loadConsent).catch(() => {}).finally(() => setConsentBusy(false));
  };
  const toggleConsent = (next: boolean) => {
    if (next) { applyConsent(true); return; }
    showAlert('동의 철회', '철회하면 이후 상담의 AI 요약 리포트가 제공되지 않습니다(녹음 자체는 상담 당사자 동의 체계를 따릅니다).', [
      { text: '취소', style: 'cancel' },
      { text: '철회', style: 'destructive', onPress: () => applyConsent(false) },
    ]);
  };

  const open = reqs.filter((r) => r.status === 'open');
  const nameOf = (sid: string) => children.find((c) => c.studentId === sid)?.name ?? '자녀';
  const unread = notifs.filter((n) => !n.read_at).length;
  const activeName = child0 ? nameOf(child0) : null;

  if (planOpen && child0) {
    return <GuardianPlanScreen studentId={child0} studentName={activeName ?? '자녀'} onBack={() => setPlanOpen(false)} />;
  }
  if (linkOpen) {
    return <GuardianLinkScreen onBack={() => setLinkOpen(false)} onLinked={onLinked} />;
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[ui.h, { flex: 1 }]}>학부모님 👋</Text>
        {unread > 0 && (
          <View style={s.notifBadge}><Text style={s.notifBadgeT}>🔔 {unread > 99 ? '99+' : unread}</Text></View>
        )}
      </View>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>
        {activeName ? `${activeName} 학생의 상담·크레딧을 한눈에.` : '자녀의 상담과 크레딧을 한눈에 확인하세요.'}
      </Text>

      {/* 자녀 계획(O106) — 내 공간에서 세우고 제안하면 자녀가 수락/거절 */}
      {child0 && (
        <TouchableOpacity onPress={() => setPlanOpen(true)} style={[ui.card, { marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
          <Text style={{ fontSize: 18 }}>🗒</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.sec, { marginBottom: 2 }]}>자녀 계획 세우기</Text>
            <Text style={ui.sub}>내 공간에서 계획을 세우고 제안하면 자녀가 수락/거절해요</Text>
          </View>
          <Text style={{ color: C.teal, fontWeight: '700' }}>›</Text>
        </TouchableOpacity>
      )}

      {/* 자녀 연결 — 둘째 자녀 신청·대기 중 신청 상태 확인. 자녀 0명일 때는 App 이 이 화면을 통째로 띄운다. */}
      <TouchableOpacity onPress={() => setLinkOpen(true)} style={[ui.card, { marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
        <Text style={{ fontSize: 18 }}>👪</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.sec, { marginBottom: 2 }]}>자녀 연결</Text>
          <Text style={ui.sub}>자녀 아이디로 연결을 신청하고 승인 상태를 확인해요</Text>
        </View>
        <Text style={{ color: C.teal, fontWeight: '700' }}>›</Text>
      </TouchableOpacity>

      {/* 자녀 격차 리포트 이력(O104·O105) — 게이트 미충족이면 사유·해결법을 안내 */}
      {child0 && (
        <View style={[ui.card, { marginBottom: 8 }]}>
          <Text style={s.sec}>자녀 격차 리포트 이력</Text>
          {gapGate ? (
            <Text style={ui.sub}>
              {gapGate}{'\n'}미성년 자녀는 본인확인·데이터 전달 동의를 완료하면 열람할 수 있고, 성인 자녀는 자녀 본인이 공유에 동의해야 열람할 수 있어요.
            </Text>
          ) : gapHist === null ? (
            <Text style={ui.sub}>불러오는 중…</Text>
          ) : gapHist.length === 0 ? (
            <Text style={ui.sub}>아직 생성된 격차 리포트가 없어요.</Text>
          ) : (
            gapHist.map((h) => (
              <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.lineSoft }}>
                <Text style={{ fontSize: 11.5, color: C.muted, minWidth: 42 }}>{h.created_at.slice(5, 10)}</Text>
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: HIST_BAND[h.payload.gap.band] ?? C.ink }}>{h.payload.gap.band}</Text>
                <Text style={{ fontSize: 12.5, color: C.ink, flex: 1 }} numberOfLines={1}>
                  {h.payload.target.univ} {h.payload.target.dept}
                </Text>
                <Text style={{ fontSize: 11.5, color: C.muted }}>
                  {h.payload.generatedFor.value}{h.payload.unit.suffix}{h.payload.gap.shortfall > 0 ? ` · ${h.payload.gap.shortfall} 부족` : ' · 도달'}
                </Text>
              </View>
            ))
          )}
        </View>
      )}

      {/* 최근 알림 */}
      {notifs.length > 0 && (
        <View style={[ui.card, { marginBottom: 8 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[s.sec, { flex: 1 }]}>최근 알림</Text>
            {unread > 0 && <TouchableOpacity onPress={readAllNotifs}><Text style={{ fontSize: 12, color: C.confirmed, fontWeight: '700' }}>모두 읽음</Text></TouchableOpacity>}
          </View>
          {notifs.slice(0, 4).map((n) => (
            <TouchableOpacity key={n.id} onPress={() => readNotif(n.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 }}>
              {!n.read_at && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.confirmed }} />}
              <Text style={{ flex: 1, fontSize: 13, color: n.read_at ? C.muted : C.ink, fontWeight: n.read_at ? '400' : '700' }} numberOfLines={1}>
                {n.title ? `${n.title} · ` : ''}{n.body ?? ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {open.length > 0 && (
        <TouchableOpacity style={[ui.card, s.reqBanner]} onPress={() => { setActiveId(open[0].student_id); goTab?.('d'); }}>
          <Text style={s.reqT}>💳 결제요청 {open.length}건</Text>
          <Text style={s.sub}>{nameOf(open[0].student_id)} · 크레딧이 부족해요 · 탭하여 응답</Text>
        </TouchableOpacity>
      )}

      {/* 주간 통합 리포트 */}
      {report && (
        <View style={[ui.card, { marginBottom: 8 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Text style={[s.sec, { flex: 1, marginBottom: 0 }]}>주간 통합 리포트</Text>
            <Text style={{ fontSize: 11, color: C.muted }}>최근 {report.period?.days ?? 7}일</Text>
          </View>
          <Text style={{ color: C.ink, fontWeight: '700', fontSize: 14, lineHeight: 20, marginBottom: 12 }}>{report.headline}</Text>

          {/* 성적 */}
          {report.sections.score && (
            <View style={s.repRow}>
              <Text style={s.repLabel}>성적</Text>
              <Text style={s.repVal}>{report.sections.score.label}</Text>
            </View>
          )}
          {/* 출석 상세 */}
          <View style={s.repRow}>
            <Text style={s.repLabel}>출석</Text>
            <Text style={s.repVal}>
              {report.sections.attendance.rate != null ? `${report.sections.attendance.rate}% · ` : ''}
              완료 {report.sections.attendance.done} · 예정 {report.sections.attendance.upcoming}
              {report.sections.attendance.noshow > 0 ? ` · 노쇼 ${report.sections.attendance.noshow}` : ''}
            </Text>
          </View>
          {/* Q&A */}
          <View style={s.repRow}>
            <Text style={s.repLabel}>Q&A</Text>
            <Text style={s.repVal}>{report.sections.qna.count}건</Text>
          </View>

          {/* 최근 상담 — 공개 노트 상세(탭하면 핵심요약·과제·방향 펼침) */}
          <GuardianConsultNotes studentId={activeId} fallbackCount={report.sections.consultation.count} />
        </View>
      )}

      {/* 공유받은 상담 리포트(학부모용 요약) — 자녀가 공유한 것만 */}
      <GuardianConsultReports studentId={activeId} />

      {/* 멤버십 업셀 배너 */}
      {/* 상담 녹음·AI 요약 보호자 동의(본부 결정) — 미성년 음성 외부 STT 는 동의 자녀 한정 */}
      {consent !== null && (
        <View style={[ui.card, { marginBottom: 8 }]}>
          <Text style={s.sec}>🎙 상담 녹음·AI 요약 동의{activeName ? ` · ${activeName}` : ''}</Text>
          <Text style={{ fontSize: 12.5, color: C.muted, lineHeight: 19, marginTop: 4 }}>
            동의하시면 자녀의 1:1 상담 음성이 요약 리포트 생성을 위해 녹음·문자화(외부 AI 처리 포함)됩니다.
            영상은 저장되지 않으며, 음성 원본은 {consent.retentionDays}일 후 자동 파기됩니다. 언제든 철회할 수 있어요.
            {consent.granted && consent.grantedAt ? ` · 동의일 ${DKST(consent.grantedAt)}` : ''}
          </Text>
          <TouchableOpacity disabled={consentBusy} onPress={() => toggleConsent(!consent.granted)}
            style={{ marginTop: 10, alignSelf: 'flex-start', borderRadius: R.sm, paddingHorizontal: 14, paddingVertical: 8,
              backgroundColor: consent.granted ? C.white : C.teal, borderWidth: consent.granted ? 1 : 0, borderColor: C.line }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: consent.granted ? C.muted : C.white }}>
              {consentBusy ? '처리 중…' : consent.granted ? '동의 철회' : '동의하기'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={s.upsell} onPress={() => goTab?.('g')}>
        <View style={{ flex: 1 }}>
          <Text style={s.upsellT}>✨ 자녀 학습, 한 단계 더</Text>
          <Text style={s.upsellS}>상위 멤버십으로 매주 더 많은 상담 크레딧을 받아보세요.</Text>
        </View>
        <Text style={s.upsellGo}>보기 →</Text>
      </TouchableOpacity>

      <Text style={s.sec}>자녀</Text>
      {children.map((c) => (
        <TouchableOpacity key={c.studentId} style={[ui.card, { marginBottom: 8 }]} onPress={() => { setActiveId(c.studentId); goTab?.('b'); }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={s.av}><Text style={s.avT}>{(c.name ?? '?').slice(0, 1)}</Text></View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={s.name}>{c.name}</Text>
                {c.isHomeroom && <View style={s.badge}><Text style={s.badgeT}>담임 배정</Text></View>}
              </View>
              <Text style={s.sub}>{c.centerName ?? '-'}{c.schoolGrade ? ` · ${c.schoolGrade}` : ''}{c.membershipGrade ? ` · ${c.membershipGrade}` : ''}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
            <View>
              <Text style={s.sub}>잔여 크레딧</Text>
              <Text style={s.bal}>{fmt(c.balance ?? 0)}</Text>
            </View>
            {c.lastAt ? <Text style={s.statusChip}>{c.lastStatus === 'done' ? '최근 완료' : c.lastStatus === 'confirmed' ? '예약됨' : '대기'} · {DKST(c.lastAt)}</Text> : null}
          </View>
        </TouchableOpacity>
      ))}

      {access?.showTrend && trend && trend.points.length > 0 && (
        <View style={[ui.card, { marginTop: 4 }]}>
          <Text style={s.sec}>{trend.student.name} 성적·배치 추이</Text>
          <ScoreTrendView trend={trend} showPlacement={!!access.showPlacement} />
        </View>
      )}

      <AcademicUpcoming />
    </ScrollView>
  );
}

export function GuardianConsult({ children, activeId, setActiveId }: Props) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState('');
  const [report, setReport] = useState<WeeklyReport | null>(null);
  // 자녀 계획(O106) 하위 화면 + 자녀 산출물 이력(O104·O105 게이트).
  const [planOpen, setPlanOpen] = useState(false);
  const [gapHist, setGapHist] = useState<GapHist[] | null>(null);
  const [gapGate, setGapGate] = useState('');
  const [trend, setTrend] = useState<Trend | null>(null);
  const [access, setAccess] = useState<{ showTrend: boolean; showPlacement: boolean } | null>(null);
  useEffect(() => { api.get<{ showTrend: boolean; showPlacement: boolean }>('/me/scores/access').then(setAccess).catch(() => setAccess({ showTrend: false, showPlacement: false })); }, []);
  useEffect(() => {
    if (!activeId) return;
    setNotes(null); setReport(null); setTrend(null);
    api.get<Note[]>(`/students/${activeId}/notes`).then(setNotes).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
    api.get<WeeklyReport>(`/guardian/report?studentId=${activeId}`).then(setReport).catch(() => setReport(null));
    if (access?.showTrend) api.get<Trend>(`/guardian/scores/trend?studentId=${activeId}`).then(setTrend).catch(() => setTrend(null));
  }, [activeId, access]);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>자녀 상세 리포트</Text>
      <KidSwitcher children={children} activeId={activeId} setActiveId={setActiveId} />

      {/* 본부 결정 ① 동의·본인확인 게이트 */}
      <GuardianConsentSection studentId={activeId} />

      {/* 주간 요약 */}
      {report && (
        <View style={[ui.card, { marginBottom: 8 }]}>
          <Text style={s.sec}>이번 주 요약</Text>
          <Text style={{ color: C.ink, fontWeight: '700', fontSize: 14, lineHeight: 20, marginBottom: 10 }}>{report.headline}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {report.sections.attendance.rate != null && <View style={s.rChip}><Text style={s.rChipT}>출석 {report.sections.attendance.rate}%</Text></View>}
            <View style={s.rChip}><Text style={s.rChipT}>완료 {report.sections.attendance.done}</Text></View>
            <View style={s.rChip}><Text style={s.rChipT}>상담 {report.sections.consultation.count}</Text></View>
            <View style={s.rChip}><Text style={s.rChipT}>Q&A {report.sections.qna.count}</Text></View>
            {report.sections.score?.nb != null && <View style={s.rChip}><Text style={s.rChipT}>누백 {report.sections.score.nb}%</Text></View>}
          </View>
        </View>
      )}
      {/* 성적 추이 */}
      {access?.showTrend && trend && (
        <View style={[ui.card, { marginBottom: 8 }]}>
          <Text style={s.sec}>성적 추이</Text>
          <ScoreTrendView trend={trend} showPlacement={!!access.showPlacement} />
        </View>
      )}

      <Text style={s.sec}>상담 기록</Text>
      <Text style={s.policy}>공개 정책에 따라 핵심내용 요약·숙제·향후방향만 표시돼요. (선생님 내부 메모·비공개 상담은 제외)</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {notes === null ? <ActivityIndicator color={C.teal} style={{ marginTop: 16 }} /> : notes.length === 0 ? (
        <View style={[ui.card, { paddingVertical: 18, marginTop: 8 }]}><Text style={ui.sub}>공개된 상담 기록이 없어요.</Text></View>
      ) : (
        <View style={{ marginTop: 8 }}>
          {notes.map((n) => (
            <View key={n.bookingId} style={s.tl}>
              <View style={s.tlDot} />
              <Text style={s.tlDate}>{DKST(n.createdAt)} · {n.consultType ?? '상담'}{n.teacherName ? ` · ${n.teacherName} 선생님` : ''}</Text>
              {n.coreSummary ? (<><Text style={s.tlTtl}>핵심 요약</Text><Text style={s.tlBlk}>{n.coreSummary}</Text></>) : null}
              {n.homework ? (<><Text style={s.tlTtl}>숙제</Text><Text style={s.tlBlk}>{n.homework}</Text></>) : null}
              {n.futureDir ? (<><Text style={s.tlTtl}>향후 방향</Text><Text style={s.tlBlk}>{n.futureDir}</Text></>) : null}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

export function GuardianPay({ children, activeId, setActiveId, goTab }: Props) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);
  const TX_META = useMemo(() => makeTxMeta(C), [C]);
  const [data, setData] = useState<ChildCredits | null>(null);
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const active = children.find((c) => c.studentId === activeId);
  useEffect(() => {
    if (!activeId) return; setData(null);
    api.get<ChildCredits>(`/guardian/children/${activeId}/credits`).then(setData).catch(() => setData({ account: { purchasedBalance: 0, grantedBalance: 0, total: 0 }, transactions: [] }));
  }, [activeId]);
  const inTypes = new Set(['charge', 'weekly_grant', 'refund']);
  const txs = (data?.transactions ?? []).filter((t) => filter === 'all' ? true : filter === 'in' ? inTypes.has(t.type) : !inTypes.has(t.type));

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>결제 내역</Text>
      <KidSwitcher children={children} activeId={activeId} setActiveId={setActiveId} />
      <View style={s.creditCard}>
        <Text style={{ color: '#cfe0f5', fontSize: 12 }}>{active?.name} 잔여 크레딧</Text>
        <Text style={s.creditNum}>{fmt(data?.account.total ?? active?.balance ?? 0)}</Text>
        <Text style={{ color: '#cfe0f5', fontSize: 11, marginTop: 3 }}>이번 주 부여분 {fmt(active?.weeklyCredits ?? 0)} · 일요일 24:00 소멸 예정</Text>
        <TouchableOpacity style={s.chargeCta} onPress={() => goTab?.('d')}><Text style={s.chargeCtaT}>＋ 충전하기</Text></TouchableOpacity>
      </View>
      <View style={s.seg}>
        {([['all', '전체'], ['in', '충전·부여'], ['out', '차감·소멸']] as const).map(([k, l]) => (
          <TouchableOpacity key={k} style={[s.segItem, filter === k && s.segOn]} onPress={() => setFilter(k)}><Text style={[s.segT, filter === k && s.segTOn]}>{l}</Text></TouchableOpacity>
        ))}
      </View>
      {data === null ? <ActivityIndicator color={C.teal} /> : txs.length === 0 ? <Text style={ui.sub}>내역이 없어요.</Text> : (
        <View style={[ui.card, { paddingVertical: 4 }]}>
          {txs.map((t) => {
            const m = TX_META[t.type] ?? { label: t.type, sign: 1 as const, color: C.ink };
            const amt = Math.abs(t.amount) * m.sign;
            return (
              <View key={t.id} style={s.led}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.ledLabel, t.type === 'weekly_expire' && { color: C.confirmed }]}>{m.label}</Text>
                  <Text style={s.ledT}>{KST(t.created_at)}{t.description ? ` · ${t.description}` : ''}</Text>
                </View>
                <Text style={[s.ledAmt, { color: m.color }]}>{amt > 0 ? '+' : ''}{fmt(amt)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const AMOUNTS = [10000, 30000, 50000];
export function GuardianCharge({ children, activeId, setActiveId }: Props) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);
  const [reqs, setReqs] = useState<PaymentRequest[]>([]);
  const [amount, setAmount] = useState(30000);
  const [method, setMethod] = useState<'card' | 'voucher'>('card');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const active = children.find((c) => c.studentId === activeId);

  const load = useCallback(() => { api.get<PaymentRequest[]>('/payment-requests').then((r) => setReqs(Array.isArray(r) ? r : [])).catch(() => {}); }, []);
  useEffect(load, [load]);
  const myOpen = reqs.filter((r) => r.student_id === activeId && r.status === 'open');

  async function respond(id: string, action: 'pay' | 'reject') {
    setBusy(true); setMsg(''); setError('');
    try { await api.patch(`/payment-requests/${id}/respond`, { action }); setMsg(action === 'pay' ? '결제요청에 응답했어요(자녀 크레딧 충전).' : '결제요청을 거절했어요.'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '처리 실패'); } finally { setBusy(false); }
  }
  async function charge() {
    if (!activeId) return;
    setBusy(true); setMsg(''); setError('');
    try { await api.post(`/guardian/children/${activeId}/charge`, { amount, method }); setMsg(`${active?.name} 자녀에게 ${won(amount)} 충전했어요(${method === 'voucher' ? '상품권' : '카드'}).`); }
    catch (e) { setError(e instanceof ApiError ? e.message : '충전 실패'); } finally { setBusy(false); }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>충전 · 결제요청</Text>
      <KidSwitcher children={children} activeId={activeId} setActiveId={setActiveId} />
      {msg ? <Text style={s.ok}>{msg}</Text> : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}

      {myOpen.length > 0 && (
        <>
          <Text style={s.sec}>받은 결제요청</Text>
          {myOpen.map((r) => (
            <View key={r.id} style={[ui.card, s.reqCard]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View><Text style={s.sub}>{active?.name} · 크레딧 부족</Text><Text style={s.name}>필요 크레딧</Text></View>
                <Text style={s.reqAmt}>{fmt(r.needed_credits)}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity style={[ui.btn, { flex: 1 }]} disabled={busy} onPress={() => respond(r.id, 'pay')}><Text style={ui.btnText}>충전으로 응답</Text></TouchableOpacity>
                <TouchableOpacity style={s.rejBtn} disabled={busy} onPress={() => respond(r.id, 'reject')}><Text style={s.rejT}>거절</Text></TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={s.sec}>충전 금액</Text>
      <View style={{ flexDirection: 'row', gap: 9 }}>
        {AMOUNTS.map((a) => (
          <TouchableOpacity key={a} style={[s.amt, amount === a && s.amtOn]} onPress={() => setAmount(a)}><Text style={[s.amtT, amount === a && { color: C.teal }]}>{fmt(a)}</Text></TouchableOpacity>
        ))}
      </View>
      <Text style={s.sec}>결제수단</Text>
      <View style={{ flexDirection: 'row', gap: 9 }}>
        {([['card', '💳 카드'], ['voucher', '🎟️ 상품권']] as const).map(([v, l]) => (
          <TouchableOpacity key={v} style={[s.amt, method === v && s.amtOn]} onPress={() => setMethod(v)}><Text style={[s.amtT, method === v && { color: C.teal }]}>{l}</Text></TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={[ui.btn, { marginTop: 18 }]} disabled={busy} onPress={charge}><Text style={ui.btnText}>{busy ? '처리 중…' : `${fmt(amount)} 크레딧 충전`}</Text></TouchableOpacity>
      <Text style={s.note}>실제 결제는 PG 연동 예정이에요(현재 모의 결제).</Text>
    </ScrollView>
  );
}

type Plan = { id: string; name: string; price: number; billing_cycle: string; payer: string; grade_id: string | null; membership_grade?: { name: string; weekly_credits: number; tier: string } | null };
type Promo = { headline: string; subcopy: string; highlightPlanId: string | null };

/** 학부모 상품/멤버십(업셀) — 자녀 현재 등급 대비 상위 플랜 제안 + 대신 구독·충전 CTA. */
export function GuardianMembership({ children, activeId, setActiveId, goTab }: Props) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [promo, setPromo] = useState<Promo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Plan[]>('/subscription/plans').then((p) => setPlans(Array.isArray(p) ? p : [])).catch(() => setPlans([]));
    api.get<Promo>('/subscription/promo').then(setPromo).catch(() => { /* 기본 문구 */ });
  }, []);

  const childId = activeId ?? children[0]?.studentId ?? null;
  const child = children.find((c) => c.studentId === childId) ?? children[0] ?? null;
  const curCredits = child?.weeklyCredits ?? 0;
  const sorted = useMemo(() => [...(plans ?? [])].sort((a, b) => (a.membership_grade?.weekly_credits ?? 0) - (b.membership_grade?.weekly_credits ?? 0)), [plans]);
  // 상위 제안: 현재 자녀 주간크레딧보다 많은 플랜(가장 근접한 것부터). 없으면 최상위.
  const recommended = promo?.highlightPlanId
    ? sorted.find((p) => p.id === promo.highlightPlanId)
    : sorted.find((p) => (p.membership_grade?.weekly_credits ?? 0) > curCredits) ?? sorted[sorted.length - 1];

  async function subscribe(plan: Plan) {
    if (!childId) { setError('연결된 자녀가 없어요.'); return; }
    setBusy(plan.id); setMsg(''); setError('');
    try {
      await api.post('/subscription/subscribe-for-child', { studentId: childId, planId: plan.id });
      setMsg(`${child?.name ?? '자녀'} · ${plan.name} 구독을 시작했어요. 다음 주부터 상위 혜택이 적용됩니다.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '구독 실패');
    } finally { setBusy(null); }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>멤버십 · 상품</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>자녀에게 맞는 멤버십을 선택해 매주 상담 크레딧을 받아보세요.</Text>

      <KidSwitcher children={children} activeId={activeId} setActiveId={setActiveId} />

      {/* 홍보 배너(본사 편집 가능) */}
      <View style={s.promo}>
        <Text style={s.promoH}>{promo?.headline ?? '자녀 학습, 한 단계 더'}</Text>
        <Text style={s.promoS}>{promo?.subcopy ?? '상위 멤버십으로 매주 더 많은 상담 크레딧과 우선 배정을 받아보세요.'}</Text>
        {child && <Text style={s.promoNow}>현재 {child.name} · {child.membershipGrade ?? '기본'} · 주간 {curCredits} 크레딧</Text>}
      </View>

      {msg ? <Text style={s.okMsg}>{msg}</Text> : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}

      {plans === null ? <ActivityIndicator color={C.teal} style={{ marginTop: 16 }} />
        : sorted.length === 0 ? <Text style={[ui.sub, { marginTop: 12 }]}>현재 판매 중인 멤버십이 없어요.</Text>
        : sorted.map((p) => {
          const wc = p.membership_grade?.weekly_credits ?? 0;
          const isRec = recommended?.id === p.id;
          const isUpgrade = wc > curCredits;
          return (
            <View key={p.id} style={[s.planCard, isRec && s.planRec]}>
              {isRec && <View style={s.recBadge}><Text style={s.recBadgeT}>추천</Text></View>}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={s.planName}>{p.name}{p.membership_grade?.tier ? ` · ${p.membership_grade.tier}등급` : ''}</Text>
                <Text style={s.planPrice}>{won(p.price)}<Text style={s.planCycle}>/{p.billing_cycle === 'monthly' ? '월' : p.billing_cycle}</Text></Text>
              </View>
              <Text style={s.planBenefit}>매주 {wc.toLocaleString()} 크레딧{isUpgrade ? ` · 현재보다 +${(wc - curCredits).toLocaleString()}` : ''}</Text>
              <TouchableOpacity style={[ui.btn, { marginTop: 10 }, busy === p.id && { opacity: 0.6 }]} disabled={!!busy} onPress={() => subscribe(p)}>
                <Text style={ui.btnText}>{busy === p.id ? '처리 중…' : isUpgrade ? '이 멤버십으로 업그레이드' : '이 멤버십 구독'}</Text>
              </TouchableOpacity>
            </View>
          );
        })}

      <TouchableOpacity style={s.chargeLink} onPress={() => goTab?.('d')}>
        <Text style={s.chargeLinkT}>크레딧이 더 필요하세요? 충전하기 →</Text>
      </TouchableOpacity>
      <Text style={s.note}>정기결제는 학부모 계좌로 청구돼요(플랜 정책 기준). 실제 결제는 PG 연동 예정(현재 모의).</Text>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  promo: { backgroundColor: C.teal, borderRadius: R.card, padding: 16, marginTop: 4 },
  promoH: { fontSize: 17, fontWeight: '800', color: '#fff' },
  promoS: { fontSize: 13, color: '#EAF4F8', marginTop: 6, lineHeight: 19 },
  promoNow: { fontSize: 12, color: '#CDE7F0', marginTop: 10, fontWeight: '600' },
  okMsg: { fontSize: 13, color: C.done, fontWeight: '700', marginTop: 12 },
  planCard: { borderWidth: 1, borderColor: C.line, borderRadius: R.card, padding: 16, marginTop: 12, backgroundColor: C.white },
  planRec: { borderColor: C.teal, borderWidth: 2 },
  recBadge: { position: 'absolute', top: -10, left: 14, backgroundColor: C.teal, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3 },
  recBadgeT: { color: '#fff', fontSize: 11, fontWeight: '800' },
  planName: { fontSize: 15, fontWeight: '800', color: C.ink },
  planPrice: { fontSize: 17, fontWeight: '800', color: C.teal, fontVariant: ['tabular-nums'] },
  planCycle: { fontSize: 12, fontWeight: '600', color: C.muted },
  planBenefit: { fontSize: 13, color: C.muted, marginTop: 6, fontWeight: '600' },
  chargeLink: { marginTop: 18, alignItems: 'center', paddingVertical: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.teal },
  chargeLinkT: { color: C.teal, fontWeight: '800', fontSize: 13 },
  upsell: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.teal50, borderColor: C.teal100, borderWidth: 1, borderRadius: R.card, padding: 14, marginBottom: 4 },
  upsellT: { fontSize: 14, fontWeight: '800', color: C.teal },
  upsellS: { fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 16 },
  upsellGo: { fontSize: 13, fontWeight: '800', color: C.teal },
  kid: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: R.pill, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  kidOn: { backgroundColor: C.ink, borderColor: C.ink },
  kidT: { fontSize: 13, fontWeight: '700', color: C.muted },
  sec: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: SP.lg, marginBottom: 8 },
  sub: { fontSize: 12, color: C.muted, marginTop: 2 },
  reqBanner: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg, marginBottom: 4 },
  reqT: { fontSize: 14, fontWeight: '800', color: C.danger },
  av: { width: 46, height: 46, borderRadius: 13, backgroundColor: C.teal100, alignItems: 'center', justifyContent: 'center' },
  avT: { color: C.teal, fontWeight: '800', fontSize: 17 },
  name: { fontSize: 15, fontWeight: '700', color: C.ink },
  badge: { backgroundColor: C.teal, borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeT: { color: C.white, fontSize: 10, fontWeight: '800' },
  bal: { fontSize: 22, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  statusChip: { fontSize: 11, fontWeight: '700', color: C.confirmed, backgroundColor: C.confirmedBg, borderRadius: R.sm, paddingHorizontal: 8, paddingVertical: 3 },
  rChip: { backgroundColor: C.fill, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 5 },
  rChipT: { fontSize: 12, fontWeight: '700', color: C.ink },
  repRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 5, borderTopWidth: 1, borderTopColor: C.line, gap: 10 },
  repLabel: { fontSize: 12.5, fontWeight: '700', color: C.muted, width: 44 },
  repLabelWide: { fontSize: 12.5, fontWeight: '800', color: C.ink, marginBottom: 6 },
  repVal: { fontSize: 13, color: C.ink, flex: 1, lineHeight: 19 },
  consItem: { backgroundColor: C.fill, borderRadius: R.sm, padding: 10, marginBottom: 6 },
  notifBadge: { backgroundColor: C.confirmed, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  notifBadgeT: { color: C.white, fontSize: 12, fontWeight: '800' },
  policy: { fontSize: 12, color: C.muted, backgroundColor: C.lineSoft, borderRadius: 10, padding: 10, lineHeight: 17, marginBottom: 4 },
  tl: { borderLeftWidth: 2, borderLeftColor: C.line, marginLeft: 6, paddingLeft: 16, paddingBottom: 16, position: 'relative' },
  tlDot: { position: 'absolute', left: -6, top: 3, width: 10, height: 10, borderRadius: 5, backgroundColor: C.teal500 },
  tlDate: { fontSize: 12, fontWeight: '800', color: C.caption },
  tlTtl: { fontSize: 11, fontWeight: '800', color: C.teal, marginTop: 8 },
  tlBlk: { fontSize: 13, color: C.ink, marginTop: 3, lineHeight: 19 },
  creditCard: { backgroundColor: C.teal, borderRadius: R.card, padding: 18, marginTop: 4 },
  creditNum: { fontSize: 28, fontWeight: '800', color: C.white, marginTop: 2, fontVariant: ['tabular-nums'] },
  chargeCta: { backgroundColor: C.white, borderRadius: 11, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  chargeCtaT: { color: C.teal, fontWeight: '800', fontSize: 14 },
  seg: { flexDirection: 'row', backgroundColor: C.lineSoft, borderRadius: 10, padding: 3, marginTop: 14, marginBottom: 10 },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segOn: { backgroundColor: C.white },
  segT: { fontSize: 12, fontWeight: '700', color: C.muted },
  segTOn: { color: C.teal, fontWeight: '800' },
  led: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  ledLabel: { fontSize: 13, fontWeight: '600', color: C.ink },
  ledT: { fontSize: 11, color: C.caption, marginTop: 2 },
  ledAmt: { fontSize: 14, fontWeight: '800' },
  reqCard: { borderColor: C.teal100, backgroundColor: C.teal50 },
  reqAmt: { fontSize: 22, fontWeight: '800', color: C.teal, fontVariant: ['tabular-nums'] },
  rejBtn: { flex: 0, paddingHorizontal: 22, borderWidth: 1, borderColor: C.dangerBorder, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rejT: { color: C.danger, fontWeight: '700', fontSize: 14 },
  amt: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: C.white },
  amtOn: { borderColor: C.teal, backgroundColor: C.teal50 },
  amtT: { fontSize: 14, fontWeight: '700', color: C.muted },
  ok: { color: C.done, fontSize: 13, marginTop: 6, fontWeight: '600' },
  note: { fontSize: 11, color: C.caption, marginTop: 10 },
});
