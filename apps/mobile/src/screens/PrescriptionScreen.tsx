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
 * ⚠ 지금 모바일에 실제로 있는 것은 자료실 하나다. 나머지 둘(학습 플랜·강좌)은 **자리를 비우지
 * 않고** 웹 안내 행으로 남긴다 — 빈 탭으로 두면 '처방 층이 비어 있다'는 사실이 아무에게도
 * 안 보이고, 결손은 보이지 않으면 채워지지 않는다.
 */
export function PrescriptionScreen({ goTab }: { goTab?: (t: string) => void }) {
  const ui = useUI();
  const hub = useHub('rx', { goTab });
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
