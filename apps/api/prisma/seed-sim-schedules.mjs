// 시뮬 페르소나(simt01~10, sims001~040)의 근무·상담가능 시간을 유형별로 다양화하는
// 시드 SQL 생성기. 패턴을 편집한 뒤 실행하면 seed-sim-schedules.sql 를 다시 만든다.
//
//   node prisma/seed-sim-schedules.mjs        # → prisma/seed-sim-schedules.sql
//   npm run seed:sim:schedules --workspace apps/api   # 위 SQL 을 DB 에 적용
//
// 형식: recurring_template / stay_time = { "0".."6": [{start,end,env}] }  (0=일 … 6=토, 다중 구간 가능)
// 주의: 대상 계정(simt*/sims*)이 없으면 해당 UPDATE 는 0건(무해). 페르소나 시드가 먼저 필요.
//
// env — 그 시간대에 가능한 상담 모드(O119③). 생략하면 consult-modes 의 보수적 기본값 'etc' = ['chat'] 라
// 화상(zoom)·필기공유(hand) 슬롯이 0개가 된다. 모드는 **선생님 창 × 학생 창의 교집합**이므로 양쪽 다 필요.
//   home ['video','voice','chat','whiteboard'] · academy ['voice','chat','whiteboard'](이어폰)
//   study/school ['chat','whiteboard'](소리 불가) · transit ['voice','chat'](판서 불가)
// 여기선 일부러 섞어 둔다 — 시뮬 로스터의 목적이 현실적인 분포다. 화상이 되는 학생은 집에서 붙는
// 주말집중·평일야간 계열뿐이고, 학원 상주 학생은 음성까지만 된다. 전원 화상이 필요한 시험이라면
// 아래 P[].env 를 'home' 으로 바꾸고 재생성할 것.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const w = (start, end, env = 'home') => ({ start, end, env });
const D = (obj) => JSON.stringify(obj);

// ── 선생님 근무(유형별) ──
//  정규: 평일 종일 · 파트: 일부 요일 짧게 · 컨설: 저녁 특정요일 · 대학생멘토: 띄엄띄엄(오전1h+저녁블록)
const teachers = {
  simt01: { 1: [w('09:00', '18:00')], 2: [w('09:00', '18:00')], 3: [w('09:00', '18:00')], 4: [w('09:00', '18:00')], 5: [w('09:00', '18:00')] }, // 정규
  simt02: { 1: [w('11:00', '20:00')], 2: [w('11:00', '20:00')], 3: [w('11:00', '20:00')], 4: [w('11:00', '20:00')], 5: [w('11:00', '20:00')] }, // 정규
  simt07: { 1: [w('13:00', '21:00')], 2: [w('13:00', '21:00')], 3: [w('13:00', '21:00')], 4: [w('13:00', '21:00')], 5: [w('13:00', '21:00')], 6: [w('13:00', '21:00')] }, // 정규(오후~저녁+토)
  simt03: { 1: [w('14:00', '18:00')], 3: [w('14:00', '18:00')], 5: [w('14:00', '18:00')] }, // 파트(월수금)
  simt09: { 2: [w('10:00', '13:00')], 4: [w('10:00', '13:00')], 6: [w('10:00', '15:00')] }, // 파트(화목+토)
  simt05: { 2: [w('15:00', '21:00')], 4: [w('15:00', '21:00')] }, // 컨설(화목 저녁)
  simt08: { 1: [w('16:00', '22:00')], 3: [w('16:00', '22:00')], 6: [w('13:00', '18:00')] }, // 컨설(월수 저녁+토)
  simt04: { 1: [w('07:00', '08:00'), w('19:00', '22:00')], 3: [w('19:00', '22:00')], 5: [w('07:00', '08:00'), w('20:00', '22:00')] }, // 대학생멘토(띄엄띄엄)
  simt06: { 2: [w('12:00', '13:00'), w('18:00', '21:00')], 4: [w('18:00', '21:00')], 6: [w('09:00', '12:00')] }, // 대학생멘토
  simt10: { 1: [w('21:00', '22:00')], 3: [w('21:00', '22:00')], 5: [w('21:00', '22:00')], 6: [w('09:00', '13:00')] }, // 대학생멘토(야간 1h)
};

// ── 학생 상담가능(체류) 분류 7종 → sims001~040 순환 배정 ──
//  env: 학원 상주 계열은 academy(이어폰 — 음성까지), 학교 시간대는 school(소리 불가),
//       집에서 붙는 주말집중·평일야간만 home(화상 가능). label 은 생성 SQL 주석에 남는다.
const P = [
  { name: '종일', env: 'academy', t: { 1: [w('09:00', '22:00', 'academy')], 2: [w('09:00', '22:00', 'academy')], 3: [w('09:00', '22:00', 'academy')], 4: [w('09:00', '22:00', 'academy')], 5: [w('09:00', '22:00', 'academy')] } },
  { name: '오전반', env: 'academy', t: { 1: [w('09:00', '13:00', 'academy')], 2: [w('09:00', '13:00', 'academy')], 3: [w('09:00', '13:00', 'academy')], 4: [w('09:00', '13:00', 'academy')], 5: [w('09:00', '13:00', 'academy')] } },
  { name: '오후반', env: 'academy', t: { 1: [w('13:00', '18:00', 'academy')], 2: [w('13:00', '18:00', 'academy')], 3: [w('13:00', '18:00', 'academy')], 4: [w('13:00', '18:00', 'academy')], 5: [w('13:00', '18:00', 'academy')] } },
  { name: '저녁반', env: 'academy', t: { 1: [w('17:00', '22:00', 'academy')], 2: [w('17:00', '22:00', 'academy')], 3: [w('17:00', '22:00', 'academy')], 4: [w('17:00', '22:00', 'academy')], 5: [w('17:00', '22:00', 'academy')] } },
  { name: '학교+학원분할', env: 'school+academy', t: { 1: [w('08:00', '12:00', 'school'), w('16:00', '20:00', 'academy')], 2: [w('08:00', '12:00', 'school'), w('16:00', '20:00', 'academy')], 3: [w('08:00', '12:00', 'school'), w('16:00', '20:00', 'academy')], 4: [w('08:00', '12:00', 'school'), w('16:00', '20:00', 'academy')], 5: [w('08:00', '12:00', 'school'), w('16:00', '20:00', 'academy')] } },
  { name: '주말집중', env: 'home', t: { 6: [w('09:00', '18:00', 'home')], 0: [w('09:00', '18:00', 'home')], 3: [w('18:00', '22:00', 'home')] } },
  { name: '평일야간', env: 'home', t: { 1: [w('19:00', '22:00', 'home')], 2: [w('19:00', '22:00', 'home')], 3: [w('19:00', '22:00', 'home')], 4: [w('19:00', '22:00', 'home')], 5: [w('19:00', '22:00', 'home')] } },
];

const out = [];
out.push('-- 시뮬 페르소나 근무·상담가능 시간 다양화 (생성기: prisma/seed-sim-schedules.mjs)');
out.push('-- 적용: npm run seed:sim:schedules --workspace apps/api');
out.push('-- 대상 계정이 없으면 각 UPDATE 는 0건(무해).');
out.push('');
out.push('-- 선생님 근무(정규/파트/컨설/대학생멘토) — env=home(전 모드): 상담 선생님은 화상이 가능해야 한다');
for (const [lid, tpl] of Object.entries(teachers)) {
  out.push(`UPDATE work_schedule SET recurring_template = '${D(tpl)}'::jsonb WHERE teacher_id = (SELECT id FROM account WHERE login_id='${lid}');`);
}
out.push('');
out.push('-- 학생 상담가능(체류)시간 7종 순환 (sims001~sims040)');
for (let i = 1; i <= 40; i++) {
  const lid = `sims${String(i).padStart(3, '0')}`;
  const p = P[(i - 1) % P.length];
  out.push(`UPDATE student_profile SET stay_time = '${D(p.t)}'::jsonb WHERE account_id = (SELECT id FROM account WHERE login_id='${lid}');  -- ${p.name} (env=${p.env})`);
}
out.push('');

const dir = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(dir, 'seed-sim-schedules.sql'), out.join('\n'));
console.log('seed-sim-schedules.sql 생성 완료:', teachers && Object.keys(teachers).length, '교사 + 40 학생');
