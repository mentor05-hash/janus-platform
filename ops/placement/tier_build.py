# -*- coding: utf-8 -*-
"""티어 빌드 파이프라인 — 배치표 마스터(HTML) → dist-tier/{tier} (접합계약 C4/C6).

무엇을 하나:
  1) 티어 게이트 영역 마스킹: 마스터가 `<!--JANUS-TIER:member-->…<!--/JANUS-TIER-->` 로 감싼
     상위-티어 전용 데이터/UI 를, 빌드 티어보다 상위면 **물리적으로 제거**(하위 티어 파일에 원본 부재).
  2) 지정 데이터 페이로드 제거: config.tiers[t].strip_assignments 의 `const NAME=…;` 를 빈 값으로 대체
     (센티넬이 없는 기존 마스터용 폴백 — 무료판에서 대형 저작권 배열을 떨궈낸다).
  3) FLAGS 주입: window.__JANUS_TIER / window.__JANUS_FLAGS — 마스터 JS 가 UI(전체표·필터·고급)를 게이팅.
  4) 워터마크 + 예측 면책 배너(전 화면) 주입 — 재배포 금지·면책 상시 고지.
  5) (무료판) 간이 접속 로그 비콘 — page id `baechi`(C3) 로 조회 1건 전송(navigator.sendBeacon).
  6) [A4] build-id 메타 + 사이드카 매니페스트 + 배포 감지 프로브(새 build-id → "새 버전이 있습니다"
     배너·리로드) + 클라이언트 오류 링버퍼(최근 30건, 전송 훅은 스텁).
  7) [A6] 미러(무단 복제본) 감지 — 허용 호스트 밖에서 열리면 원본 안내·리다이렉트.
     허용 호스트·원본 주소는 **빌드 시 ENV 주입**(도메인 미결 — 하드코딩 금지, 미설정 시 무해 no-op).
  8) [A7] 입시 캘린더 D-day 칩 1곳 — `packages/exam-calendar/src/events.json` 단일 소스에서 주입.

6~8 은 벤치마크 노트(docs/30_features/야누스_벤치마크노트_엑셀코스피_2026-08-07.md §1 A4·A6·A7)
요구사항이며, 티어별로 `tiers.config.json` 의 플래그로 켠다(현재 무료판만 ON).

원칙(C6): 저작권 마스터/데이터는 repo 밖(JANUS_DATA_DIR). 이 스크립트는 코드만 repo 에 있고,
실제 마스터는 `--src` 로 로컬에서 물린다. 테스트는 합성 픽스처(fixtures/master_sample.html)로.

사용:
  python3 ops/placement/tier_build.py --src <마스터.html> --tier free
  python3 ops/placement/tier_build.py --src <마스터.html> --all           # 4종 모두
  (--out 기본 dist-tier, --config 기본 ops/placement/tiers.config.json)

빌드 시 ENV(전부 선택 — 미설정이면 플레이스홀더/무해 동작):
  JANUS_ALLOWED_HOSTS    쉼표(또는 공백) 구분 허용 호스트. 예: "janus.kr,www.janus.kr"
                         미설정 → 미러 감지 비활성(스니펫은 들어가되 런타임 no-op).
  JANUS_CANONICAL_ORIGIN 원본 주소. 예: "https://janus.kr"
                         미설정 → 안내만 하고 리다이렉트하지 않음(도메인 미결 상태의 안전 기본값).
  JANUS_BUILD_ID         build-id 고정(미설정 시 마스터·설정·캘린더 내용 해시로 결정).
  JANUS_BUILD_PROBE_SEC  프로브 주기(초) 강제 — 테스트용.
"""
import argparse, hashlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import measure  # 측정·예산 판정의 단일 구현 — 삭감기와 검증기가 다른 판단을 할 수 없게 한다


class BudgetExceeded(Exception):
    """질량 예산 위반. 산출물을 쓰지 않고 비-0 으로 끝낸다."""


REPO_ROOT = os.path.dirname(os.path.dirname(HERE))  # ops/placement → repo 루트


def load_config(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def level_index(levels, name):
    return levels.index(name) if name in levels else 0


# ── 1) 센티넬 티어 영역 마스킹 ─────────────────────────────────────────────
SENTINEL = re.compile(r'<!--\s*JANUS-TIER:(free|member|paid|consultant)\s*-->(.*?)<!--\s*/JANUS-TIER\s*-->', re.DOTALL)


def mask_regions(html, levels, tier):
    keep_upto = level_index(levels, tier)
    removed = [0]

    def repl(m):
        region_level = level_index(levels, m.group(1))
        if region_level <= keep_upto:
            return m.group(2)  # 통과: 센티넬만 벗기고 내용 유지
        removed[0] += 1
        return '<!--[야누스 상위 티어 전용 — 이 판에는 포함되지 않습니다]-->'

    return SENTINEL.sub(repl, html), removed[0]


# ── 2) 지정 데이터 페이로드 제거(폴백) ────────────────────────────────────
def strip_assignment(html, name):
    """`const NAME = <리터럴> ;` 를 빈 값으로 대체. 괄호·문자열 균형 스캐너로 종료 세미콜론까지 안전 절단."""
    pat = re.compile(r'\b(?:const|let|var)\s+' + re.escape(name) + r'\s*=\s*')
    m = pat.search(html)
    if not m:
        return html, False
    i = m.end()
    n = len(html)
    # 첫 비공백 문자로 빈 대체값 결정
    j = i
    while j < n and html[j] in ' \t\r\n':
        j += 1
    empty = '[]' if j < n and html[j] == '[' else '{}' if j < n and html[j] == '{' else 'null'
    depth = 0
    in_str = None
    esc = False
    k = i
    while k < n:
        c = html[k]
        if in_str:
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == in_str:
                in_str = None
        else:
            if c in '"\'`':
                in_str = c
            elif c in '[{(':
                depth += 1
            elif c in ')}]':
                depth -= 1
            elif c == ';' and depth == 0:
                break
        k += 1
    if k >= n:
        return html, False  # 균형 실패 — 손대지 않음(안전)
    replaced = html[:m.start()] + 'const ' + name + '=' + empty + '; /*[야누스] 상위 티어 데이터 제거*/' + html[k + 1:]
    return replaced, True


# ── 3~5) 주입(FLAGS·워터마크·접속로그) ────────────────────────────────────
def flags_script(tier, flags):
    return ('<script>window.__JANUS_TIER=' + json.dumps(tier) +
            ';window.__JANUS_FLAGS=' + json.dumps(flags, ensure_ascii=False) + ';</script>')


def watermark_html(text, label):
    safe = text.replace('<', '&lt;').replace('>', '&gt;')
    return (
        '<div data-janus-watermark="1" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483000;'
        'background:rgba(30,53,80,.92);color:#e8eef7;font:12px/1.5 -apple-system,\'Malgun Gothic\',sans-serif;'
        'padding:7px 14px;text-align:center;pointer-events:none">'
        '<b style="color:#cf9a3a">' + label + '</b> · ' + safe + '</div>'
    )


def access_log_script(endpoint):
    # page id 'baechi'(C3) 조회 1건 — sendBeacon(가능 시), 실패 무해.
    return (
        '<script>try{var b={page:"baechi",event:"view",tier:window.__JANUS_TIER,'
        'sid:(localStorage.getItem("janus_sid")||(function(){var s="s"+Date.now().toString(36);'
        'localStorage.setItem("janus_sid",s);return s;})())};'
        'if(navigator.sendBeacon)navigator.sendBeacon(' + json.dumps(endpoint) +
        ',new Blob([JSON.stringify(b)],{type:"application/json"}));}catch(e){}</script>'
    )


def inject(html, snippet, where='body_start'):
    if where == 'body_start':
        idx = html.lower().find('<body')
        if idx != -1:
            gt = html.find('>', idx)
            if gt != -1:
                return html[:gt + 1] + snippet + html[gt + 1:]
    # 폴백: head 뒤 또는 맨 앞
    if '</head>' in html:
        return html.replace('</head>', snippet + '</head>', 1)
    return snippet + html


def inject_before_body_end(html, snippet):
    if '</body>' in html:
        return html.replace('</body>', snippet + '</body>', 1)
    return html + snippet


def inject_into_head(html, snippet):
    """`<head>` 바로 뒤에 넣는다(메타류). head 가 없으면 body 앞, 그것도 없으면 맨 앞."""
    low = html.lower()
    idx = low.find('<head')
    if idx != -1:
        gt = html.find('>', idx)
        if gt != -1:
            return html[:gt + 1] + snippet + html[gt + 1:]
    return inject(html, snippet, 'body_start')


# ── 6) [A4] build-id · 배포 감지 프로브 · 오류 링버퍼 ─────────────────────
# 주의: 이 값은 JS 안의 **작은따옴표 문자열**(style.cssText)에 들어간다 — 폰트명은 큰따옴표로 감싼다.
FONT = '12px/1.6 -apple-system,"Malgun Gothic",sans-serif'


def compute_build_id(content_bytes, tier, runtime_cfg, calendar_raw):
    """ENV 우선, 없으면 '배포되는 내용'의 해시. 같은 입력 → 같은 id(재빌드만으로 배너가 뜨지 않게).

    캘린더·런타임 설정도 해시에 넣는다 — 일정이 바뀌면 새 배포로 감지돼야 하기 때문.
    """
    env = os.environ.get('JANUS_BUILD_ID', '').strip()
    if env:
        return env
    h = hashlib.sha256()
    h.update(content_bytes)
    h.update(tier.encode('utf-8'))
    h.update(json.dumps(runtime_cfg, sort_keys=True, ensure_ascii=False).encode('utf-8'))
    h.update((calendar_raw or '').encode('utf-8'))
    return h.hexdigest()[:12]


def build_meta_tag(build_id):
    return '<meta name="janus-build-id" content="' + build_id + '">'


BUILD_PROBE_JS = """<script>
/*[야누스 A4] 배포 감지 프로브 + 클라이언트 오류 링버퍼(최근 30건). 전송 훅은 스텁.*/
(function(){
  var MAX=30, buf=[];
  function stamp(){try{return new Date().toISOString();}catch(e){return '';}}
  function push(e){
    buf.push(e); if(buf.length>MAX) buf.shift();
    /* 전송 훅 스텁 — window.__JANUS_ERR_SINK 에 함수를 물리는 순간부터 전송된다(기본 미전송). */
    try{ if(typeof window.__JANUS_ERR_SINK==='function') window.__JANUS_ERR_SINK(e); }catch(_){}
  }
  window.__JANUS_ERR_SINK=window.__JANUS_ERR_SINK||null;
  window.__janusErrors=function(){return buf.slice();};
  window.addEventListener('error',function(ev){
    var t=ev&&ev.target;
    if(t&&t!==window&&(t.src||t.href)){push({t:stamp(),type:'resource',msg:'asset load failed',src:String(t.src||t.href)});return;}
    push({t:stamp(),type:'error',msg:String((ev&&ev.message)||ev),src:String((ev&&ev.filename)||''),
          line:(ev&&ev.lineno)||0,col:(ev&&ev.colno)||0,
          stack:(ev&&ev.error&&ev.error.stack)?String(ev.error.stack).slice(0,500):''});
  },true);
  window.addEventListener('unhandledrejection',function(ev){
    var r=ev&&ev.reason;
    push({t:stamp(),type:'rejection',msg:String((r&&r.message)||r),
          stack:(r&&r.stack)?String(r.stack).slice(0,500):''});
  });

  var CUR=__BUILD_ID__, MANIFEST=__MANIFEST__, EVERY=__EVERY_MS__, AUTO=__AUTO_MS__, shown=false;
  if(!EVERY) return;
  function banner(nid){
    if(shown) return; shown=true;
    console.warn('[janus/build] 새 배포 감지: '+CUR+' -> '+nid);
    var d=document.createElement('div');
    d.setAttribute('data-janus-update','1');
    d.style.cssText='position:fixed;left:0;right:0;top:0;z-index:2147483001;background:#1e3550;'+
      'color:#e8eef7;font:__FONT__;padding:9px 14px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    var msg=document.createElement('span');
    msg.innerHTML='<b style="color:#cf9a3a">새 버전이 있습니다</b> \\u00b7 최신 배치표로 새로고침하세요.';
    var go=document.createElement('button');
    go.textContent='새로고침';
    go.style.cssText='margin-left:10px;padding:3px 12px;border:0;border-radius:4px;background:#cf9a3a;color:#1e3550;font-weight:700;cursor:pointer';
    go.onclick=function(){location.reload();};
    var later=document.createElement('button');
    later.textContent='나중에';
    later.style.cssText='margin-left:6px;padding:3px 10px;border:1px solid rgba(232,238,247,.4);border-radius:4px;background:transparent;color:#e8eef7;cursor:pointer';
    later.onclick=function(){d.parentNode&&d.parentNode.removeChild(d);};
    d.appendChild(msg); d.appendChild(go); d.appendChild(later);
    (document.body||document.documentElement).appendChild(d);
    if(AUTO>0) setTimeout(function(){location.reload();},AUTO);
  }
  function check(){
    if(shown) return;
    try{
      fetch(MANIFEST,{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){
        if(j&&j.buildId&&CUR&&j.buildId!==CUR) banner(j.buildId);
      })['catch'](function(){});
    }catch(e){}
  }
  setInterval(check,EVERY);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)check();});
  setTimeout(check,EVERY>3000?3000:EVERY);
})();
</script>"""


def build_probe_script(build_id, rcfg):
    every = int(os.environ.get('JANUS_BUILD_PROBE_SEC', 0) or rcfg.get('interval_sec', 300))
    auto = int(rcfg.get('auto_reload_sec', 0))
    return (BUILD_PROBE_JS
            .replace('__BUILD_ID__', json.dumps(build_id))
            .replace('__MANIFEST__', json.dumps(rcfg.get('manifest_name', 'janus-build.json')))
            .replace('__EVERY_MS__', str(max(0, every) * 1000))
            .replace('__AUTO_MS__', str(max(0, auto) * 1000))
            .replace('__FONT__', FONT))


def write_build_manifest(dst_dir, name, build_id, tier):
    """프로브가 폴링하는 사이드카. HTML 파일명이 배포 중 바뀌어도 살아남도록 **고정 파일명**."""
    path = os.path.join(dst_dir, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'buildId': build_id, 'tier': tier}, f, ensure_ascii=False)
    return path


# ── 7) [A6] 미러(무단 복제본) 감지 ────────────────────────────────────────
def djb2(s):
    """호스트명 해시(djb2 xor). JS 쪽 Math.imul 구현과 32비트 단위로 일치해야 한다."""
    h = 5381
    for ch in s:
        h = ((h * 33) & 0xFFFFFFFF) ^ ord(ch)
        h &= 0xFFFFFFFF
    return h


def allowed_host_hashes():
    """허용 호스트는 **ENV 로만** 들어온다(도메인 미결 — 하드코딩 금지). 미설정이면 빈 목록 → 런타임 no-op."""
    raw = os.environ.get('JANUS_ALLOWED_HOSTS', '')
    hosts = [h.strip().lower() for h in raw.replace(',', ' ').split() if h.strip()]
    return hosts, [djb2(h) for h in hosts]


MIRROR_GUARD_JS = """<script>
/*[야누스 A6] 미러 감지 — 허용 호스트 목록은 빌드 시 주입(ENV). 목록이 비면 아무 것도 하지 않는다.*/
(function(){
  var ALLOW=__ALLOW__, HOME=__HOME__, GRACE=__GRACE__, KEEP=__KEEP__;
  if(!ALLOW||!ALLOW.length) return;
  var host=(location.hostname||'').toLowerCase();
  if(!host) return;                       /* file:// 등 — 판정 불가, 통과 */
  function h32(s){var h=5381,i;for(i=0;i<s.length;i++){h=(Math.imul(h,33)^s.charCodeAt(i))>>>0;}return h;}
  if(ALLOW.indexOf(h32(host))>=0) return; /* 허용 호스트 — 정상 */
  var dest='';
  if(HOME){ dest=HOME; if(KEEP){ while(dest.charAt(dest.length-1)==='/') dest=dest.slice(0,-1); dest=dest+location.pathname+location.search; } }
  console.warn('[janus/mirror] 비허용 호스트: '+host+' -> '+(dest||'(원본 주소 미설정 — 안내만)'));
  var box=document.createElement('div');
  box.setAttribute('data-janus-mirror-notice','1');
  box.style.cssText='position:fixed;left:0;right:0;top:0;bottom:0;z-index:2147483600;background:rgba(12,20,32,.97);'+
    'color:#e8eef7;font:__FONT__;display:flex;align-items:center;justify-content:center;text-align:center';
  var inner='<div style="max-width:520px;padding:28px">'+
    '<div style="font-size:19px;font-weight:700;color:#cf9a3a;margin-bottom:12px">야누스 공식 주소가 아닙니다</div>'+
    '<p style="margin:0 0 14px">이 페이지는 무단 복제본일 수 있습니다. 최신·정확한 배치표는 원본에서 확인하세요.</p>';
  if(dest){
    inner+='<p style="margin:0 0 10px"><a href="'+dest+'" style="color:#cf9a3a;font-weight:700">원본으로 이동</a></p>'+
      '<p data-janus-mirror-countdown="1" style="margin:0;opacity:.7"></p>';
  }else{
    inner+='<p style="margin:0;opacity:.7">원본 주소는 준비 중입니다.</p>';
  }
  box.innerHTML=inner+'</div>';
  (document.body||document.documentElement).appendChild(box);
  if(!dest) return;
  var left=GRACE, cd=box.querySelector('[data-janus-mirror-countdown]');
  function tick(){
    if(cd) cd.textContent=left+'초 후 원본으로 이동합니다.';
    if(left<=0){ location.replace(dest); return; }
    left--; setTimeout(tick,1000);
  }
  tick();
})();
</script>"""


def mirror_guard_script(rcfg, hashes):
    home = os.environ.get('JANUS_CANONICAL_ORIGIN', '').strip()
    # 도메인 미결이면 원본 주소는 빈 값 → 안내만 하고 리다이렉트하지 않는다(오배송 방지).
    if home.startswith('__') or home == rcfg.get('canonical_placeholder', ''):
        home = ''
    return (MIRROR_GUARD_JS
            .replace('__ALLOW__', json.dumps(hashes))
            .replace('__HOME__', json.dumps(home))
            .replace('__GRACE__', str(int(rcfg.get('grace_sec', 5))))
            .replace('__KEEP__', 'true' if rcfg.get('preserve_path') else 'false')
            .replace('__FONT__', FONT))


# ── 8) [A7] 입시 캘린더 D-day 칩 ──────────────────────────────────────────
def load_calendar(rel_path):
    """단일 소스는 packages/exam-calendar/src/events.json — 날짜를 파이썬에 다시 적지 않는다."""
    path = os.path.join(REPO_ROOT, rel_path)
    if not os.path.exists(path):
        return None, None
    with open(path, encoding='utf-8') as f:
        raw = f.read()
    return json.loads(raw), raw


DDAY_JS = """<script>
/*[야누스 A7] 입시 캘린더 D-day — packages/exam-calendar/src/events.json 에서 빌드 시 주입(KST 기준).*/
(function(){
  var EV=__EVENTS__, LABEL=__LABEL__;
  if(!EV||!EV.length) return;
  function ms(s){var p=s.split('-');return Date.UTC(+p[0],+p[1]-1,+p[2]);}
  function diff(a,b){return Math.round((ms(b)-ms(a))/86400000);}
  var today=new Date(new Date().getTime()+32400000).toISOString().slice(0,10);
  var pick=null,i,e;
  for(i=0;i<EV.length;i++){e=EV[i];if(diff(today,e.end||e.start)>=0){pick=e;break;}}  /* 시작일 오름차순 → 첫 미종료 = 다음 일정 */
  if(!pick) return;
  var d=diff(today,pick.start);
  var txt=(d>0)?('D-'+d):((d===0)?'D-DAY':'진행 중');
  var c=document.createElement('div');
  c.setAttribute('data-janus-dday',pick.id);
  c.title=pick.title+' \\u00b7 '+pick.start+(pick.end?(' ~ '+pick.end):'')+' \\u00b7 '+pick.source;
  c.style.cssText='position:fixed;right:12px;bottom:44px;z-index:2147483000;background:rgba(30,53,80,.94);'+
    'color:#e8eef7;font:__FONT__;padding:6px 12px;border-radius:999px;border:1px solid rgba(207,154,58,.5)';
  var html='<span style="opacity:.7">'+LABEL+'</span> <b>'+pick.short+'</b> '+
           '<b style="color:#cf9a3a">'+txt+'</b>';
  if(pick.status!=='confirmed'){
    html+='<span style="margin-left:6px;padding:1px 6px;border-radius:999px;background:rgba(232,238,247,.16);'+
          'font-size:11px;opacity:.85">잠정</span>';
  }
  c.innerHTML=html;
  (document.body||document.documentElement).appendChild(c);
})();
</script>"""


def dday_script(cal, rcfg):
    keys = ('id', 'short', 'title', 'start', 'end', 'status', 'source')
    events = [{k: ev.get(k) for k in keys} for ev in cal.get('events', [])]
    return (DDAY_JS
            .replace('__EVENTS__', json.dumps(events, ensure_ascii=False))
            .replace('__LABEL__', json.dumps(rcfg.get('label', '다음 일정'), ensure_ascii=False))
            .replace('__FONT__', FONT))


def build(src, tier, cfg, out_dir):
    levels = cfg['levels']
    tconf = cfg['tiers'][tier]
    with open(src, encoding='utf-8') as f:
        html = f.read()

    src_bytes = len(html.encode('utf-8'))
    # G0 — 계약 존재. publishable 미선언·예산 부재·HARD 초과는 여기서 예외(관대한 기본값 없음).
    budget = measure.load_budget(cfg, tier)

    html, n_regions = mask_regions(html, levels, tier)
    # G1 — 삭감 두 경로를 **병행**한다(택일이 아니다).
    #   (a) 이름 기반: 알려진 페이로드. 크기 임계 아래의 작은 것도 확실히 지운다.
    #   (b) 크기 기반: 이름을 모르는 페이로드. 2026-08-12 위음성의 근본 수정 —
    #       (a) 만 있을 때 실마스터에 그 이름이 0건이라 아무것도 안 지워졌다.
    # G2 — 균형 스캔이 끝을 못 찾으면 measure.Unparseable 이 위로 던져져 빌드가 죽는다(조용한 통과 없음).
    n_named = 0
    for name in tconf.get('strip_assignments', []):
        html, ok = strip_assignment(html, name)
        n_named += 1 if ok else 0
    n_assign = 0
    if budget:
        html, stripped = measure.strip_large_literals(
            html, budget['structure']['strip_literal_over_bytes'])
        n_assign = len(stripped)

    html = inject(html, flags_script(tier, tconf['flags']), 'body_start')
    html = inject_before_body_end(html, watermark_html(cfg['watermark'], tconf['label']))
    if tconf.get('access_log'):
        html = inject_before_body_end(html, access_log_script(cfg['access_log_endpoint']))

    # ── 6~8) A4·A6·A7 (티어 플래그로 ON/OFF — 현재 무료판만) ──────────────
    rt = cfg.get('runtime', {})
    notes = []
    cal, cal_raw = (None, None)
    if tconf.get('exam_dday'):
        cal, cal_raw = load_calendar(rt.get('exam_dday', {}).get('calendar_path', ''))
    build_id = compute_build_id(html.encode('utf-8'), tier, rt, cal_raw)

    if tconf.get('build_probe'):  # A4
        html = inject_into_head(html, build_meta_tag(build_id))
        html = inject_before_body_end(html, build_probe_script(build_id, rt.get('build_probe', {})))
        notes.append('A4 build-id ' + build_id)

    if tconf.get('mirror_guard'):  # A6
        hosts, hashes = allowed_host_hashes()
        html = inject_before_body_end(html, mirror_guard_script(rt.get('mirror_guard', {}), hashes))
        if hosts:
            home = os.environ.get('JANUS_CANONICAL_ORIGIN', '').strip()
            notes.append('A6 허용호스트 %d개%s' % (len(hosts), '' if home else '(원본 미설정·안내만)'))
        else:
            notes.append('A6 비활성(JANUS_ALLOWED_HOSTS 미설정)')

    if tconf.get('exam_dday'):  # A7
        if cal:
            html = inject_before_body_end(html, dday_script(cal, rt.get('exam_dday', {})))
            prov = sum(1 for e in cal.get('events', []) if e.get('status') != 'confirmed')
            notes.append('A7 일정 %d건%s' % (len(cal.get('events', [])), ('·잠정 %d' % prov) if prov else ''))
        else:
            notes.append('A7 건너뜀(캘린더 파일 없음)')

    dst_dir = os.path.join(out_dir, tier)
    base = os.path.basename(src)
    dst = os.path.join(dst_dir, base)
    out_bytes = html.encode('utf-8')

    # ── 질량 게이트 — 통과 전에는 **한 바이트도 디스크에 쓰지 않는다** ──────────────
    # 현행(2026-08-12 이전)은 유출된 파일을 먼저 쓰고 성공 메시지를 냈다. 그러면 그 파일이 그대로 배포된다.
    if budget:
        viol = []
        # G3·G4 — 산출물 자체의 질량·구조. 이름이 아니라 결과를 잰다.
        m = measure.measure_bytes(out_bytes)
        m['rel'] = base
        spans = measure.literal_spans(html, measure.MEASURE_FLOOR)
        m['max_literal_bytes'] = max((s[3] for s in spans), default=0)
        m['max_opaque_run'] = measure.max_opaque_run(html)
        m['expanded_bytes'] = measure.expanded_bytes(html)   # 사전 압축 밀수 — 풀어서 잰다
        viol += measure.enforce_file(m, budget)

        # G5 — 입력이 큰데 줄지 않았다면 삭감이 통째로 no-op 이었다는 뜻이다. 이번 사고의 직접 방어선.
        inp = budget.get('input') or {}
        if src_bytes >= inp.get('large_master_bytes', 262144):
            frac = len(out_bytes) / float(src_bytes)
            if frac > inp.get('max_retained_fraction', 0.05):
                viol.append('잔존률 %.2f%% > 상한 %.2f%% — 입력 %.1fKB 대비 삭감이 거의 일어나지 않았다'
                            % (frac * 100, inp['max_retained_fraction'] * 100, src_bytes / 1024))

        # G6 — 세트 질량(이미 있는 파일 + 이번 산출물). 확장자 무관·재귀라 사이드카·분할 적재도 합산된다.
        if os.path.isdir(dst_dir):
            s = measure.measure_set(dst_dir)
            existing = [f for f in s['per_file'] if f['rel'] != base]
            s['files'] = len(existing) + 1
            s['bytes'] = sum(f['bytes'] for f in existing) + m['bytes']
            s['gzip_bytes'] = sum(f['gzip_bytes'] for f in existing) + m['gzip_bytes']
            viol += measure.enforce_set(s, budget)

        if viol:
            print('  [%-10s] ❌ 질량 예산 위반 — 산출물을 쓰지 않았다' % tier, file=sys.stderr)
            for v in viol:
                print('             · ' + v, file=sys.stderr)
            print('             (영역 %d · 이름삭감 %d · 크기삭감 %d · 입력 %.1fKB → 산출 %.1fKB)'
                  % (n_regions, n_named, n_assign, src_bytes / 1024, len(out_bytes) / 1024), file=sys.stderr)
            raise BudgetExceeded(tier)

    os.makedirs(dst_dir, exist_ok=True)
    # 원자적 기록 — 부분 기록된 파일이 배포 대상으로 남지 않게.
    tmp = dst + '.tmp'
    with open(tmp, 'wb') as f:
        f.write(out_bytes)
    os.replace(tmp, dst)
    if tconf.get('build_probe'):
        write_build_manifest(dst_dir, rt.get('build_probe', {}).get('manifest_name', 'janus-build.json'),
                             build_id, tier)
    print('  [%-10s] %s  (영역 %d · 이름삭감 %d · 크기삭감 %d · %.1fKB)' %
          (tier, dst, n_regions, n_named, n_assign, len(out_bytes) / 1024))
    if budget:
        print(measure.format_set_report(measure.measure_set(dst_dir), budget))
    if notes:
        print('             ' + ' · '.join(notes))
    return dst


def main():
    ap = argparse.ArgumentParser(description='야누스 배치표 티어 빌드')
    ap.add_argument('--src', required=True, help='마스터 HTML 경로(저작권 마스터는 JANUS_DATA_DIR 로컬 경로)')
    ap.add_argument('--tier', help='free|member|paid|consultant')
    ap.add_argument('--all', action='store_true', help='4종 모두 빌드')
    ap.add_argument('--out', default=os.path.join(os.getcwd(), 'dist-tier'), help='산출 루트(기본 ./dist-tier)')
    ap.add_argument('--config', default=os.path.join(HERE, 'tiers.config.json'))
    a = ap.parse_args()
    cfg = load_config(a.config)
    if not os.path.exists(a.src):
        print('!! 마스터 없음:', a.src, file=sys.stderr)
        sys.exit(2)
    tiers = cfg['levels'] if a.all else ([a.tier] if a.tier else None)
    if not tiers:
        print('!! --tier 또는 --all 필요', file=sys.stderr)
        sys.exit(2)
    print('티어 빌드:', a.src, '→', a.out)
    failed = []
    for t in tiers:
        if t not in cfg['tiers']:
            print('!! 알 수 없는 티어:', t, file=sys.stderr)
            sys.exit(2)
        try:
            build(a.src, t, cfg, a.out)
        except (BudgetExceeded, measure.Unparseable, ValueError) as e:
            # 한 티어가 막혀도 나머지는 계속 빌드하되, 프로세스는 반드시 비-0 으로 끝난다.
            if not isinstance(e, BudgetExceeded):
                print('  [%-10s] ❌ %s: %s' % (t, type(e).__name__, e), file=sys.stderr)
            failed.append(t)
    if failed:
        print('\n❌ 실패 티어: %s — 산출물을 쓰지 않았다. 배포 금지.' % ', '.join(failed), file=sys.stderr)
        sys.exit(2)
    print('완료. 무료판 배포 전 반드시: python3 ops/placement/tier_verify.py', os.path.join(a.out, 'free'))


if __name__ == '__main__':
    main()
