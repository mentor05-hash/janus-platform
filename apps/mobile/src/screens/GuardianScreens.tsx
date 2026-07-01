import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Child, ChildCredits, Note, PaymentRequest } from '../api';
import { C, R, SP, ui } from '../theme';

const won = (n: number) => `${n.toLocaleString()}원`;
const fmt = (n: number) => n.toLocaleString();
const KST = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const DKST = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }) : '');

type Props = { children: Child[]; activeId: string | null; setActiveId: (id: string) => void; goTab?: (t: string) => void };

function KidSwitcher({ children, activeId, setActiveId }: Props) {
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

const TX_META: Record<string, { label: string; sign: 1 | -1; color: string }> = {
  charge: { label: '크레딧 충전', sign: 1, color: C.done },
  refund: { label: '크레딧 환원', sign: 1, color: C.done },
  weekly_grant: { label: '주간 크레딧 부여', sign: 1, color: C.done },
  spend: { label: '크레딧 차감', sign: -1, color: C.ink },
  weekly_expire: { label: '주간 크레딧 소멸', sign: -1, color: C.confirmed },
};

export function GuardianHome({ children, setActiveId, goTab }: Props) {
  const [reqs, setReqs] = useState<PaymentRequest[]>([]);
  useEffect(() => { api.get<PaymentRequest[]>('/payment-requests').then((r) => setReqs(Array.isArray(r) ? r : [])).catch(() => {}); }, []);
  const open = reqs.filter((r) => r.status === 'open');
  const nameOf = (sid: string) => children.find((c) => c.studentId === sid)?.name ?? '자녀';

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>학부모님 👋</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>자녀의 상담과 크레딧을 한눈에 확인하세요.</Text>

      {open.length > 0 && (
        <TouchableOpacity style={[ui.card, s.reqBanner]} onPress={() => { setActiveId(open[0].student_id); goTab?.('d'); }}>
          <Text style={s.reqT}>💳 결제요청 {open.length}건</Text>
          <Text style={s.sub}>{nameOf(open[0].student_id)} · 크레딧이 부족해요 · 탭하여 응답</Text>
        </TouchableOpacity>
      )}

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
    </ScrollView>
  );
}

export function GuardianConsult({ children, activeId, setActiveId }: Props) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!activeId) return;
    setNotes(null);
    api.get<Note[]>(`/students/${activeId}/notes`).then(setNotes).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [activeId]);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>상담 내용</Text>
      <KidSwitcher children={children} activeId={activeId} setActiveId={setActiveId} />
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
        <Text style={{ color: '#cfe3ec', fontSize: 12 }}>{active?.name} 잔여 크레딧</Text>
        <Text style={s.creditNum}>{fmt(data?.account.total ?? active?.balance ?? 0)}</Text>
        <Text style={{ color: '#cfe3ec', fontSize: 11, marginTop: 3 }}>이번 주 부여분 {fmt(active?.weeklyCredits ?? 0)} · 일요일 24:00 소멸 예정</Text>
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

const s = StyleSheet.create({
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
