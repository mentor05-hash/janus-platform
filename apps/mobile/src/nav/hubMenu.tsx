import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TAB_LABEL, itemsOf, jumpOf, webOnlyOf, type HubKey, type HubItem, type HubTab } from '@mentoring/nav';
import { showAlert } from '../lib/alertHost';
import { R, SP, useTheme, useUI, type Palette } from '../theme';
import { useWebBack } from '../webBack';
import { AutomatchScreen } from '../screens/AutomatchScreen';
import { AutoAssignScreen } from '../screens/AutoAssignScreen';
import { ChatInboxScreen } from '../screens/ChatInboxScreen';
import { ClassifyScreen } from '../screens/ClassifyScreen';
import { GapReportScreen } from '../screens/GapReportScreen';
import { GoalScreen } from '../screens/GoalScreen';
import { LectureScreen } from '../screens/LectureScreen';
import { LegalScreen } from '../screens/LegalScreen';
import { RecordsScreen } from '../screens/RecordsScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { ScoreInputScreen } from '../screens/ScoreInputScreen';
import { ScoresScreen } from '../screens/ScoresScreen';
import { TasksScreen } from '../screens/TasksScreen';

/**
 * 탭 하나의 허브 — **렌더 부분**. 항목 데이터는 `@mentoring/nav` 가 정본이다.
 *
 * 데이터를 패키지로 뺀 이유(2026-07-30): 웹 `roleNav` 와 이 파일이 각 앱 안에 있어
 * **주석으로만 짝**이었고, 웹 테스트가 모바일 이탈을 보지 못했다. 이제 한 테스트가
 * 양쪽을 대조한다. 여기 남은 것은 RN 에 묶인 것(화면 스위치·터치 UI)뿐이다.
 */

export { HUB_ITEMS, SATELLITE_PARENT, TAB_LABEL, itemsOf, type HubKey, type HubItem, type HubTab } from '@mentoring/nav';

type HostArgs = {
  /**
   * 처음부터 열어 둘 하위 화면 — 통합검색이 '처방 › 강좌' 처럼 **허브 안쪽**을 가리킬 때 쓴다.
   * 탭만 열고 목록을 다시 찾게 하면 서버가 준 목적지의 절반만 지킨 것이다.
   */
  initial?: string | null;
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
  // 바깥에서 온 값(검색 결과)이라 **이 탭에 실제로 있는 항목인지 확인하고** 받는다 —
  // 캐스팅으로 밀어 넣으면 오타 하나가 빈 화면이 된다.
  const valid = itemsOf(tab).some((i) => i.key === args.initial) ? (args.initial as HubKey) : null;
  const [key, setKey] = useState<HubKey | null>(valid);
  const back = () => setKey(null);
  const reload = () => { setKey(null); args.onReload?.(); };
  const bl = `‹ ${TAB_LABEL[tab]}`; // 하위 화면이 "어디로 돌아가는지"를 이 탭에서 정한다
  // 웹 빌드에서 브라우저 뒤로가기가 허브로 복귀하게 한다(하위 화면 우선).
  useWebBack(key !== null, back);

  /** 항목 선택 — `jump` 는 다른 탭으로, `webOnly` 는 안내로. 없는 화면을 여는 척하지 않는다. */
  const open = (k: HubKey) => {
    const jump = jumpOf(k);
    if (jump) { args.goTab?.(jump); return; }
    const web = webOnlyOf(k);
    if (web) { showAlert('웹에서 확인해 주세요', web); return; }
    setKey(k);
  };

  const screen = (() => {
    switch (key) {
      case 'scoreInput': return <ScoreInputScreen onBack={reload} backLabel={bl} />;
      case 'scores': return <ScoresScreen onBack={back} showPlacement={args.showPlacement ?? false} backLabel={bl} />;
      case 'gap': return <GapReportScreen onBack={back} showPlacement={args.showPlacement ?? false} goTab={args.goTab} backLabel={bl} />;
      case 'goal': return <GoalScreen onBack={reload} backLabel={bl} />;
      case 'chats': return <ChatInboxScreen onBack={reload} backLabel={bl} />;
      case 'automatch': return <AutomatchScreen onBack={back} backLabel={bl} onBooked={() => { reload(); args.onMessage?.('자동 매칭으로 예약이 신청되었습니다. 내 예약에서 확인하세요.'); }} />;
      case 'autoassign': return <AutoAssignScreen onBack={back} backLabel={bl} />;
      case 'tasks': return <TasksScreen onBack={back} goTab={args.goTab} backLabel={bl} />;
      case 'records': return <RecordsScreen onBack={back} backLabel={bl} />;
      case 'reports': return <ReportsScreen onBack={back} backLabel={bl} />;
      case 'classify': return <ClassifyScreen onBack={back} backLabel={bl} />;
      case 'lectures': return <LectureScreen onBack={back} backLabel={bl} />;
      case 'legal': return <LegalScreen onBack={back} backLabel={bl} onWithdrawn={() => { if (typeof window !== 'undefined') window.location.reload(); }} />;
      default: return null;
    }
  })();

  return { items: itemsOf(tab), open, screen, isOpen: key !== null };
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
                {m.webOnly ? '  웹' : ''}
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
