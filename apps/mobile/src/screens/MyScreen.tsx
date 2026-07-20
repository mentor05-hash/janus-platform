import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, CreditAccount } from '../api';
import { R, SP, useTheme, useUI, type Palette } from '../theme';
import { useWebBack } from '../webBack';
import { AutomatchScreen } from './AutomatchScreen';
import { AutoAssignScreen } from './AutoAssignScreen';
import { RecordsScreen } from './RecordsScreen';
import { ReportsScreen } from './ReportsScreen';
import { ClassifyScreen } from './ClassifyScreen';
import { LegalScreen } from './LegalScreen';
import { ScoresScreen } from './ScoresScreen';

type Plan = { id: string; name: string; price: number; membership_grade?: { name: string; weekly_credits: number } | null };
type Pay = { id: string; amount: number; created_at: string };
type Noti = { id: string; type: string | null; read_at: string | null; created_at: string; payload?: Record<string, unknown> | null; title?: string; body?: string };
type Tx = { id: string; type: 'charge' | 'spend' | 'weekly_grant' | 'weekly_expire' | 'refund'; amount: number; balance: number; description: string | null; created_at: string };
const won = (n: number) => `${n.toLocaleString()}원`;
const CHARGE = [30000, 50000, 100000];
const KST = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const makeTxMeta = (C: Palette): Record<Tx['type'], { label: string; sign: 1 | -1; color: string }> => ({
  charge: { label: '크레딧 충전', sign: 1, color: C.done },
  refund: { label: '크레딧 환원', sign: 1, color: C.done },
  weekly_grant: { label: '주간 크레딧 부여', sign: 1, color: C.done },
  spend: { label: '크레딧 차감', sign: -1, color: C.ink },
  weekly_expire: { label: '주간 크레딧 소멸', sign: -1, color: C.confirmed },
});

type Sub = 'automatch' | 'autoassign' | 'records' | 'reports' | 'classify' | 'legal' | 'scores';
const MENU: { key: Sub; icon: string; title: string; desc: string }[] = [
  { key: 'automatch', icon: '⚡', title: '30분 자동 매칭', desc: '유형·방식만 고르면 7일 내 가장 빠른 30분' },
  { key: 'autoassign', icon: '🗓', title: '자동배정 신청', desc: '시간 안 정해도 전임 선생님 근무시간에 배정' },
  { key: 'scores', icon: '📈', title: '내 성적·배치', desc: '성적 추이 + 예상 대학·학과 라인' },
  { key: 'records', icon: '📝', title: '내 상담 기록', desc: '공개된 핵심요약·숙제·향후방향 확인' },
  { key: 'reports', icon: '📋', title: '상담 리포트', desc: '녹음 동의 상담의 검수된 요약 리포트' },
  { key: 'classify', icon: '💚', title: '선생님 분류', desc: '나와 맞는 / 맞지 않는 선생님 관리' },
  { key: 'legal', icon: '🔒', title: '약관·개인정보', desc: '약관·방침·동의·데이터 내보내기·회원 탈퇴' },
];

export function MyScreen() {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const TX_META = makeTxMeta(C);
  const [sub, setSub] = useState<Sub | null>(null);
  const [acc, setAcc] = useState<CreditAccount | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subId, setSubId] = useState<string | null>(null);
  const [pays, setPays] = useState<Pay[]>([]);
  const [notis, setNotis] = useState<Noti[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [reverse, setReverse] = useState<boolean | null>(null);
  const [payMethod, setPayMethod] = useState<'card' | 'voucher'>('card');
  const [access, setAccess] = useState<{ showTrend: boolean; showPlacement: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  function load() {
    api.get<CreditAccount>('/credits/account').then(setAcc).catch(() => {});
    api.get<Plan[]>('/subscription/plans').then(setPlans).catch(() => {});
    api.get<{ plan_id: string } | null>('/subscription/me').then((s) => setSubId(s?.plan_id ?? null)).catch(() => {});
    api.get<Pay[]>('/payments/history').then((r) => setPays(Array.isArray(r) ? r : [])).catch(() => {});
    api.get<Noti[]>('/notifications').then((r) => setNotis(Array.isArray(r) ? r : [])).catch(() => {});
    api.get<Tx[]>('/credits/transactions').then((r) => setTxs(Array.isArray(r) ? r : [])).catch(() => {});
    api.get<{ reverseSelf: boolean }>('/bookings/reverse/self').then((r) => setReverse(r.reverseSelf)).catch(() => {});
    api.get<{ showTrend: boolean; showPlacement: boolean }>('/me/scores/access').then(setAccess).catch(() => setAccess({ showTrend: false, showPlacement: false }));
  }
  useEffect(load, []);
  useWebBack(sub !== null, () => setSub(null));

  if (sub === 'automatch') return <AutomatchScreen onBack={() => setSub(null)} onBooked={() => { setSub(null); setMsg('자동 매칭으로 예약이 신청되었습니다. 내 예약에서 확인하세요.'); load(); }} />;
  if (sub === 'autoassign') return <AutoAssignScreen onBack={() => setSub(null)} />;
  if (sub === 'records') return <RecordsScreen onBack={() => setSub(null)} />;
  if (sub === 'reports') return <ReportsScreen onBack={() => setSub(null)} />;
  if (sub === 'classify') return <ClassifyScreen onBack={() => setSub(null)} />;
  if (sub === 'legal') return <LegalScreen onBack={() => setSub(null)} onWithdrawn={() => { if (typeof window !== 'undefined') window.location.reload(); }} />;
  if (sub === 'scores') return <ScoresScreen onBack={() => setSub(null)} showPlacement={access?.showPlacement ?? false} />;

  async function charge(amount: number) {
    setBusy(true); setError(''); setMsg('');
    try { await api.post('/payments/charge', { amount, method: payMethod }); setMsg(`${won(amount)} 충전 완료(${payMethod === 'voucher' ? '상품권' : '카드'})`); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '충전 실패'); } finally { setBusy(false); }
  }
  async function subscribe(planId: string) {
    setBusy(true); setError(''); setMsg('');
    try { await api.post('/subscription/subscribe', { planId }); setMsg('구독 적용됨'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '구독 실패'); } finally { setBusy(false); }
  }
  async function toggleReverse(v: boolean) {
    setReverse(v);
    try { await api.patch('/bookings/reverse/self', { value: v }); } catch { setReverse(!v); }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>마이</Text>
      {msg ? <Text style={styles.ok}>{msg}</Text> : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}

      {/* 크레딧 + 충전 */}
      <View style={[ui.card, { marginTop: SP.md }]}>
        <Text style={styles.credit}>{acc ? acc.total.toLocaleString() : '…'} <Text style={styles.creditU}>크레딧</Text></Text>
        <Text style={styles.sub}>주간부여 {acc?.grantedBalance.toLocaleString() ?? 0} · 구매 {acc?.purchasedBalance.toLocaleString() ?? 0}</Text>
        <View style={styles.payRowSel}>
          {([['card', '💳 카드'], ['voucher', '🎟️ 상품권']] as const).map(([v, l]) => (
            <TouchableOpacity key={v} style={[styles.payOpt, payMethod === v && styles.payOptOn]} onPress={() => setPayMethod(v)}><Text style={[styles.payOptT, payMethod === v && { color: C.teal }]}>{l}</Text></TouchableOpacity>
          ))}
        </View>
        <View style={styles.chargeRow}>
          {CHARGE.map((a) => (
            <TouchableOpacity key={a} style={styles.chargeBtn} disabled={busy} onPress={() => charge(a)}><Text style={styles.chargeT}>{(a / 10000)}만 충전</Text></TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 메뉴 */}
      <Text style={styles.sec}>메뉴</Text>
      {MENU.filter((m) => m.key !== 'scores' || access?.showTrend).map((m) => (
        <TouchableOpacity key={m.key} style={[ui.card, styles.menuRow]} onPress={() => setSub(m.key)} activeOpacity={0.7}>
          <Text style={styles.menuIc}>{m.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuT}>{m.title}</Text>
            <Text style={styles.sub}>{m.desc}</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </TouchableOpacity>
      ))}

      {/* 크레딧 내역 */}
      <Text style={styles.sec}>크레딧 내역</Text>
      {txs.length === 0 ? <Text style={ui.sub}>내역이 없어요.</Text> : (
        <View style={[ui.card, { paddingVertical: 4 }]}>
          {txs.slice(0, 12).map((t) => {
            const meta = TX_META[t.type] ?? { label: t.type, sign: 1 as const, color: C.ink };
            const amt = Math.abs(t.amount) * meta.sign;
            return (
              <View key={t.id} style={styles.ledRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.ledLabel, t.type === 'weekly_expire' && { color: C.confirmed }]}>{meta.label}</Text>
                  <Text style={styles.ledT}>{KST(t.created_at)}{t.description ? ` · ${t.description}` : ''}</Text>
                </View>
                <Text style={[styles.ledAmt, { color: meta.color }]}>{amt > 0 ? '+' : ''}{amt.toLocaleString()}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* 구독 플랜 */}
      <Text style={styles.sec}>멤버십 구독</Text>
      {plans.length === 0 ? <Text style={ui.sub}>등록된 플랜이 없어요.</Text> : plans.map((p) => (
        <View key={p.id} style={[ui.card, styles.planRow]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.planName}>{p.name}</Text>
            <Text style={styles.sub}>{won(p.price)}/월{p.membership_grade ? ` · 주간 ${p.membership_grade.weekly_credits.toLocaleString()}크레딧` : ''}</Text>
          </View>
          <TouchableOpacity style={[styles.subBtn, subId === p.id && styles.subOn]} disabled={busy || subId === p.id} onPress={() => subscribe(p.id)}>
            <Text style={[styles.subT, subId === p.id && { color: C.white }]}>{subId === p.id ? '구독중' : '구독'}</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* 역상담 받기 */}
      <Text style={styles.sec}>역상담 받기</Text>
      <View style={[ui.card, styles.planRow]}>
        <View style={{ flex: 1, paddingRight: SP.md }}>
          <Text style={styles.planName}>선생님 역상담 제안 받기</Text>
          <Text style={styles.sub}>{reverse ? '신청됨 — 선생님 목록에 노출' : '꺼짐 — 첫 상담만 제안받음'}</Text>
        </View>
        {reverse === null ? <ActivityIndicator color={C.teal} /> : <Switch value={reverse} onValueChange={toggleReverse} trackColor={{ false: C.line, true: C.teal100 }} thumbColor={reverse ? C.teal : '#f4f3f4'} />}
      </View>

      {/* 알림 */}
      <Text style={styles.sec}>알림 {notis.filter((n) => !n.read_at).length > 0 ? `(미확인 ${notis.filter((n) => !n.read_at).length})` : ''}</Text>
      {notis.length === 0 ? <Text style={ui.sub}>알림이 없어요.</Text> : notis.slice(0, 8).map((n) => (
        <View key={n.id} style={[ui.card, { marginBottom: 6 }]}>
          <Text style={{ fontSize: 13, color: n.read_at ? C.muted : C.ink }}>{!n.read_at ? '● ' : ''}{n.title ?? n.type ?? '알림'}{n.body ? ` · ${n.body}` : ''}</Text>
          <Text style={styles.sub}>{KST(n.created_at)}</Text>
        </View>
      ))}

      {/* 결제 내역 */}
      <Text style={styles.sec}>결제 내역</Text>
      {pays.length === 0 ? <Text style={ui.sub}>결제 내역이 없어요.</Text> : pays.slice(0, 10).map((p) => (
        <View key={p.id} style={styles.payRow}>
          <Text style={styles.sub}>{KST(p.created_at)}</Text>
          <Text style={styles.payAmt}>{won(p.amount)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  sec: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: SP.lg, marginBottom: 8 },
  sub: { fontSize: 12, color: C.muted, marginTop: 3 },
  ok: { color: C.done, fontSize: 13, marginTop: 6, fontWeight: '600' },
  credit: { fontSize: 26, fontWeight: '800', color: C.teal },
  creditU: { fontSize: 14, color: C.muted, fontWeight: '600' },
  payRowSel: { flexDirection: 'row', gap: 8, marginTop: 12 },
  payOpt: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  payOptOn: { borderColor: C.teal, backgroundColor: C.teal50 },
  payOptT: { color: C.muted, fontWeight: '700', fontSize: 13 },
  chargeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  chargeBtn: { flex: 1, borderWidth: 1, borderColor: C.teal, borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  chargeT: { color: C.teal, fontWeight: '700', fontSize: 13 },
  planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  planName: { fontSize: 15, fontWeight: '700', color: C.ink },
  subBtn: { borderWidth: 1, borderColor: C.teal, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  subOn: { backgroundColor: C.teal },
  subT: { color: C.teal, fontWeight: '800', fontSize: 13 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  payAmt: { color: C.teal, fontWeight: '800', fontSize: 14 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  menuIc: { fontSize: 22 },
  menuT: { fontSize: 14, fontWeight: '700', color: C.ink },
  chev: { fontSize: 22, color: C.caption },
  ledRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  ledLabel: { fontSize: 13, fontWeight: '600', color: C.ink },
  ledT: { fontSize: 11, color: C.caption, marginTop: 2 },
  ledAmt: { fontSize: 14, fontWeight: '800' },
});
