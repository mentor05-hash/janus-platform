import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// apps/web/public/site — 웹앱이 정적 서빙하는 마케팅 라우트 대상.
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'site') + '/';
mkdirSync(DIR, { recursive: true });
const OVERVIEW = '/services';           // 연계 서비스 개요(실라우트)
const LOGIN = '/login';                 // 로그인(실라우트)
const APPLY = '/consulting/apply';      // 대입 컨설팅 실제 신청 폼(실라우트)

// iframe 안에서 절대경로(앱) 링크는 최상위 창(SPA)으로 이동해야 함 → target="_top" 주입.
// 해시 앵커(#apply 등)는 iframe 내부 스크롤이므로 제외. 재실행해도 idempotent.
const topify = (html) =>
  html
    .replace(/href="(\/[^"#][^"]*)"/g, 'href="$1" target="_top"')
    .replace(/href="(\/)"/g, 'href="$1" target="_top"');

const S = [
  {id:'consulting', file:'svc-consulting.html', cat:'프리미엄 전략', icon:'🎓', name:'대입 컨설팅',
   tag:['live','운영 중'], cta:['상담 신청하기','primary'], href:APPLY,
   lead:'학생부·성적·지망을 종합해 수시·정시 전 과정을 설계하는 1:1 프리미엄 컨설팅. 전략 수립부터 원서 접수까지 전담 멘토가 함께합니다.',
   feats:[['🧭','종합 진단 & 로드맵','내신·모의고사·학생부·희망 진로를 종합 분석해 학년별 입시 로드맵을 설계합니다.'],
          ['🗂️','수시·정시 지원 설계','수시 6장과 정시 지원 조합을 안정·적정·소신으로 나눠 전략화합니다.'],
          ['🤝','전담 멘토 밀착 관리','원서 접수·서류·면접까지 전담 멘토가 일정과 준비를 함께 챙깁니다.']],
   link:'배치표·성적 분석·자소서 첨삭이 <b>컨설팅 하나로 묶여</b> 흐릅니다 — 진단에서 원서 접수까지 담당 멘토가 전 과정을 책임집니다.',
   extra:`
<section class="block">
  <div class="wrap">
    <h2>컨설팅 패키지</h2>
    <p class="sub">목표와 시기에 맞춰 선택하세요</p>
    <div class="pricing">
      <div class="ptier reveal">
        <span class="pname">단건 진단</span>
        <div class="price">15만원 <small>/ 90분 1회</small></div>
        <p class="pdesc">지금 내 위치를 빠르게 진단</p>
        <ul class="plist">
          <li>성적·학생부 종합 진단 1회</li>
          <li>지원 가능선·전략 방향 리포트</li>
          <li>배치표 결과 함께 리뷰</li>
        </ul>
        <a class="btn ghost" href="#apply">상담 신청</a>
      </div>
      <div class="ptier pop reveal">
        <span class="pbadge">인기</span>
        <span class="pname">시즌 정기권</span>
        <div class="price">48만원 <small>/ 월</small></div>
        <p class="pdesc">수시·정시 시즌 밀착 관리</p>
        <ul class="plist">
          <li>월 4회 정기 컨설팅</li>
          <li>배치표·성적 분석 상시 연동</li>
          <li>지원 전략 수립·수정 무제한</li>
          <li>전담 멘토 채팅 문의</li>
        </ul>
        <a class="btn primary" href="#apply">상담 신청</a>
      </div>
      <div class="ptier reveal">
        <span class="pname">종합 전담</span>
        <div class="price">맞춤 견적</div>
        <p class="pdesc">학년 전 과정 원스톱</p>
        <ul class="plist">
          <li>정기 관리 + 자소서·면접 첨삭</li>
          <li>원서 접수 전 과정 동행</li>
          <li>학부모 정기 리포트</li>
        </ul>
        <a class="btn ghost" href="#apply">견적 문의</a>
      </div>
    </div>
    <p class="pnote">* 표시 금액은 예시이며 실제 정책·학원별 계약에 따라 조정될 수 있습니다.</p>
  </div>
</section>

<section class="block alt" id="apply">
  <div class="wrap">
    <h2>상담 신청</h2>
    <p class="sub">남겨주시면 전담 멘토가 1영업일 내 연락드립니다</p>
    <form class="form reveal" id="consultForm" novalidate>
      <div class="grid2">
        <div class="field"><label for="c-name">이름 *</label><input id="c-name" name="name" required autocomplete="name" placeholder="학생 또는 학부모 성함"></div>
        <div class="field"><label for="c-phone">연락처 *</label><input id="c-phone" name="phone" required inputmode="tel" autocomplete="tel" placeholder="010-0000-0000"></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="c-grade">학년</label><select id="c-grade" name="grade"><option value="">선택</option><option>고1</option><option>고2</option><option>고3</option><option>N수</option><option>기타</option></select></div>
        <div class="field"><label for="c-type">관심 유형</label><select id="c-type" name="type"><option value="">선택</option><option>수시</option><option>정시</option><option>수시·정시 종합</option><option>자소서·면접</option></select></div>
      </div>
      <div class="field"><label for="c-msg">문의 내용</label><textarea id="c-msg" name="message" placeholder="현재 성적, 목표 대학, 궁금한 점 등을 자유롭게 적어주세요."></textarea></div>
      <label class="agree"><input type="checkbox" id="c-agree" name="agree"><span>상담을 위한 개인정보 수집·이용에 동의합니다. (필수)</span></label>
      <button class="btn primary" type="submit" style="width:100%;justify-content:center">상담 신청하기</button>
      <div class="formmsg" id="formMsg" role="status">신청이 접수되었습니다. 곧 연락드리겠습니다. <span style="font-weight:600;opacity:.8">(데모 — 실제로 전송되지 않습니다)</span></div>
    </form>
  </div>
</section>`},

  {id:'baechi', file:'svc-baechi.html', cat:'지원 전략', icon:'📈', name:'대학 배치표',
   tag:['soon','연동 예정'], cta:['연동 알림 받기','primary'],
   lead:'성적을 넣으면 지원 가능한 대학·학과가 한눈에. 상담 멘토와 함께 안정·적정·소신 라인을 설계합니다.',
   feats:[['🎯','지원 가능선','내신·모의고사 성적과 백분위를 넣으면 지원 가능한 대학·학과 범위를 즉시 계산합니다.'],
          ['📶','합격 예측','대학·학과별로 안정·적정·소신을 색으로 구분해, 지원 전략을 균형 있게 짭니다.'],
          ['⭐','관심 대학 비교','관심 대학을 담아 전형·경쟁률·입결을 나란히 비교하고 멘토와 공유합니다.']],
   link:'상담에서 정한 <b>목표 대학</b>이 배치표에 자동으로 이어지고, 멘토가 배치 결과를 보며 상담합니다. 배치표 → 상담 → 강의로 흐름이 끊기지 않습니다.'},

  {id:'ganggi', file:'svc-ganggi.html', cat:'학습', icon:'🎬', name:'인터넷 강의',
   tag:['soon','연동 예정'], cta:['연동 알림 받기','primary'],
   lead:'상담에서 짚은 약점을 바로 강의로. 추천 인강을 잇올 계정으로 수강하고 진도를 관리합니다.',
   feats:[['🧭','맞춤 추천','취약 과목·단원에 맞는 강의를 추천합니다. 어디서부터 들어야 할지 고민할 필요가 없습니다.'],
          ['📼','진도 관리','수강 진도와 완료율을 한곳에서. 밀린 강의와 다음 강의를 자동으로 안내합니다.'],
          ['🔁','상담 ↔ 강의','상담 숙제가 강의로, 강의 이해도가 다시 상담으로 — 학습이 끊기지 않고 순환합니다.']],
   link:'멘토가 지정한 <b>학습 방향</b>이 강의 커리큘럼으로 연결되고, 진도는 멘토·학부모와 공유됩니다.'},

  {id:'mock', file:'svc-mock.html', cat:'성적 관리', icon:'📊', name:'모의고사 · 성적 분석',
   tag:['prep','준비 중'], cta:['출시 알림 받기','ghost'],
   lead:'모의고사 성적을 등급·백분위 추이로 관리하고, 취약 단원을 자동 진단해 상담·강의로 잇습니다.',
   feats:[['📈','성적 추이','회차별 등급·백분위·원점수를 그래프로. 오르는 과목과 정체된 과목이 한눈에 보입니다.'],
          ['🔍','취약점 진단','과목·단원별로 약한 부분을 자동 분석해, 무엇을 먼저 보완할지 짚어줍니다.'],
          ['🎯','목표 격차','목표 대학 기준선과 현재 성적의 격차를 리포트로 제공합니다.']],
   link:'진단 결과가 <b>배치표·강의·상담</b>으로 자동 연계됩니다 — 약점 발견에서 보완까지 한 흐름.'},

  {id:'ipgyeol', file:'svc-ipgyeol.html', cat:'입시 정보', icon:'🏛️', name:'입결 · 경쟁률',
   tag:['prep','준비 중'], cta:['출시 알림 받기','ghost'],
   lead:'대학·학과별 입시 결과와 경쟁률, 전형 일정을 한곳에서. 배치표와 함께 지원 판단을 돕습니다.',
   feats:[['📋','최근 입결','최근 년도 등급컷·백분위 등 합격선 데이터를 대학·학과별로 정리합니다.'],
          ['👥','경쟁률','수시·정시 경쟁률 추이로 지원 쏠림과 안전 지원을 판단합니다.'],
          ['🗓️','전형 일정','원서 접수·전형·발표 일정을 캘린더로 놓치지 않게.']],
   link:'배치표·상담과 함께 봐서 <b>근거 있는 지원 전략</b>을 세웁니다.'},

  {id:'jaso', file:'svc-jaso.html', cat:'수시 대비', icon:'✍️', name:'자소서 · 면접 첨삭',
   tag:['partner','파트너 모집'], cta:['파트너 문의','ghost'],
   lead:'전문 멘토의 자기소개서·면접 첨삭. 멘토링과 자연스럽게 이어지는 수시 준비.',
   feats:[['📝','문항별 첨삭','자기소개서를 문항별로 첨삭하고, 수정 이력을 남겨 발전 과정을 봅니다.'],
          ['🎤','모의 면접','실전형 모의 면접과 피드백으로 면접 대비를 완성합니다.'],
          ['📚','학생부 연계','학생부 기반으로 강점을 살리는 서류·면접 전략을 짭니다.']],
   link:'담당 멘토와 <b>연속 상담</b>으로 이어지고, 첨삭 이력이 상담 기록에 함께 쌓입니다.'},

  {id:'planner', file:'svc-planner.html', cat:'플래너', icon:'🗂️', name:'학습 플래너',
   tag:['partner','파트너 모집'], cta:['파트너 문의','ghost'],
   lead:'상담에서 정한 목표를 주간 플랜으로. 진도와 공부량을 멘토와 공유합니다.',
   feats:[['🗓️','주·일 플랜','목표에서 역산한 주간·일일 학습 계획을 자동으로 제안합니다.'],
          ['⏱️','진도·시간 기록','과목별 진도와 공부 시간을 기록해 실천을 눈으로 확인합니다.'],
          ['🤝','멘토 공유','플랜과 실천을 멘토가 함께 보며 피드백합니다.']],
   link:'상담 목표가 <b>플랜으로 자동 생성</b>되고, 멘토가 실천을 모니터링합니다.'},
];

const CSS = `
  :root{--ink:#0e2a38;--body:#3c515a;--muted:#6b7f88;--teal:#0e5c7c;--teal-d:#0a3d52;--gold:#e8a63d;--gold-d:#c98a25;--bg:#f4f7f8;--card:#fff;--tint:#eaf1f3;--line:#e0e8eb;--line-2:#eef3f4;--navy:#0b2733;--navy-2:#0f3444;--good:#1e7a4d;--maxw:1000px}
  *{box-sizing:border-box}html{scroll-behavior:smooth}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:'Pretendard','Apple SD Gothic Neo','Malgun Gothic',-apple-system,system-ui,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
  a{color:inherit;text-decoration:none}
  .wrap{max-width:var(--maxw);margin:0 auto;padding:0 24px}
  .btn{display:inline-flex;align-items:center;gap:7px;border-radius:11px;padding:12px 20px;font-weight:800;font-size:15px;cursor:pointer;border:1px solid transparent;transition:transform .12s,background .15s}
  .btn:hover{transform:translateY(-1px)}
  .btn.primary{background:var(--gold);color:#241703;box-shadow:0 6px 18px rgba(232,166,61,.26)}.btn.primary:hover{background:var(--gold-d)}
  .btn.ghost{background:transparent;border:1px solid var(--line);color:var(--ink)}.btn.ghost:hover{background:var(--line-2)}
  .btn.sm{padding:9px 15px;font-size:13.5px;border-radius:9px}
  .tag{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.04em;border-radius:999px;padding:4px 11px}
  .tag.soon{background:#dcecf2;color:var(--teal-d)}.tag.prep{background:var(--line-2);color:var(--muted);border:1px solid var(--line)}.tag.partner{background:#e9f5ee;color:var(--good);border:1px solid #cfe6d8}.tag.live{background:var(--teal);color:#fff}
  header{position:sticky;top:0;z-index:60;background:rgba(244,247,248,.86);backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--line)}
  .nav{display:flex;align-items:center;justify-content:space-between;height:62px}
  .lgrp{display:flex;align-items:center;gap:18px}
  .logo{display:flex;align-items:center;gap:9px;font-weight:900;font-size:19px;letter-spacing:-.02em}
  .logo .dot{width:10px;height:10px;border-radius:50%;background:var(--gold);box-shadow:0 0 0 4px rgba(232,166,61,.2)}
  .home{font-size:14px;font-weight:700;color:var(--muted)}.home:hover{color:var(--teal)}
  .right{display:flex;gap:10px;align-items:center}
  .hero{background:radial-gradient(120% 130% at 82% -20%,#12455b,var(--navy-2) 55%,var(--navy));color:#eaf3f6;padding:clamp(46px,7vw,80px) 0}
  .hero .badge{width:60px;height:60px;border-radius:16px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);display:grid;place-items:center;font-size:28px}
  .hero .cat{font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:#8fd0e8;margin-top:18px}
  .hero h1{font-size:clamp(30px,5vw,48px);font-weight:900;letter-spacing:-.02em;margin:10px 0 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap;text-wrap:balance}
  .hero .lead{color:#bcd7e1;font-size:17px;max-width:58ch;margin:16px 0 26px;line-height:1.65}
  .block{padding:clamp(44px,6vw,68px) 0;border-bottom:1px solid var(--line)}
  .block.alt{background:var(--tint)}
  .block h2{font-size:clamp(20px,2.8vw,26px);font-weight:900;letter-spacing:-.02em;margin:0 0 6px}
  .block .sub{color:var(--muted);font-size:14.5px;margin:0 0 22px}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  @media(max-width:820px){.grid3{grid-template-columns:1fr}}
  .fc{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px}
  .block.alt .fc{background:#fff}
  .fc .n{display:flex;align-items:center;gap:9px;font-weight:800;font-size:16px}
  .fc .n .i{width:32px;height:32px;border-radius:9px;background:var(--line-2);display:grid;place-items:center;font-size:16px}
  .fc p{font-size:13.5px;color:var(--muted);margin:11px 0 0;line-height:1.55}
  .connect{display:flex;gap:16px;align-items:flex-start;background:var(--card);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:14px;padding:22px 24px}
  .connect .k{flex:none;width:44px;height:44px;border-radius:12px;background:#fff6e7;display:grid;place-items:center;font-size:20px}
  .connect p{margin:0;font-size:15px;color:var(--body);line-height:1.7}.connect b{color:var(--ink)}
  .others{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
  @media(max-width:820px){.others{grid-template-columns:1fr}}
  .oc{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;transition:box-shadow .15s,transform .15s,border-color .15s}
  .oc:hover{box-shadow:0 10px 24px rgba(11,39,51,.08);transform:translateY(-2px);border-color:#cfe0e8}
  .oc .oi{width:34px;height:34px;border-radius:9px;background:var(--line-2);display:grid;place-items:center;font-size:17px;flex:none}
  .oc .on{font-weight:800;font-size:14px}.oc .oc2{font-size:11.5px;color:var(--muted)}
  .oc .go{margin-left:auto;color:var(--teal);font-weight:800;font-size:15px}
  .band{background:var(--navy);color:#dcedf3;text-align:center;padding:clamp(44px,6vw,68px) 0}
  .band h2{font-size:clamp(21px,3vw,30px);font-weight:900;letter-spacing:-.02em;margin:0}
  .band p{color:#9fbecb;margin:12px 0 22px;font-size:15px}
  .band .row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
  .band .btn.ghost{border-color:rgba(255,255,255,.3);color:#fff}
  footer{background:var(--navy-2);color:#9fbecb;padding:32px 0;font-size:13px}
  footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
  section[id]{scroll-margin-top:78px}
  .pricing{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  @media(max-width:820px){.pricing{grid-template-columns:1fr}}
  .ptier{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px;display:flex;flex-direction:column;position:relative}
  .block.alt .ptier{background:#fff}
  .ptier.pop{border:2px solid var(--teal);box-shadow:0 14px 34px rgba(14,92,124,.14)}
  .ptier .pbadge{position:absolute;top:-11px;left:24px;background:var(--teal);color:#fff;font-size:11px;font-weight:800;padding:4px 11px;border-radius:999px}
  .ptier .pname{font-size:14px;font-weight:800;color:var(--teal);letter-spacing:.02em}
  .ptier .price{font-size:26px;font-weight:900;letter-spacing:-.02em;margin:6px 0 2px}
  .ptier .price small{font-size:14px;font-weight:700;color:var(--muted)}
  .ptier .pdesc{font-size:13px;color:var(--muted);margin:0 0 14px}
  .plist{list-style:none;padding:0;margin:0 0 20px;display:flex;flex-direction:column;gap:9px;flex:1}
  .plist li{font-size:13.5px;color:var(--body);padding-left:23px;position:relative;line-height:1.5}
  .plist li::before{content:'✓';position:absolute;left:0;color:var(--teal);font-weight:900}
  .ptier .btn{width:100%;justify-content:center}
  .pnote{font-size:12px;color:var(--muted);margin-top:16px}
  .form{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px;max-width:660px}
  .block.alt .form{background:#fff}
  .form .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  @media(max-width:560px){.form .grid2{grid-template-columns:1fr}}
  .field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
  .field label{font-size:13px;font-weight:700;color:var(--ink)}
  .field input,.field select,.field textarea{font:inherit;font-size:14px;padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);width:100%}
  .field textarea{resize:vertical;min-height:90px}
  .field input:focus,.field select:focus,.field textarea:focus{outline:2px solid var(--teal);outline-offset:1px;border-color:var(--teal)}
  .agree{display:flex;gap:9px;align-items:flex-start;font-size:13px;color:var(--muted);margin-bottom:16px;cursor:pointer}
  .agree input{margin-top:2px;flex:none}
  .formmsg{display:none;background:#e9f5ee;border:1px solid #cfe6d8;color:var(--good);border-radius:10px;padding:14px 16px;font-size:14px;font-weight:700;margin-top:14px}
  .formmsg.show{display:block}
  .reveal{opacity:0;transform:translateY(18px);transition:opacity .55s ease,transform .55s cubic-bezier(.2,.75,.25,1)}.reveal.in{opacity:1;transform:none}
  @media(prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}html{scroll-behavior:auto}}
`;

const page = (s) => {
  const others = S.filter(o => o.id !== s.id).map(o =>
    `<a class="oc" href="/services/${o.id}"><span class="oi" aria-hidden="true">${o.icon}</span><span><span class="on">${o.name}</span><br><span class="oc2">${o.cat}</span></span><span class="go">→</span></a>`
  ).join('\n        ');
  const feats = s.feats.map(([i,n,p]) =>
    `<div class="fc reveal"><div class="n"><span class="i" aria-hidden="true">${i}</span>${n}</div><p>${p}</p></div>`
  ).join('\n        ');
  return topify(`<title>${s.name} — 잇올 연계 서비스</title>
<style>${CSS}</style>
<header>
  <div class="wrap nav">
    <div class="lgrp"><a class="logo" href="/"><span class="dot"></span>잇올</a><a class="home" href="${OVERVIEW}">← 연계 서비스 전체</a></div>
    <div class="right"><a class="btn ghost sm" href="${LOGIN}">로그인</a><a class="btn primary sm" href="${LOGIN}">시작하기</a></div>
  </div>
</header>

<section class="hero">
  <div class="wrap">
    <div class="badge" aria-hidden="true">${s.icon}</div>
    <div class="cat">${s.cat}</div>
    <h1>${s.name} <span class="tag ${s.tag[0]}">${s.tag[1]}</span></h1>
    <p class="lead">${s.lead}</p>
    <a class="btn ${s.cta[1]}" href="${s.href || LOGIN}">${s.cta[0]}</a>
  </div>
</section>

<section class="block">
  <div class="wrap">
    <h2>핵심 기능</h2>
    <p class="sub">이 서비스가 제공하는 핵심 기능</p>
    <div class="grid3">
        ${feats}
    </div>
  </div>
</section>

<section class="block alt">
  <div class="wrap">
    <h2>잇올과 이렇게 연결됩니다</h2>
    <p class="sub">계정 하나로, 상담과 끊김 없이 이어집니다</p>
    <div class="connect reveal"><span class="k" aria-hidden="true">🔗</span><p>${s.link}</p></div>
  </div>
</section>
${s.extra || ''}
<section class="block">
  <div class="wrap">
    <h2>다른 연계 서비스</h2>
    <p class="sub">잇올 계정으로 함께 쓰는 입시 서비스</p>
    <div class="others">
        ${others}
    </div>
  </div>
</section>

<section class="band" id="start">
  <div class="wrap">
    <h2>잇올 계정 하나로, ${s.name}까지</h2>
    <p>멘토링부터 연계 서비스까지 다시 로그인할 필요 없이 이어집니다.</p>
    <div class="row"><a class="btn primary" href="${s.href || LOGIN}">무료로 시작하기</a><a class="btn ghost" href="${OVERVIEW}">전체 서비스 보기</a></div>
  </div>
</section>

<footer><div class="wrap"><span>© 2026 잇올(itall) · 입시 멘토링 · 상담 플랫폼</span><span>서비스 상태는 준비 상황에 따라 변경될 수 있습니다.</span></div></footer>

<script>
(function(){
  var reduce=window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var t=[].slice.call(document.querySelectorAll('.reveal'));
  document.querySelectorAll('.grid3, .pricing').forEach(function(g){[].slice.call(g.children).forEach(function(c,i){if(c.classList.contains('reveal'))c.style.transitionDelay=(i%3)*80+'ms'})});
  if(reduce||!('IntersectionObserver'in window)){t.forEach(function(el){el.classList.add('in')});}
  else{var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.14,rootMargin:'0px 0px -8% 0px'});
  t.forEach(function(el){io.observe(el)});}
  var f=document.getElementById('consultForm');
  if(f){f.addEventListener('submit',function(e){e.preventDefault();
    var name=f.querySelector('[name=name]'),phone=f.querySelector('[name=phone]'),agree=f.querySelector('[name=agree]');
    var bad=!name.value.trim()?name:(!phone.value.trim()?phone:(!agree.checked?agree:null));
    if(bad){bad.focus();if(bad===agree)alert('개인정보 수집·이용에 동의해 주세요.');return;}
    document.getElementById('formMsg').classList.add('show');
    var btn=f.querySelector('button[type=submit]');btn.textContent='접수 완료 ✓';btn.disabled=true;btn.style.opacity=.7;
  });}
})();
</script>
`);
};

for (const s of S) {
  writeFileSync(DIR + s.file, page(s));
  console.log('wrote', s.file);
}
console.log('done', S.length);
