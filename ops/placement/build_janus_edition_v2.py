# -*- coding: utf-8 -*-
"""야누스판 빌드 v2 — 마스터에서 배포판 생성.
브랜드 처리: ①새 SVG 로고(블루·골드 아치, ../야누스_로고_v2.svg) 헤더 삽입
           ②허브 디자인 커버 스크린(초기화면) 주입 — 입력 적용 시 본 UI 공개
기능 수정은 항상 마스터에만. 이 스크립트로 재생성(배포판 직접 수정 금지).
"""
import json, os, re
dec=json.JSONDecoder()
LOGO=open('../야누스_로고_v2.svg',encoding='utf-8').read()
def logo(uid,size):
    l=LOGO.replace('jaHU3','jz'+uid+'a').replace('jaHU4','jz'+uid+'b')
    return l.replace('width="28" height="28"','width="%d" height="%d"'%(size,size))

FONT='<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">'

def topbar(uid,label):
    return ('<div style="background:#fff;border-bottom:1px solid #e4eaf1;font-family:\'Pretendard Variable\',Pretendard,\'Malgun Gothic\',sans-serif">'
     '<div style="max-width:1180px;margin:0 auto;height:56px;padding:0 20px;display:flex;align-items:center;gap:9px">'
     +logo(uid,26)+
     '<span style="font-size:19px;font-weight:800;color:#1e3550;letter-spacing:-.02em">야누스</span>'
     '<span style="font-size:11px;font-weight:700;color:#2f6fb3;background:rgba(47,111,179,.1);border-radius:6px;padding:3px 7px">'+label+'</span>'
     '<span style="flex:1"></span><span style="font-family:monospace;font-size:11px;color:#8695a8">janus.app</span></div></div>')

def cover_jeongsi(src):
    return CoverJG()

def CoverJG():
    return ("""<div id="jzCover" style="position:fixed;inset:0;z-index:99999;background:#f4f6fa;overflow:auto;font-family:'Pretendard Variable',Pretendard,'Malgun Gothic',sans-serif">"""
     +topbar('jg','입시배치표 · 정시 2027')+
     """<div style="background:#fff;border-bottom:1px solid #e4eaf1;font-size:12.5px;color:#8695a8;padding:9px 20px">보정·면책 안내 — 모든 수치는 지난 입시 데이터 기반 추정치이며 실제 결과를 보장하지 않습니다 <span style="color:#c2ccd8">(펼치기)</span></div>
<div style="max-width:1100px;margin:0 auto;padding:28px 20px 60px">
 <div class="jzgrid" style="display:grid;grid-template-columns:1fr 1.05fr;gap:16px">
  <div style="background:#1e3550;border-radius:16px;padding:24px 26px;color:#e8eef7;display:flex;flex-direction:column">
   <div style="display:flex;align-items:center"><span style="font-size:13px;font-weight:700;opacity:.85">지금 나의 위치</span><span style="margin-left:auto;font-size:11.5px;background:#2a476b;border-radius:8px;padding:3px 10px;color:#b9c9de">입력 대기</span></div>
   <div style="font-size:52px;font-weight:800;letter-spacing:.04em;margin:22px 0 6px;color:#5c7392">상위 <span style="font-family:'IBM Plex Mono',monospace">—.—</span><span style="font-size:22px"> %</span></div>
   <div style="font-size:13px;color:#8fa3bc">점수를 입력하면 전국 누백과 판정이 여기 표시됩니다</div>
   <div style="border-top:1px solid #2a476b;margin-top:22px;padding-top:16px;display:flex;gap:44px">
    <span><div style="font-size:11.5px;color:#8fa3bc;margin-bottom:3px">현재 판정</div><div style="font-size:16px;font-weight:700">—</div></span>
    <span><div style="font-size:11.5px;color:#8fa3bc;margin-bottom:3px">합격 확률</div><div style="font-size:16px;font-weight:700;font-family:'IBM Plex Mono',monospace">—%</div></span>
    <span><div style="font-size:11.5px;color:#8fa3bc;margin-bottom:3px">기준</div><div style="font-size:16px;font-weight:700">2027 · 6월 실채점</div></span>
   </div>
  </div>
  <div style="background:#fff;border:1px solid #e4eaf1;border-radius:16px;padding:24px 26px">
   <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
    <span style="font-size:13px;font-weight:800;color:#8a6d1f;background:#f7edd2;border-radius:9px;padding:5px 13px">시작하기</span>
    <span style="font-size:18px;font-weight:800;color:#1e3550">내 점수를 입력하면, 격차 리포트와 같은 기준으로 분류합니다</span>
   </div>
   <div style="font-size:14.5px;line-height:1.85;color:#3d4f66">안정 <b style="color:#1f8a4c">80%</b> · 적정 <b style="color:#2f6fb3">50%</b> · 소신 <b style="color:#cf9a3a">20%</b> 기준은 격차 리포트와 동일합니다.<br>
   아래에 점수를 넣고 <b>합격예측 적용</b>을 누르면 추천 보기가 열리고, 필터·전체표·고급 옵션은 필요한 만큼 단계적으로 켜집니다.</div>
  </div>
 </div>
 <div style="background:#fff;border:1px solid #e4eaf1;border-radius:16px;padding:20px 24px;margin-top:16px">
  <div style="display:flex;flex-wrap:wrap;gap:22px;align-items:flex-end">
   <span><div class="jzlab">계열</div><span style="display:inline-flex;border:1px solid #d9e2ec;border-radius:10px;overflow:hidden"><button class="jzseg on" data-g="이과">이과</button><button class="jzseg" data-g="문과">문과</button></span></span>
   <span><span style="display:inline-flex;border:1px solid #d9e2ec;border-radius:10px;overflow:hidden"><button class="jzmode on" data-m="std">표준점수</button><button class="jzmode" data-m="subj">과목 백분위</button><button class="jzmode" data-m="nb">전국 누백</button></span></span>
   <span id="jzStd" style="display:flex;gap:14px;align-items:flex-end">
    <span><div class="jzlab">국어 표점</div><input id="jzK" class="jzin" type="number" placeholder="표점"></span>
    <span><div class="jzlab">수학 표점</div><input id="jzM" class="jzin" type="number" placeholder="표점"></span>
    <span><div class="jzlab">탐구① 표점</div><input id="jzT1" class="jzin" type="number" placeholder="표점"></span>
    <span><div class="jzlab">탐구② 표점</div><input id="jzT2" class="jzin" type="number" placeholder="표점"></span>
    <span><div class="jzlab">추정 전국누백</div><div id="jzEst" style="font-family:'IBM Plex Mono',monospace;font-size:17px;font-weight:800;color:#1e3550;padding:8px 4px">-</div></span>
   </span>
   <span id="jzSubj" style="display:none;gap:14px;align-items:flex-end">
    <span><div class="jzlab">국어 백분위</div><input id="jzPK" class="jzin" type="number"></span>
    <span><div class="jzlab">수학 백분위</div><input id="jzPM" class="jzin" type="number"></span>
    <span><div class="jzlab">탐구 평균 백분위</div><input id="jzPT" class="jzin" type="number"></span>
   </span>
   <span id="jzNbWrap" style="display:none"><div class="jzlab">전국 누백(%)</div><input id="jzNB2" class="jzin" type="number" step="0.01" placeholder="예: 1.5"></span>
   <span style="border-left:1px solid #e4eaf1;padding-left:22px;display:flex;gap:14px">
    <span><div class="jzlab">영어 등급</div><input id="jzE" class="jzin" type="number" min="1" max="9" placeholder="1~9"></span>
    <span><div class="jzlab">한국사 등급</div><input id="jzH" class="jzin" type="number" min="1" max="9" placeholder="1~9"></span>
   </span>
  </div>
  <div style="display:flex;gap:12px;align-items:center;margin-top:18px">
   <button id="jzGo" style="background:#cf9a3a;color:#fff;border:none;border-radius:11px;padding:14px 30px;font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 3px 10px rgba(207,154,58,.3)">합격예측 적용</button>
   <button id="jzReset" style="background:#fff;border:1px solid #d9e2ec;border-radius:11px;padding:13px 22px;font-size:14px;color:#52627a;cursor:pointer">초기화</button>
   <span style="font-size:12.5px;color:#8695a8;line-height:1.6">· 국·수·탐 <b>표준점수</b> 입력 → 전국 표점합 기준 누백 추정<br>· 정확한 지원선은 <b>대학별 변환표준점수</b> 발표 후 확정</span>
  </div>
 </div>
 <div style="margin-top:16px;text-align:center"><button onclick="document.getElementById('jzCover').style.display='none'" style="background:none;border:1px solid #d9e2ec;border-radius:9px;padding:9px 22px;font-size:13px;color:#52627a;cursor:pointer">입력 없이 전체 표 열기 →</button></div>
</div>
<style>.jzlab{font-size:12px;color:#52627a;margin-bottom:5px}.jzin{width:92px;padding:10px;border:1.5px solid #cfe0f2;border-radius:10px;font-size:15px;text-align:center;background:#fbfdff}
.jzseg,.jzmode{padding:9px 16px;border:none;background:#fff;font-size:14px;cursor:pointer;color:#52627a}
.jzseg.on{background:#2f6fb3;color:#fff;font-weight:800}.jzmode.on{background:#1e3550;color:#fff;font-weight:800}
@media(max-width:760px){.jzgrid{grid-template-columns:1fr !important}}</style>
<script>
(function(){
 if(window.self!==window.top){var tb=document.querySelectorAll('#jzCover > div')[0];if(tb)tb.style.display='none';}
 var mode='std';
 document.querySelectorAll('.jzseg').forEach(function(b){b.onclick=function(){document.querySelectorAll('.jzseg').forEach(function(x){x.classList.remove('on')});b.classList.add('on');est();};});
 document.querySelectorAll('.jzmode').forEach(function(b){b.onclick=function(){document.querySelectorAll('.jzmode').forEach(function(x){x.classList.remove('on')});b.classList.add('on');mode=b.dataset.m;
  document.getElementById('jzStd').style.display=mode==='std'?'flex':'none';
  document.getElementById('jzSubj').style.display=mode==='subj'?'flex':'none';
  document.getElementById('jzNbWrap').style.display=mode==='nb'?'inline-block':'none';};});
 function pv(id){var v=parseFloat(document.getElementById(id).value);return isNaN(v)?null:v;}
 function myNb(){
  var g=document.querySelector('.jzseg.on').dataset.g;
  try{
   if(typeof STDCV==='undefined')return null;
   var t=STDCV[g]&&STDCV[g].ph;if(!t)return null;
   var a=pv('jzK'),b=pv('jzM'),c=pv('jzT1'),d=pv('jzT2');
   if([a,b,c,d].some(function(x){return x==null}))return null;
   var S=a+b+c+d;
   if(S>=t[0][1])return t[0][0];
   for(var i=1;i<t.length;i++){if(S>=t[i][1]){var p0=t[i-1][0],v0=t[i-1][1],p1=t[i][0],v1=t[i][1];return +(p0+(p1-p0)*(v0-S)/(v0-v1)).toFixed(2);}}
   return t[t.length-1][0];
  }catch(e){return null;}
 }
 function est(){var n=myNb();document.getElementById('jzEst').textContent=n==null?'-':n+'%';}
 ['jzK','jzM','jzT1','jzT2'].forEach(function(id){document.getElementById(id).addEventListener('input',est);});
 document.getElementById('jzReset').onclick=function(){['jzK','jzM','jzT1','jzT2','jzPK','jzPM','jzPT','jzNB2','jzE','jzH'].forEach(function(id){var e=document.getElementById(id);if(e)e.value='';});est();};
 document.getElementById('jzGo').onclick=function(){
  try{
   var g=document.querySelector('.jzseg.on').dataset.g;
   if(typeof GYE!=='undefined'){GYE=g;document.querySelectorAll('#gyeseg button').forEach(function(b){b.classList.toggle('on',b.dataset.gye===g);});}
   if(typeof switchInMode==='function')switchInMode(mode);
   function setv(id,v){var e=document.getElementById(id);if(e&&v!=null)e.value=v;}
   if(mode==='std'){if(pv('jzK')==null){alert('국·수·탐 표준점수를 입력하세요');return;}
    setv('sKor',pv('jzK'));setv('sMat',pv('jzM'));setv('sT1',pv('jzT1'));setv('sT2',pv('jzT2'));}
   else if(mode==='subj'){if(pv('jzPK')==null){alert('과목 백분위를 입력하세요');return;}
    setv('iKor',pv('jzPK'));setv('iMat',pv('jzPM'));setv('iTam',pv('jzPT'));setv('iEng',pv('jzE'));setv('iHan',pv('jzH'));}
   else {if(pv('jzNB2')==null){alert('전국 누백을 입력하세요');return;}setv('iNB',pv('jzNB2'));}
   setv('iEng',pv('jzE'));setv('iHan',pv('jzH'));
   if(typeof applyPredict==='function')applyPredict(false);
  }catch(e){}
  document.getElementById('jzCover').style.display='none';
 };
})();
</script>
</div>""")
def cover_susi(src):
    i=src.find('const D=[');D,_=dec.raw_decode(src,i+8)
    def find6(track,kws,rng=None):
        for r in D:
            if r[3]!=track:continue
            if not any(k in r[5] for k in kws):continue
            if track!='논술' and ('일반' not in r[4] and '균형' not in r[4] and 'ACE' not in r[4]):continue
            c=r[11]
            if rng:
                if c in (None,''):continue
                if not (rng[0]<=c<=rng[1]):continue
            return r
        return None
    gy=find6('교과',['컴퓨터'],(1.8,2.6));jh=find6('종합',['소프트웨어','컴퓨터'],(2.3,3.3));ns=find6('논술',['소프트웨어','컴퓨터'])
    def row(tag,color,r,metric):
        if not r:return ''
        return ('<div style="display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #e4eaf1;border-radius:12px;padding:12px 16px;margin-top:8px">'
         '<span style="font-size:11px;font-weight:800;color:%s;background:%s18;border-radius:6px;padding:3px 8px">%s</span>'
         '<span style="flex:1"><b style="color:#1e3550">%s %s</b><br><span style="font-size:12px;color:#8695a8">%s%s</span></span>'
         '<span style="font-family:monospace;font-size:16px;font-weight:800;color:#1e3550">%s</span></div>'
         %(color,color,tag,r[1],r[5],r[4].replace('학생부',''),(' · 모집 '+str(int(r[12])) if r[12] not in (None,'') else ''),metric))
    rows=(row('교과','#2f6fb3',gy,('70% '+str(gy[11])) if gy else '')
        + row('종합','#1f8a4c',jh,('70% '+str(jh[11])) if jh else '')
        + row('논술','#cf9a3a',ns,('경쟁 '+str(ns[13])+':1') if ns and ns[13] not in (None,'') else '최저 적용'))
    return CoverHTML('ss','입시배치표 · 수시',
     '지금 나의 내신','<span style="font-family:monospace">—.——</span><span style="font-size:22px"> 등급</span>',
     '''<div style="font-size:12.5px;color:#52627a;margin-bottom:6px">전 과목 평균 등급</div>
        <input id="jzGR" type="number" step="0.01" placeholder="예: 2.34" style="width:100%;padding:11px;border:1px solid #d9e2ec;border-radius:9px;font-size:16px">
        <button id="jzGo2" style="width:100%;margin-top:12px;background:#2f6fb3;color:#fff;border:none;border-radius:10px;padding:13px;font-size:15px;font-weight:800;cursor:pointer">적용 — 유불리 보기</button>
        <div style="font-size:11.5px;color:#8695a8;margin-top:9px">정시 배치표와 같은 액자 — 적용하면 요약·전형별 입결이 펼쳐집니다</div>''',
     '전형별 입결 미리보기 <span style="font-size:11px;color:#cf9a3a;font-weight:700;background:#fdf6e7;border-radius:6px;padding:2px 7px">실데이터 예시</span>',
     rows+'<div style="font-size:11px;color:#8695a8;margin-top:10px">ⓘ 대학발표 입결 2024~2026 · 17,031개 모집단위</div>',
     '''document.getElementById('jzGo2').onclick=function(){
        var v=parseFloat(document.getElementById('jzGR').value);
        if(isNaN(v)){alert('평균 등급을 입력하세요');return;}
        try{var g=document.getElementById('grade');if(g){g.value=v;g.dispatchEvent(new Event('input'));}}catch(e){}
        document.getElementById('jzCover').style.display='none';};''')

def CoverHTML(uid,label,darkLab,darkVal,inputHtml,sumLab,sumHtml,goJs):
    return ('<div id="jzCover" style="position:fixed;inset:0;z-index:99999;background:#f4f6fa;overflow:auto;font-family:\'Pretendard Variable\',Pretendard,\'Malgun Gothic\',sans-serif">'
     +topbar(uid,label)+
     '<div style="max-width:900px;margin:0 auto;padding:34px 20px 60px">'
     '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="jzgrid">'
     '<div style="background:#1e3550;border-radius:16px;padding:26px 24px;color:#e8eef7">'
     '<div style="font-size:12.5px;font-weight:700;opacity:.8;margin-bottom:8px">'+darkLab+' <span style="float:right;font-size:11px;background:#2a476b;border-radius:6px;padding:2px 8px">입력 대기</span></div>'
     '<div style="font-size:46px;font-weight:800;margin:12px 0 4px">'+darkVal+'</div>'
     '<button onclick="document.getElementById(\'jz'+('NB' if uid=='jg' else 'GR')+'\').focus()" style="margin-top:14px;background:#2f6fb3;color:#fff;border:none;border-radius:9px;padding:9px 20px;font-size:13.5px;font-weight:700;cursor:pointer">시작하기</button></div>'
     '<div style="background:#fff;border:1px solid #e4eaf1;border-radius:16px;padding:24px"><div style="font-size:14px;font-weight:800;color:#1e3550;margin-bottom:12px">내 '+('점수' if uid=='jg' else '내신')+' 입력</div>'+inputHtml+'</div>'
     '</div>'
     '<div style="margin-top:22px"><div style="font-size:14px;font-weight:800;color:#1e3550;margin-bottom:10px">'+sumLab+'</div>'+sumHtml+'</div>'
     '<div style="margin-top:18px;text-align:center"><button onclick="document.getElementById(\'jzCover\').style.display=\'none\'" style="background:none;border:1px solid #d9e2ec;border-radius:9px;padding:9px 22px;font-size:13px;color:#52627a;cursor:pointer">입력 없이 전체 표 열기 →</button></div>'
     '</div>'
     '<style>.jzseg{flex:1;padding:9px;border:1px solid #d9e2ec;border-radius:9px;background:#fff;font-size:14px;cursor:pointer}.jzseg.on{background:#1e3550;color:#fff;border-color:#1e3550}@media(max-width:700px){.jzgrid{grid-template-columns:1fr !important}}</style>'
     '<script>document.querySelectorAll(".jzseg").forEach(function(b){b.onclick=function(){document.querySelectorAll(".jzseg").forEach(function(x){x.classList.remove("on")});b.classList.add("on");};});'+goJs+'</script>'
     '</div>')

MASTERS=[
 ('수시_입결_전국_통합_v6_2026-07-09.html','야누스_수시배치표_2026-07-09.html','susi'),
 ('2027_정시_정밀배치표_v25_6월실채점_2026-07-13.html','야누스_정시배치표_2027_2026-07-13.html','jeongsi'),
 ('2026_수능정시_정밀배치표_v24_심리마지노선_2026-07-08.html','야누스_정시배치표_2026-07-09.html','jeongsi_v24'),
]
for src,dst,kind in MASTERS:
    if not os.path.exists(src):print('!! 없음',src);continue
    s=open(src,encoding='utf-8').read()
    s=s.replace('</head>',FONT+'\n</head>',1) if '</head>' in s else s
    if kind=='jeongsi': cov=cover_jeongsi(s)
    elif kind=='susi': cov=cover_susi(s)
    else: cov=None
    if cov:
        if '</body>' in s: s=s.replace('</body>',cov+'\n</body>',1)
        else: s+=cov
    open(dst,'w',encoding='utf-8').write(s)
    print('%s → %s (%.2fMB%s)'%(src,dst,os.path.getsize(dst)/1e6,' · 커버 주입' if cov else ''))
print('완료 — 배포판은 항상 이 스크립트로 재생성(직접 수정 금지).')
