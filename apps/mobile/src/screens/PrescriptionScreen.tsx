import { ScrollView, Text } from 'react-native';
import { SP, useUI } from '../theme';
import { HubMenu, useHub } from '../nav/hubMenu';

/**
 * 처방 탭 — 진단 결과로 **받는 것**(학습 플랜·강좌·자료실).
 *
 * 왜 대항목인가: 북극성이 진단 → **처방** → 실행 → 통과인데, 이전 축(홈·질문·진단·일정·내정보)
 * 에는 처방이 아예 없었다. 학습 자원이 '일정' 안에 섞여 있으면 "무엇을 볼지는 격차가 정한다"는
 * 순서가 메뉴에서 사라진다.
 *
 * 자리를 비워 두지 않는다: 아직 모바일에 없는 화면(학습 플랜)은 `webOnly` 행으로 남기고
 * 누르면 사유를 안내한다 — 빈 탭으로 두면 '처방 층이 비어 있다'는 사실이 아무에게도 안 보이고,
 * 결손은 보이지 않으면 채워지지 않는다. (강좌는 그렇게 남겨 뒀다가 O191 에서 실제로 채웠다.)
 */
export function PrescriptionScreen({ goTab, initial }: { goTab?: (t: string) => void; initial?: string | null }) {
  const ui = useUI();
  // 검색이 '처방 › 강좌'를 가리키면 허브를 건너뛰고 그 화면부터 연다.
  const hub = useHub('rx', { goTab, initial });
  if (hub.screen) return hub.screen;
  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>처방</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>
        진단이 찾은 격차를 메우는 학습 자원이에요. 무엇을 볼지는 목표·격차가 정합니다.
      </Text>
      <HubMenu items={hub.items} onPick={hub.open} />
    </ScrollView>
  );
}
