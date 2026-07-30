import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { R, SP, useTheme, useUI, type Palette } from '../theme';
import { useWebBack } from '../webBack';

/**
 * 배치표 허브 — 진단 탭 하위. 웹 `PlacementHubPage` 의 **이식 가능한 부분만** 옮겼다.
 *
 * **왜 그대로 옮기지 않았나**: 웹 허브의 본체는 `JANUS_DATA_DIR` 에서 서빙되는 **전체 표 HTML 을
 * iframe 으로 띄우는 것**이다(일회성 티켓 + 워터마크). 폰에는 iframe 이 없고, WebView 로 데스크톱
 * 폭의 표를 띄우면 가로 스크롤 지옥이 된다 — 옮겨도 쓸 수 없는 화면이 된다.
 *
 * → **thin-slice 검색**(O76)만 가져왔다. 서버가 검색 일치 행만(요청당 30행·계정당 600행/일)
 * 돌려주는 경로라 폰에 맞고, 전체 표를 내려받지 않아 재배포 위험도 낮다. 전체 표가 필요하면
 * **웹에서 보라고 말한다**(없는 걸 있는 척하지 않는다 — O186 ①·O189 와 같은 원칙).
 *
 * ⚠ 티어 잠금은 **서버가 진짜 게이트**다(`slice`·`ticket` 발급 시 검증). 여기 표시는 UX 용이고,
 * 잠긴 표를 눌러도 서버가 403 을 준다 — 그래서 잠긴 표는 **열지 않고 사유를 보여준다**.
 *
 * ⚠ 저작권 데이터(C6)는 이 repo 에 없다. 데이터 미배치 환경에서는 `available:false` 가 정상이며,
 * 그 상태를 '오류'가 아니라 '준비 중'으로 보여주는 것이 이 화면의 기본 동작이다.
 */

type HubMeta = {
  slug: string; title: string; short?: string; icon?: string; kind?: string;
  updated?: string; badge?: string; tier?: string; audience?: string;
};
type HubList = { available: boolean; tables: HubMeta[] };
type Row = Record<string, unknown>;
type SliceRes = { available: boolean; total: number; rows: Row[]; capped: boolean; remainingToday?: number };

/** 알려진 필드의 한글 헤더 — 웹 `PlacementSlicePanel` 과 같은 표(다르면 두 화면이 다른 말을 한다). */
const HEAD: Record<string, string> = {
  univ: '대학', dept: '학과(모집단위)', track: '군·전형', region: '지역',
  cut: '컷', cutNb: '누백컷', cutGrade: '등급컷', nb: '누백', grade: '등급', band: '밴드', pred: '예측선', memo: '비고',
};
const PREF = ['univ', 'dept', 'track', 'region'];
const TIER_LABEL: Record<string, string> = { free: '무료', member: '회원', paid: '유료 회원', consultant: '컨설턴트' };
const TIER_RANK: Record<string, number> = { free: 0, member: 1, paid: 2, consultant: 3 };
const requiredTier = (t: HubMeta) => (t.tier === 'member' || t.tier === 'paid' || t.tier === 'consultant' ? t.tier : 'free');

function columnsOf(rows: Row[]): string[] {
  const keys = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  const rest = [...keys].filter((k) => !PREF.includes(k));
  return [...PREF.filter((k) => keys.has(k)), ...rest];
}
const cell = (v: unknown) => (v === null || v === undefined || v === '' ? '-' : String(v));

export function PlacementHubScreen({
  onBack,
  backLabel = '‹ 진단',
  role,
}: {
  onBack: () => void;
  backLabel?: string;
  /** 뷰어 티어 판정용(웹 `tierForRole` 미러) — 표시만, 게이트는 서버다. */
  role?: string;
}) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => mk(C), [C]);
  const [list, setList] = useState<HubList | null>(null);
  const [open, setOpen] = useState<HubMeta | null>(null);
  const [error, setError] = useState('');

  useWebBack(open !== null, () => setOpen(null));

  useEffect(() => {
    api.get<HubList>('/placement-hub/list')
      .then((r) => setList({ available: !!r.available, tables: Array.isArray(r.tables) ? r.tables : [] }))
      .catch((e) => { setError(e instanceof ApiError ? e.message : '허브 조회 실패'); setList({ available: false, tables: [] }); });
  }, []);

  const viewerTier = !role ? 'free' : role === 'admin' || role === 'hr' ? 'consultant' : 'member';
  const canOpen = (t: HubMeta) => {
    if (t.audience === 'internal') return viewerTier === 'consultant'; // O77 — 내부용은 관리자만
    return TIER_RANK[viewerTier] >= TIER_RANK[requiredTier(t)];
  };

  if (open) return <SlicePanel table={open} onBack={() => setOpen(null)} />;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={s.back}>{backLabel}</Text></TouchableOpacity>
      <Text style={ui.h}>배치표 허브</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>대학·학과를 검색해 지원 가능선을 확인해요.</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}

      {list === null ? (
        <View style={{ paddingVertical: SP.xl }}><ActivityIndicator color={C.teal} /></View>
      ) : !list.available || list.tables.length === 0 ? (
        // 데이터 미배치는 **오류가 아니라 정상 상태**다(C6 — 저작권 자료는 서버에 별도 배치).
        <View style={ui.card}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: C.ink }}>배치표 준비 중</Text>
          <Text style={[ui.sub, { marginTop: 6 }]}>
            이 환경에는 배치표 자료가 아직 올라가 있지 않아요. 자료가 배치되면 여기에서 바로 검색할 수 있어요.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {list.tables.map((t) => {
            const locked = !canOpen(t);
            return (
              <TouchableOpacity
                key={t.slug}
                style={[ui.card, locked && s.lockedCard]}
                activeOpacity={locked ? 1 : 0.75}
                onPress={() => { if (!locked) setOpen(t); }}
              >
                <View style={s.row}>
                  <Text style={s.icon}>{t.icon ?? '▦'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>{t.short ?? t.title}</Text>
                    <Text style={[ui.sub, { fontSize: 12 }]}>
                      {t.updated ? `${t.updated} 기준` : '갱신일 미상'}
                      {t.badge ? ` · ${t.badge}` : ''}
                    </Text>
                  </View>
                  {requiredTier(t) !== 'free' ? (
                    <Text style={locked ? s.badgeLock : s.badgeTier}>
                      {locked ? '🔒 ' : ''}{TIER_LABEL[requiredTier(t)]}
                    </Text>
                  ) : null}
                  {!locked ? <Text style={s.chev}>›</Text> : null}
                </View>
                {locked ? (
                  // 눌러도 서버가 403 을 주는 자리 — 열지 않고 이유를 말한다.
                  <Text style={[ui.sub, { marginTop: 8, fontSize: 12 }]}>
                    {t.audience === 'internal'
                      ? '내부 전용 자료예요.'
                      : `${TIER_LABEL[requiredTier(t)]} 이상에게 열려요. 상품을 구매하면 바로 볼 수 있어요.`}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
          <Text style={[ui.sub, { fontSize: 12, marginTop: 4 }]}>
            표 전체를 펼쳐 보려면 웹의 [배치표 허브]를 이용하세요 — 폰에서는 검색으로 필요한 줄만 봅니다.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

/** thin-slice 검색 — 검색어 2자 이상, 서버가 일치 행만 준다(요청당 30행·계정당 600행/일). */
function SlicePanel({ table, onBack }: { table: HubMeta; onBack: () => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => mk(C), [C]);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SliceRes | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback((term: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (term.trim().length < 2) { setRes(null); setError(''); return; }
    // 디바운스 — 한 글자마다 치면 일일 행 상한(600)을 검색만으로 태운다.
    timer.current = setTimeout(() => {
      setBusy(true); setError('');
      api.get<SliceRes>(`/placement-hub/slice/${table.slug}?q=${encodeURIComponent(term.trim())}`)
        .then(setRes)
        .catch((e) => { setRes(null); setError(e instanceof ApiError ? e.message : '조회에 실패했어요.'); })
        .finally(() => setBusy(false));
    }, 400);
  }, [table.slug]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const cols = res?.rows?.length ? columnsOf(res.rows) : [];

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={s.back}>‹ 배치표 목록</Text></TouchableOpacity>
      <Text style={ui.h}>{table.short ?? table.title}</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>
        대학·학과를 2자 이상 입력하면 해당 줄만 보여드려요.{table.updated ? ` (${table.updated} 기준)` : ''}
      </Text>

      <TextInput
        style={ui.input}
        value={q}
        onChangeText={(v) => { setQ(v); run(v); }}
        placeholder="예: 서울대 경영"
        placeholderTextColor={C.muted}
        returnKeyType="search"
        onSubmitEditing={() => run(q)}
      />
      {error ? <Text style={ui.error}>{error}</Text> : null}

      {busy ? (
        <View style={{ paddingVertical: SP.lg }}><ActivityIndicator color={C.teal} /></View>
      ) : q.trim().length < 2 ? (
        <Text style={[ui.sub, { marginTop: SP.md }]}>검색어를 2자 이상 입력해 주세요.</Text>
      ) : res === null ? null : !res.available ? (
        <View style={[ui.card, { marginTop: SP.md }]}>
          <Text style={ui.sub}>이 표는 아직 검색 자료가 준비되지 않았어요. 웹의 [배치표 허브]에서 전체 표로 볼 수 있어요.</Text>
        </View>
      ) : res.rows.length === 0 ? (
        <Text style={[ui.sub, { marginTop: SP.md }]}>‘{q.trim()}’ 결과가 없어요. 학교 이름 일부만 넣어 보세요.</Text>
      ) : (
        <View style={{ marginTop: SP.md, gap: 8 }}>
          <Text style={[ui.sub, { fontSize: 12 }]}>
            {res.total}건 중 {res.rows.length}건
            {res.capped ? ' · 더 있으면 검색어를 좁혀 주세요' : ''}
            {res.remainingToday != null ? ` · 오늘 남은 조회 ${res.remainingToday}줄` : ''}
          </Text>
          {res.rows.map((r, i) => (
            <View key={i} style={ui.card}>
              {cols.map((k) => (
                <View key={k} style={s.kv}>
                  <Text style={s.k}>{HEAD[k] ?? k}</Text>
                  <Text style={s.v}>{cell(r[k])}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const mk = (C: Palette) => StyleSheet.create({
  back: { color: C.teal, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { fontSize: 20, width: 26, textAlign: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: C.ink },
  chev: { fontSize: 20, color: C.muted },
  lockedCard: { opacity: 0.72 },
  badgeTier: { fontSize: 11, fontWeight: '800', color: C.blue, backgroundColor: C.blueSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  badgeLock: { fontSize: 11, fontWeight: '800', color: '#8A5A00', backgroundColor: 'rgba(207,154,58,.16)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  kv: { flexDirection: 'row', gap: 10, paddingVertical: 3 },
  k: { width: 96, fontSize: 12, fontWeight: '700', color: C.muted },
  v: { flex: 1, fontSize: 13.5, color: C.ink },
});
