import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, CreditAccount } from '../api';
import { C, R, SP, ui } from '../theme';

type Plan = { id: string; name: string; price: number; membership_grade?: { name: string; weekly_credits: number } | null };
type Pay = { id: string; amount: number; created_at: string };
type Noti = { id: string; type: string | null; read_at: string | null; created_at: string; payload?: Record<string, unknown> | null };
const won = (n: number) => `${n.toLocaleString()}원`;
const CHARGE = [30000, 50000, 100000];
const KST = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export function MyScreen() {
  const [acc, setAcc] = useState<CreditAccount | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subId, setSubId] = useState<string | null>(null);
  const [pays, setPays] = useState<Pay[]>([]);
  const [notis, setNotis] = useState<Noti[]>([]);
  const [reverse, setReverse] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  function load() {
    api.get<CreditAccount>('/credits/account').then(setAcc).catch(() => {});
    api.get<Plan[]>('/subscription/plans').then(setPlans).catch(() => {});
    api.get<{ plan_id: string } | null>('/subscription/me').then((s) => setSubId(s?.plan_id ?? null)).catch(() => {});
    api.get<Pay[]>('/payments/history').then((r) => setPays(Array.isArray(r) ? r : [])).catch(() => {});
    api.get<Noti[]>('/notifications').then((r) => setNotis(Array.isArray(r) ? r : [])).catch(() => {});
    api.get<{ reverseSelf: boolean }>('/bookings/reverse/self').then((r) => setReverse(r.reverseSelf)).catch(() => {});
  }
  useEffect(load, []);

  async function charge(amount: number) {
    setBusy(true); setError(''); setMsg('');
    try { await api.post('/payments/charge', { amount }); setMsg(`${won(amount)} 충전 완료`); load(); }
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
        <View style={styles.chargeRow}>
          {CHARGE.map((a) => (
            <TouchableOpacity key={a} style={styles.chargeBtn} disabled={busy} onPress={() => charge(a)}><Text style={styles.chargeT}>{(a / 10000)}만 충전</Text></TouchableOpacity>
          ))}
        </View>
      </View>

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
          <Text style={{ fontSize: 13, color: n.read_at ? C.muted : C.ink }}>{!n.read_at ? '● ' : ''}{n.type ?? '알림'}{typeof n.payload?.message === 'string' ? ` · ${n.payload.message}` : ''}</Text>
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

const styles = StyleSheet.create({
  sec: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: SP.lg, marginBottom: 8 },
  sub: { fontSize: 12, color: C.muted, marginTop: 3 },
  ok: { color: C.done, fontSize: 13, marginTop: 6, fontWeight: '600' },
  credit: { fontSize: 26, fontWeight: '800', color: C.teal },
  creditU: { fontSize: 14, color: C.muted, fontWeight: '600' },
  chargeRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chargeBtn: { flex: 1, borderWidth: 1, borderColor: C.teal, borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  chargeT: { color: C.teal, fontWeight: '700', fontSize: 13 },
  planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  planName: { fontSize: 15, fontWeight: '700', color: C.ink },
  subBtn: { borderWidth: 1, borderColor: C.teal, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  subOn: { backgroundColor: C.teal },
  subT: { color: C.teal, fontWeight: '800', fontSize: 13 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  payAmt: { color: C.teal, fontWeight: '800', fontSize: 14 },
});
