import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { R, SP, useTheme, useUI, type Palette } from '../theme';
import { useWebBack } from '../webBack';
import { AutomatchScreen } from '../screens/AutomatchScreen';
import { AutoAssignScreen } from '../screens/AutoAssignScreen';
import { ChatInboxScreen } from '../screens/ChatInboxScreen';
import { ClassifyScreen } from '../screens/ClassifyScreen';
import { GapReportScreen } from '../screens/GapReportScreen';
import { GoalScreen } from '../screens/GoalScreen';
import { LegalScreen } from '../screens/LegalScreen';
import { RecordsScreen } from '../screens/RecordsScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { ScoreInputScreen } from '../screens/ScoreInputScreen';
import { ScoresScreen } from '../screens/ScoresScreen';
import { TasksScreen } from '../screens/TasksScreen';

/**
 * 탭별 허브 항목의 **단일 정본** (웹 `src/nav/roleNav.ts` 의 짝).
 *
 * 왜 옮겼나: N30 이 탭을 5개로 줄일 때 갈 곳이 마땅치 않은 화면들을 **내정보에 모아 뒀다**.
 * 그 결과 내정보가 12개 허브가 되어, 웹 사이드바를 같은 축으로 재편하고 나니
 * **같은 이름의 대항목이 서로 다른 내용**을 담게 됐다(웹 내정보 4개 vs 모바일 12개).
 * 이름만 같고 내용이 다르면 동기화가 아니라 착시다.
 *
 * → 웹이 정한 축을 그대로 따른다:
 *     진단   내 위치를 아는 일 — 성적진단·격차·목표·내 성적·배치
 *     일정   시간을 쓰는 일 — 채팅·자동매칭·자동배정·할 일·상담 기록·상담 리포트
 *     내정보 계정에 관한 일 — 선생님 분류·약관(+ 구독·크레딧·알림은 MyScreen 본문)
 *
 * 화면 구현은 그대로다. 바뀌는 것은 **어느 탭에서 들어가는가**뿐이다.
 */

export type HubKey =
  | 'scoreInput' | 'gap' | 'goal' | 'scores'
  | 'chats' | 'automatch' | 'autoassign' | 'tasks' | 'records' | 'reports'
  | 'classify' | 'legal';

/** 모바일 탭 키 — `App.tsx` 의 학생 탭과 같다(dg 진단 · b 일정 · d 내정보). */
export type HubTab = 'dg' | 'b' | 'd';

export type HubItem = { key: HubKey; tab: HubTab; icon: string; title: string; desc: string };

/**
 * 순서가 곧 우선순위다. 성적 입력이 '진단' 맨 앞인 이유는 그대로다 —
 * 격차·목표·할 일이 **전부 성적에 의존**해서, 입력 경로가 없으면 그 화면들이 빈다.
 */
export const HUB_ITEMS: HubItem[] = [
  // ── 진단 — 내 위치를 아는 일 ──
  { key: 'scoreInput', tab: 'dg', icon: '📝', title: '성적진단', desc: '성적 한 번 입력 → 배치·격차·할 일 자동 반영' },
  { key: 'scores', tab: 'dg', icon: '📈', title: '내 성적·배치', desc: '성적 추이 + 예상 대학·학과 라인' },
  { key: 'gap', tab: 'dg', icon: '🎯', title: '격차 리포트', desc: '지금 위치 → 목표까지 과목별 격차와 처방' },
  { key: 'goal', tab: 'dg', icon: '🏁', title: '목표 설정', desc: '목표 대학·학과·평균 — 격차·할 일 기준' },

  // ── 일정 — 시간을 쓰는 일 ──
  { key: 'chats', tab: 'b', icon: '💬', title: '채팅', desc: '상담 대화 모아보기 — 안 읽은 메시지 확인' },
  { key: 'automatch', tab: 'b', icon: '⚡', title: '30분 자동 매칭', desc: '유형·방식만 고르면 7일 내 가장 빠른 30분' },
  { key: 'autoassign', tab: 'b', icon: '🗓', title: '자동배정 신청', desc: '시간 안 정해도 전임 선생님 근무시간에 배정' },
  { key: 'tasks', tab: 'b', icon: '✅', title: '할 일', desc: '약점·학사일정 자동 제안 + 직접 추가' },
  { key: 'records', tab: 'b', icon: '📝', title: '내 상담 기록', desc: '공개된 핵심요약·숙제·향후방향 확인' },
  { key: 'reports', tab: 'b', icon: '📋', title: '상담 리포트', desc: '녹음 동의 상담의 검수된 요약 리포트' },

  // ── 내정보 — 계정에 관한 일 ──
  { key: 'classify', tab: 'd', icon: '💚', title: '선생님 분류', desc: '나와 맞는 / 맞지 않는 선생님 관리' },
  { key: 'legal', tab: 'd', icon: '🔒', title: '약관·개인정보', desc: '약관·방침·동의·데이터 내보내기·회원 탈퇴' },
];

export const itemsOf = (tab: HubTab): HubItem[] => HUB_ITEMS.filter((i) => i.tab === tab);

type HostArgs = {
  /** 성적 노출 정책 — 격차·성적 화면이 배치 표시 여부를 이 값으로 정한다. */
  showPlacement?: boolean;
  goTab?: (t: string) => void;
  /** 서브화면에서 돌아올 때 부모 데이터를 다시 읽어야 하는 경우. */
  onReload?: () => void;
  onMessage?: (m: string) => void;
};

/**
 * 탭 하나의 허브 — 항목 목록 + 선택된 서브화면 렌더를 함께 돌려준다.
 * 서브화면이 열려 있으면 `screen` 이 채워지고, 호출측은 그것만 그리면 된다.
 */
export function useHub(tab: HubTab, args: HostArgs = {}) {
  const [key, setKey] = useState<HubKey | null>(null);
  const back = () => setKey(null);
  const reload = () => { setKey(null); args.onReload?.(); };
  // 웹 빌드에서 브라우저 뒤로가기가 허브로 복귀하게 한다(하위 화면 우선).
  useWebBack(key !== null, back);

  const screen = (() => {
    switch (key) {
      case 'scoreInput': return <ScoreInputScreen onBack={reload} />;
      case 'scores': return <ScoresScreen onBack={back} showPlacement={args.showPlacement ?? false} />;
      case 'gap': return <GapReportScreen onBack={back} showPlacement={args.showPlacement ?? false} goTab={args.goTab} />;
      case 'goal': return <GoalScreen onBack={reload} />;
      case 'chats': return <ChatInboxScreen onBack={reload} />;
      case 'automatch': return <AutomatchScreen onBack={back} onBooked={() => { reload(); args.onMessage?.('자동 매칭으로 예약이 신청되었습니다. 내 예약에서 확인하세요.'); }} />;
      case 'autoassign': return <AutoAssignScreen onBack={back} />;
      case 'tasks': return <TasksScreen onBack={back} goTab={args.goTab} />;
      case 'records': return <RecordsScreen onBack={back} />;
      case 'reports': return <ReportsScreen onBack={back} />;
      case 'classify': return <ClassifyScreen onBack={back} />;
      case 'legal': return <LegalScreen onBack={back} onWithdrawn={() => { if (typeof window !== 'undefined') window.location.reload(); }} />;
      default: return null;
    }
  })();

  return { items: itemsOf(tab), open: setKey, screen, isOpen: key !== null };
}

/** 허브 항목 목록. `badge` 는 채팅 미확인 수처럼 항목에 붙는 숫자. */
export function HubMenu({
  items,
  onPick,
  badges,
  title,
}: {
  items: HubItem[];
  onPick: (k: HubKey) => void;
  badges?: Partial<Record<HubKey, number>>;
  title?: string;
}) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);
  if (!items.length) return null;
  return (
    <View>
      {title ? <Text style={s.head}>{title}</Text> : null}
      {items.map((m) => {
        const n = badges?.[m.key] ?? 0;
        return (
          <TouchableOpacity key={m.key} style={[ui.card, s.row]} activeOpacity={0.75} onPress={() => onPick(m.key)}>
            <Text style={s.icon}>{m.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>
                {m.title}
                {n > 0 ? `  🔴 ${n > 99 ? '99+' : n}` : ''}
              </Text>
              <Text style={s.desc}>{m.desc}</Text>
            </View>
            <Text style={s.chev}>›</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    head: { fontSize: 12.5, fontWeight: '700', color: C.muted, marginTop: SP.lg, marginBottom: SP.sm, letterSpacing: 0.3 },
    row: { flexDirection: 'row', alignItems: 'center', gap: SP.md, marginBottom: SP.sm, borderRadius: R.md },
    icon: { fontSize: 20, width: 26, textAlign: 'center' },
    title: { fontSize: 14.5, fontWeight: '700', color: C.ink },
    desc: { fontSize: 12, color: C.muted, marginTop: 2 },
    chev: { fontSize: 20, color: C.muted },
  });
