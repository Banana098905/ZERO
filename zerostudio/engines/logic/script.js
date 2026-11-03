'use strict';
// 外部リンク先はここを書き換えるだけで変更できます
const CFG={codelab:'https://banana098905.github.io/CODE-LAB/',portfolio:'https://portfolio-flame-two-99.vercel.app/'};
const $=s=>document.querySelector(s),W=150,B=v=>v?1:0,
esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
fmt=v=>Number.isInteger(v)?v:(+v).toFixed(2);
const rise=(n,v,k='pv')=>{const r=B(v)&&!n.s[k];n.s[k]=B(v);return r};
const G=(n,f,one)=>({n,c:'論理ゲート',i:one?['A']:['A','B'],o:['出力'],d:n+'の真理値表どおりに動作します',p:{},ev:(_,i)=>[f(i[0],i[1])]});
const D={
sw:{n:'ON/OFFスイッチ',c:'入力',i:[],o:['Q'],d:'クリックでON/OFFを切り替えます',p:{on:0},ev:n=>[n.p.on?1:0]},
btn:{n:'押しボタン',c:'入力',i:[],o:['Q'],d:'実行中に押している間だけONになります',p:{},ev:n=>[n.s.h?1:0]},
cst:{n:'0/1定数',c:'入力',i:[],o:['Q'],d:'常に0か1を出力します',p:{v:1},ev:n=>[+n.p.v?1:0]},
num:{n:'数値入力',c:'入力',i:[],o:['値'],d:'設定した数値を出力します',p:{v:5},ev:n=>[+n.p.v||0]},
and:G('AND',(a,b)=>B(a&&b)),or:G('OR',(a,b)=>B(a||b)),not:G('NOT',a=>B(!a),1),
xor:G('XOR',(a,b)=>B(!a!=!b)),nand:G('NAND',(a,b)=>B(!(a&&b))),nor:G('NOR',(a,b)=>B(!(a||b))),
timer:{n:'タイマー',c:'時間・制御',i:['開始'],o:['出力'],d:'入力の立ち上がりで開始し、設定秒数だけONを出力します',p:{sec:3},
 ev:(n,i,dt)=>{if(rise(n,i[0]))n.s.t=+n.p.sec;n.s.t=Math.max(0,(n.s.t||0)-dt);return[n.s.t>0?1:0]}},
clk:{n:'クロック',c:'時間・制御',i:[],o:['出力'],d:'一定周期でON/OFFを繰り返します',p:{sec:1},
 ev:(n,_,dt)=>{n.s.t=(n.s.t||0)+dt;const T=Math.max(.1,+n.p.sec||1);return[n.s.t%T<T/2?1:0]}},
cnt:{n:'カウンター',c:'時間・制御',i:['CLK','RST'],o:['値'],d:'CLKの立ち上がりを数えます。RSTで0に戻ります',p:{max:10},
 ev:(n,i)=>{const r=rise(n,i[0]),m=Math.max(2,+n.p.max|0);if(i[1])n.s.c=0;else if(r)n.s.c=((n.s.c||0)+1)%m;return[n.s.c||0]}},
edge:{n:'立ち上がりエッジ検出',c:'時間・制御',i:['入力'],o:['パルス'],d:'0→1の瞬間だけ短いパルスを出力します',p:{},ev:(n,i)=>[B(rise(n,i[0]))]},
dly:{n:'遅延',c:'時間・制御',i:['入力'],o:['出力'],d:'入力を設定秒数だけ遅らせて出力します',p:{sec:1},
 ev:(n,i,dt)=>{const s=n.s;s.now=(s.now||0)+dt;s.q=s.q||[];s.q.push([s.now,B(i[0])]);const T=s.now-(+n.p.sec||0);
  while(s.q.length>1&&s.q[1][0]<=T)s.q.shift();return[s.q[0][0]<=T?s.q[0][1]:0]}},
lamp:{n:'ランプ',c:'出力',i:['入力'],o:[],d:'入力がONで点灯します',p:{col:'#22d3ee'},ev:()=>[]},
buzz:{n:'ブザー状態表示',c:'出力',i:['入力'],o:[],d:'入力がONで鳴動中と表示します',p:{},ev:()=>[]},
disp:{n:'数値表示',c:'出力',i:['入力'],o:[],d:'入力値を数字で表示します',p:{},ev:()=>[]},
sr:{n:'SRラッチ',c:'高度な部品',i:['S','R'],o:['Q','Q反転'],d:'S=1でセット、R=1でリセット。両方0なら保持、両方1は禁止状態で保持します',p:{},
 ev:(n,i)=>{let q=n.s.q||0;if(i[0]&&!i[1])q=1;else if(i[1]&&!i[0])q=0;n.s.q=q;return[q,1-q]}},
dff:{n:'Dフリップフロップ',c:'高度な部品',i:['D','CLK'],o:['Q','Q反転'],d:'CLKの立ち上がりでDを記憶します',p:{},
 ev:(n,i)=>{if(rise(n,i[1]))n.s.q=B(i[0]);const q=n.s.q||0;return[q,1-q]}},
add:{n:'加算器(全加算器)',c:'高度な部品',i:['A','B','Cin'],o:['和','桁上がり'],d:'1ビットの全加算器です',p:{},
 ev:(_,i)=>{const[a,b,c]=i.map(B);return[a^b^c,(a&b)|(c&(a^b))]}},
cmp:{n:'比較器',c:'高度な部品',i:['A','B'],o:['A>B','A=B','A<B'],d:'2つの数値を比較します',p:{},ev:(_,i)=>[B(i[0]>i[1]),B(i[0]==i[1]),B(i[0]<i[1])]}};
const PM={sw:[['on','ON','b']],cst:[['v','値(0/1)','n']],num:[['v','値','n']],timer:[['sec','ON時間(秒)','n']],clk:[['sec','周期(秒)','n']],cnt:[['max','法(最大値+1)','n']],dly:[['sec','遅延(秒)','n']],lamp:[['col','色','c']]};
// サンプル回路 [種類,x,y,設定,ラベル] と配線 [元,出力番号,先,入力番号]
const g2=(t,nm)=>({nm,h:'スイッチA・Bを切り替えて動作を確認します',n:[['sw',60,50,{on:1},'A'],['sw',60,180,{on:0},'B'],[t,300,110],['lamp',520,120]],w:[[0,0,2,0],[1,0,2,1],[2,0,3,0]]});
const SA=[
{nm:'スイッチとランプ',h:'スイッチをクリックするとランプが点灯します',n:[['sw',80,100],['lamp',360,100]],w:[[0,0,1,0]]},
g2('and','AND回路'),g2('or','OR回路'),
{nm:'NOT回路',h:'入力が反転して出力されます',n:[['sw',80,100],['not',300,100],['lamp',520,100]],w:[[0,0,1,0],[1,0,2,0]]},
g2('xor','XOR回路'),
{nm:'自動信号機',h:'クロックを数え、0〜2が青、3が黄、4〜5が赤になります',n:[['clk',40,100,{sec:1}],['cnt',240,100,{max:6}],['num',240,260,{v:3}],['cmp',450,150],['lamp',700,40,{col:'#22ff88'},'青'],['lamp',700,150,{col:'#facc15'},'黄'],['lamp',700,260,{col:'#f43f5e'},'赤']],w:[[0,0,1,0],[1,0,3,0],[2,0,3,1],[3,2,4,0],[3,1,5,0],[3,0,6,0]]},
{nm:'タイマー付き自動ドア',h:'実行して押しボタンを押し続けると、3秒間ドアが開きます',n:[['btn',60,100,{},'人感センサー'],['timer',280,100,{sec:3}],['lamp',520,60,{col:'#22d3ee'},'ドア開'],['buzz',520,170]],w:[[0,0,1,0],[1,0,2,0],[1,0,3,0]]},
{nm:'カウンター',h:'上はクロックで自動カウント、下はボタンを押すたびに加算します',n:[['clk',40,60,{sec:1}],['cnt',250,60,{max:10}],['disp',470,60],['btn',40,220],['cnt',250,220,{max:10}],['disp',470,220]],w:[[0,0,1,0],[1,0,2,0],[3,0,4,0],[4,0,5,0]]}];

let S={name:'無題の回路',nodes:[],wires:[]},sel=new Set,selW=null,vx=200,vy=60,z=1,tm=null,pend=null,dr=null,U=[],R=[],uid=1,wid=1,pk='',warned=0,st;
const N=id=>S.nodes.find(n=>n.id==id),svg=$('#svg');
const mk=r=>({id:r.id,t:r.t,x:r.x,y:r.y,p:{...D[r.t].p,...r.p},lb:r.lb||'',s:{},o:D[r.t].o.map(()=>0),inp:[]});
const data=()=>({v:1,name:S.name,nodes:S.nodes.map(({id,t,x,y,p,lb})=>({id,t,x,y,p,lb})),wires:S.wires.map(({id,from,fo,to,ti})=>({id,from,fo,to,ti}))});
function clean(d){
 if(!d||d.v!==1||!Array.isArray(d.nodes)||!Array.isArray(d.wires))throw Error('形式が不正、または非対応のバージョンです');
 if(d.nodes.length>400)throw Error('部品が多すぎます');
 const m=new Map,nodes=d.nodes.map(r=>{if(!r||!D[r.t]||!isFinite(r.x)||!isFinite(r.y)||!Number.isInteger(r.id)||m.has(r.id))throw Error('不正な部品データが含まれています');
  m.set(r.id,r);return{id:r.id,t:r.t,x:+r.x,y:+r.y,p:r.p&&typeof r.p=='object'?r.p:{},lb:String(r.lb||'').slice(0,20)}});
 const used=new Set,wires=[];
 d.wires.forEach(w=>{const a=w&&m.get(w.from),b=w&&m.get(w.to);if(!a||!b||!(w.fo>=0&&w.fo<D[a.t].o.length)||!(w.ti>=0&&w.ti<D[b.t].i.length))throw Error('不正な接続データが含まれています');
  const k=w.to+':'+w.ti;if(!used.has(k)){used.add(k);wires.push({id:wires.length+1,from:w.from,fo:w.fo,to:w.to,ti:w.ti})}});
 return{name:String(d.name||'無題の回路').slice(0,40),nodes,wires}}
function setData(c,keep){const old=new Map(S.nodes.map(n=>[n.id,n]));
 S.name=c.name;S.nodes=c.nodes.map(r=>{const n=mk(r),o=old.get(r.id);if(keep&&o&&o.t==n.t){n.s=o.s;n.o=o.o}return n});S.wires=c.wires;
 uid=Math.max(0,...S.nodes.map(n=>n.id))+1;wid=Math.max(0,...S.wires.map(w=>w.id))+1;sel=new Set;selW=null;pend=null;pk='';$('#pname').value=S.name;window.ANL&&ANL.circuitChanged();draw()}
function sv(){clearTimeout(st);st=setTimeout(()=>{try{localStorage.setItem('lp.auto',JSON.stringify(data()))}catch(e){log('自動保存に失敗しました: '+e.message,'e')}},300)}
const push=()=>{U.push(JSON.stringify(data()));if(U.length>100)U.shift();R=[];sv()};
function undo(){if(!U.length)return toast('これ以上戻せません');R.push(JSON.stringify(data()));setData(clean(JSON.parse(U.pop())),1);sv()}
function redo(){if(!R.length)return toast('これ以上やり直せません');U.push(JSON.stringify(data()));setData(clean(JSON.parse(R.pop())),1);sv()}
function log(m,k=''){const l=$('#log'),d=document.createElement('div');d.className=k;d.textContent='['+new Date().toLocaleTimeString('ja-JP')+'] '+m;l.prepend(d);while(l.children.length>80)l.lastChild.remove()}
let tt;function toast(m,k=''){const t=$('#toast');t.textContent=m;t.className='show '+k;clearTimeout(tt);tt=setTimeout(()=>t.className='',2200)}

// ---- 編集操作 ----
function add(t){push();const r=svg.getBoundingClientRect(),o=(S.nodes.length%8)*20,n=mk({id:uid++,t,x:Math.round(((r.width/2-vx)/z-W/2+o)/10)*10,y:Math.round(((r.height/2-vy)/z-40+o)/10)*10});
 S.nodes.push(n);sel=new Set([n.id]);selW=null;draw()}
function del(){if(selW!=null){push();S.wires=S.wires.filter(w=>w.id!=selW);selW=null}
 else if(sel.size){push();S.nodes=S.nodes.filter(n=>!sel.has(n.id));S.wires=S.wires.filter(w=>!sel.has(w.from)&&!sel.has(w.to));sel.clear()}else return;pk='';draw()}
function dup(){if(!sel.size)return;push();const m=new Map,ns=[...sel].map(id=>{const o=N(id),n=mk({...o,id:uid++,x:o.x+30,y:o.y+30,p:{...o.p}});m.set(id,n.id);return n});
 S.nodes.push(...ns);S.wires.filter(w=>m.has(w.from)&&m.has(w.to)).forEach(w=>S.wires.push({id:wid++,from:m.get(w.from),fo:w.fo,to:m.get(w.to),ti:w.ti}));
 sel=new Set(ns.map(n=>n.id));pk='';draw()}
function conn(a,ao,b,bi){
 if(a.id==b.id)return log('自分自身には接続できません','e');
 if(S.wires.some(w=>w.from==a.id&&w.fo==ao&&w.to==b.id&&w.ti==bi))return log('すでに接続されています','w');
 push();if(S.wires.some(w=>w.to==b.id&&w.ti==bi))log('入力端子は1本のみ接続できるため、既存の接続を置き換えました','w');
 S.wires=S.wires.filter(w=>!(w.to==b.id&&w.ti==bi));S.wires.push({id:wid++,from:a.id,fo:ao,to:b.id,ti:bi});log(`${D[a.t].n} → ${D[b.t].n} を接続しました`,'i')}

// ---- 描画 ----
const hOf=n=>50+Math.max(D[n.t].i.length,D[n.t].o.length,1)*22,pp=(n,o,i)=>[n.x+(o?W:0),n.y+40+i*22];
function body(n,h){const c=W/2,y=h-18,v=n.inp[0]||0;
 switch(n.t){
 case'sw':return`<rect class="tg${n.p.on?' on':''}" x="${c-24}" y="${y-10}" width="48" height="20" rx="10"/><circle class="kn" cx="${n.p.on?c+14:c-14}" cy="${y}" r="8"/>`;
 case'btn':return`<circle class="bt${n.s.h?' on':''}" cx="${c}" cy="${y}" r="11"/>`;
 case'lamp':return`<circle class="lp" cx="${c}" cy="${y}" r="12" style="${v?`fill:${esc(n.p.col)};filter:drop-shadow(0 0 8px ${esc(n.p.col)})`:''}"/>`;
 case'buzz':return`<text class="bd" x="${c}" y="${y+4}">${v?'🔔 鳴動中':'🔇 停止'}</text>`;
 case'disp':return`<text class="bd big" x="${c}" y="${y+6}">${fmt(v)}</text>`;
 default:return n.o.length?`<text class="bd" x="${c}" y="${y+4}">${n.o.map(fmt).join(' / ')}</text>`:''}}
function nodeSvg(n){const d=D[n.t],h=hOf(n);
 return`<g class="n${sel.has(n.id)?' sel':''}" data-n="${n.id}" transform="translate(${n.x},${n.y})"><rect class="nb" width="${W}" height="${h}" rx="10"/><text class="nt" x="10" y="19">${esc(n.lb||d.n)}</text>`+
 d.i.map((l,i)=>`<circle class="p${n.inp[i]?' on':''}${pend&&pend.n==n&&pend.i==i?' pd':''}" data-p="i${i}" cx="0" cy="${40+i*22}" r="8"/><text x="13" y="${44+i*22}">${l}</text>`).join('')+
 d.o.map((l,i)=>`<circle class="p${n.o[i]?' on':''}${pend&&pend.n==n&&pend.i==i?' pd':''}" data-p="o${i}" cx="${W}" cy="${40+i*22}" r="8"/><text x="${W-13}" y="${44+i*22}" text-anchor="end">${l}</text>`).join('')+body(n,h)+'</g>'}
function draw(){
 $('#wl').innerHTML=S.wires.map(w=>{const a=N(w.from),b=N(w.to);if(!a||!b)return'';const[x1,y1]=pp(a,1,w.fo),[x2,y2]=pp(b,0,w.ti),d=`M${x1} ${y1}C${x1+70} ${y1} ${x2-70} ${y2} ${x2} ${y2}`;
  return`<path class="wh" data-w="${w.id}" d="${d}"/><path class="w${a.o[w.fo]?' on':''}${w.id==selW?' sel':''}" d="${d}"/>`}).join('');
 $('#nl').innerHTML=S.nodes.map(nodeSvg).join('');
 $('#empty').style.display=S.nodes.length?'none':'grid';
 $('#info').innerHTML=`部品: ${S.nodes.length}<br>接続: ${S.wires.length}<br>状態: ${tm?'実行中':'停止中'}<br>ズーム: ${Math.round(z*100)}%`;
 const k=[...sel].join()+'|'+selW+'|'+S.nodes.length;if(k!=pk){pk=k;props()}}
const view=()=>{$('#vp').setAttribute('transform',`translate(${vx} ${vy}) scale(${z})`);$('#info').innerHTML=$('#info').innerHTML.replace(/ズーム: \d+%/,`ズーム: ${Math.round(z*100)}%`)};
function fit(){if(!S.nodes.length){vx=200;vy=60;z=1;return view()}const r=svg.getBoundingClientRect(),
 x0=Math.min(...S.nodes.map(n=>n.x)),y0=Math.min(...S.nodes.map(n=>n.y)),x1=Math.max(...S.nodes.map(n=>n.x+W)),y1=Math.max(...S.nodes.map(n=>n.y+hOf(n)));
 z=Math.min(1.5,Math.max(.3,Math.min(r.width/(x1-x0+80),r.height/(y1-y0+80))));vx=(r.width-(x1-x0)*z)/2-x0*z;vy=(r.height-(y1-y0)*z)/2-y0*z;view()}
function zoom(f,mx,my){const r=svg.getBoundingClientRect();mx=mx??r.width/2;my=my??r.height/2;const nz=Math.min(2.5,Math.max(.3,z*f));vx=mx-(mx-vx)/z*nz;vy=my-(my-vy)/z*nz;z=nz;view()}
function props(){const el=$('#props');
 if(sel.size!=1){el.innerHTML='<h3>プロパティ</h3><p class="mu">'+(sel.size?sel.size+'個の部品を選択中':selW!=null?'接続線を選択中。Deleteで切断します。':'部品を選択すると設定を編集できます。')+'</p>';return}
 const n=N([...sel][0]),d=D[n.t];
 el.innerHTML=`<h3>${d.n}</h3><p class="mu">${d.d}</p><label>ラベル<input data-k="lb" value="${esc(n.lb)}" maxlength="20"></label>`+
 (PM[n.t]||[]).map(([k,l,t])=>`<label>${l}<input data-k="${k}" ${t=='b'?'type="checkbox"'+(n.p[k]?' checked':''):`type="${t=='c'?'color':'number'}" step="any" value="${esc(n.p[k])}"`}></label>`).join('')+
 `<p class="mu">入力: ${d.i.join(', ')||'なし'}<br>出力: ${d.o.join(', ')||'なし'}</p><button id="pd">複製</button> <button id="px">削除</button>`}
$('#props').addEventListener('change',e=>{const k=e.target.dataset.k,n=sel.size==1&&N([...sel][0]);if(!k||!n)return;
 if(e.target.type=='number'&&e.target.value==='')return;push();
 if(k=='lb')n.lb=e.target.value;else n.p[k]=e.target.type=='checkbox'?+e.target.checked:e.target.type=='number'?+e.target.value:e.target.value;draw()});
$('#props').addEventListener('click',e=>{if(e.target.id=='pd')dup();if(e.target.id=='px')del()});

// ---- シミュレーション ----
function order(){const dg=new Map(S.nodes.map(n=>[n.id,0])),adj=new Map(S.nodes.map(n=>[n.id,[]]));
 S.wires.forEach(w=>{dg.set(w.to,dg.get(w.to)+1);adj.get(w.from).push(w.to)});
 const q=S.nodes.filter(n=>!dg.get(n.id)),o=[];
 while(q.length){const n=q.shift();o.push(n);adj.get(n.id).forEach(t=>{const c=dg.get(t)-1;dg.set(t,c);if(!c)q.push(N(t))})}
 const cyc=o.length<S.nodes.length;if(cyc)S.nodes.forEach(n=>{if(!o.includes(n))o.push(n)});return[o,cyc]}
function step(dt){const[o,cyc]=order();if(cyc&&!warned){warned=1;log('循環接続を検出しました。無限ループを避けるため1ステップ遅延で計算します','w');window.ANL&&ANL.sys('circ','warn','循環接続を検出（1ステップ遅延で計算。要確認）')}
 o.forEach(n=>{const d=D[n.t];n.inp=d.i.map((_,i)=>{const w=S.wires.find(w=>w.to==n.id&&w.ti==i);return w?N(w.from).o[w.fo]||0:0});n.o=d.ev(n,n.inp,dt)});window.ANL&&ANL.after(dt)}
function start(){if(tm)return;if(!S.nodes.length)return log('部品がありません。先に部品を配置してください','w');warned=0;let l=performance.now();
 tm=setInterval(()=>{const t=performance.now();try{step(Math.min((t-l)/1e3,.25))}catch(x){stop();window.ANL&&ANL.sys('circ','err','計算エラー: '+x.message,x.stack);log('計算エラー: '+x.message,'e')}l=t;draw()},50);log('シミュレーションを開始しました','i');window.ANL&&ANL.sys('circ','sim','シミュレーション開始');ui()}
function stop(q){if(!tm)return;clearInterval(tm);tm=null;if(!q)log('停止しました','i');window.ANL&&ANL.sys('circ','sim','シミュレーション停止');ui();draw()}
function resetSim(){stop(1);S.nodes.forEach(n=>{n.s={};n.o=D[n.t].o.map(()=>0);n.inp=[]});log('状態をリセットしました','i');window.ANL&&ANL.reset();draw()}
const ui=()=>{$('#run').disabled=!!tm;$('#stop').disabled=!tm};

// ---- 入力操作 ----
const wp=e=>{const r=svg.getBoundingClientRect();return[(e.clientX-r.left-vx)/z,(e.clientY-r.top-vy)/z]};
svg.addEventListener('pointerdown',e=>{e.preventDefault();svg.focus();const t=e.target,pn=t.closest('[data-p]'),nd=t.closest('[data-n]'),wh=t.closest('[data-w]'),[x,y]=wp(e);dr=null;
 if(pn&&nd){const n=N(nd.dataset.n),k=pn.dataset.p[0],i=+pn.dataset.p.slice(1);
  if(k=='o')dr={m:'wire',n,i,x0:e.clientX,y0:e.clientY};
  else if(pend){conn(pend.n,pend.i,n,i);pend=null}
  else{const w=S.wires.find(w=>w.to==n.id&&w.ti==i);if(w){selW=w.id;sel.clear()}else log('接続は出力端子（部品の右側）から始めてください','w')}}
 else if(nd){const n=N(nd.dataset.n);selW=null;
  if(e.shiftKey)sel.has(n.id)?sel.delete(n.id):sel.add(n.id);else if(!sel.has(n.id))sel=new Set([n.id]);
  if((n.t=='sw'||n.t=='btn')&&y-n.y>26&&!e.shiftKey){if(n.t=='btn')n.s.h=1;dr={m:n.t,n}}
  else dr={m:'move',x,y,sn:JSON.stringify(data()),s:[...sel].map(id=>{const q=N(id);return[q,q.x,q.y]})}}
 else if(wh){selW=+wh.dataset.w;sel.clear()}
 else{sel.clear();selW=null;pend=null;dr={m:'pan',x:e.clientX,y:e.clientY,vx,vy}}
 draw()});
addEventListener('pointermove',e=>{if(!dr)return;const[x,y]=wp(e);
 if(dr.m=='pan'){vx=dr.vx+e.clientX-dr.x;vy=dr.vy+e.clientY-dr.y;view()}
 else if(dr.m=='move'){const dx=x-dr.x,dy=y-dr.y;if(!dr.mv){if(Math.hypot(dx,dy)*z<4)return;dr.mv=1;U.push(dr.sn);R=[]}
  dr.s.forEach(([n,a,b])=>{n.x=Math.round((a+dx)/10)*10;n.y=Math.round((b+dy)/10)*10});draw()}
 else if(dr.m=='wire'){dr.mv=dr.mv||Math.hypot(e.clientX-dr.x0,e.clientY-dr.y0)>5;const[a,b]=pp(dr.n,1,dr.i);$('#tmp').setAttribute('d',`M${a} ${b}L${x} ${y}`)}});
const up=e=>{if(!dr)return;const d=dr;dr=null;
 if(d.m=='wire'){$('#tmp').setAttribute('d','');
  if(d.mv){const el=document.elementFromPoint(e.clientX,e.clientY),pn=el&&el.closest('[data-p]'),nd=el&&el.closest('[data-n]');
   if(pn&&nd&&pn.dataset.p[0]=='i')conn(d.n,d.i,N(nd.dataset.n),+pn.dataset.p.slice(1));else log('入力端子（部品の左側）まで線をドラッグしてください','w');pend=null}
  else pend={n:d.n,i:d.i};draw()}
 else if(d.m=='sw'){push();d.n.p.on=d.n.p.on?0:1;pk='';draw()}
 else if(d.m=='btn'){d.n.s.h=0;draw()}
 else if(d.m=='move'&&d.mv)sv()};
addEventListener('pointerup',up);addEventListener('pointercancel',up);
svg.addEventListener('wheel',e=>{e.preventDefault();const r=svg.getBoundingClientRect();zoom(e.deltaY<0?1.1:.9,e.clientX-r.left,e.clientY-r.top)},{passive:false});
svg.tabIndex=0;
addEventListener('keydown',e=>{const m=e.ctrlKey||e.metaKey,k=e.key.toLowerCase(),f=/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
 if(m&&k=='s'){e.preventDefault();return document.querySelector('header').dataset.tab=='machine'?MLAB.save():save()}if(f||(document.querySelector('header').dataset.tab||'circuit')!='circuit')return;
 if(m&&k=='z'){e.preventDefault();e.shiftKey?redo():undo()}else if(m&&k=='y'){e.preventDefault();redo()}
 else if(m&&k=='d'){e.preventDefault();dup()}
 else if(k=='delete'||k=='backspace'){e.preventDefault();del()}
 else if(k=='escape'){pend=null;sel.clear();selW=null;draw()}
 else if(k.startsWith('arrow')&&sel.size&&e.target==svg){e.preventDefault();push();const s=e.shiftKey?50:10;sel.forEach(id=>{const n=N(id);n.x+=k=='arrowright'?s:k=='arrowleft'?-s:0;n.y+=k=='arrowdown'?s:k=='arrowup'?-s:0});draw()}});

// ---- 保存・共有 ----
const P=()=>{try{return JSON.parse(localStorage.getItem('lp.proj'))||{}}catch{return{}}};
function plist(){$('#plist').innerHTML=Object.keys(P()).map(k=>`<option>${esc(k)}</option>`).join('')||'<option value="">（保存なし）</option>'}
function save(){try{const p=P();p[S.name]=data();localStorage.setItem('lp.proj',JSON.stringify(p));plist();$('#plist').value=S.name;toast(`「${S.name}」を保存しました`)}catch(e){toast('保存に失敗しました: '+e.message,'e')}}
$('#save').onclick=save;
$('#load').onclick=()=>{const k=$('#plist').value,p=P()[k];if(!p)return toast('読み込む項目がありません','e');
 try{const c=clean(p);push();setData(c);fit();toast(`「${k}」を読み込みました`)}catch(e){toast('読み込み失敗: '+e.message+'（現在の回路は変更されていません）','e')}};
$('#del').onclick=()=>{const k=$('#plist').value,p=P();if(!p[k]||!confirm(`「${k}」を削除しますか？`))return;delete p[k];localStorage.setItem('lp.proj',JSON.stringify(p));plist();toast('削除しました')};
$('#new').onclick=()=>{if(S.nodes.length&&!confirm('現在の回路は自動保存されています。新規プロジェクトを作成しますか？'))return;push();stop(1);setData({name:'無題の回路',nodes:[],wires:[]});fit()};
$('#pname').onchange=e=>{push();S.name=e.target.value.trim()||'無題の回路';e.target.value=S.name};
$('#exp').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data(),null,1)],{type:'application/json'}));a.download=S.name+'.json';a.click();URL.revokeObjectURL(a.href);toast('JSONを出力しました')};
$('#imp').onclick=()=>$('#file').click();
$('#file').onchange=e=>{const f=e.target.files[0];e.target.value='';if(!f)return;const r=new FileReader();
 r.onload=()=>{try{const c=clean(JSON.parse(r.result));push();stop(1);setData(c);fit();toast('JSONを読み込みました')}catch(x){toast('読み込み失敗: '+x.message+'（現在の回路は変更されていません）','e')}};r.readAsText(f)};
$('#share').onclick=()=>{const h='#c='+btoa(unescape(encodeURIComponent(JSON.stringify(data()))));
 if(h.length>2000)return toast('回路が大きいためURL共有できません。JSON出力を使ってください','e');
 const u=location.href.split('#')[0]+h;navigator.clipboard?navigator.clipboard.writeText(u).then(()=>toast('共有URLをコピーしました'),()=>prompt('共有URL',u)):prompt('共有URL',u)};

// ---- 初期化 ----
const lib=$('#lib');let cat='';
Object.entries(D).forEach(([t,d])=>{if(d.c!=cat){cat=d.c;lib.insertAdjacentHTML('beforeend',`<h4>${cat}</h4>`)}lib.insertAdjacentHTML('beforeend',`<button data-add="${t}" title="${esc(d.d)}">${d.n}<small>${d.d.slice(0,22)}</small></button>`)});
lib.onclick=e=>{const b=e.target.closest('[data-add]');if(b)add(b.dataset.add)};
$('#samples').innerHTML='<option value="">サンプル回路…</option>'+SA.map((s,i)=>`<option value="${i}">${s.nm}</option>`).join('');
$('#samples').onchange=e=>{const s=SA[e.target.value];e.target.value='';if(!s)return;push();stop(1);
 setData(clean({v:1,name:s.nm,nodes:s.n.map((r,i)=>({id:i+1,t:r[0],x:r[1],y:r[2],p:r[3]||{},lb:r[4]||''})),wires:s.w.map(w=>({from:w[0]+1,fo:w[1],to:w[2]+1,ti:w[3]}))}));fit();log(`サンプル「${s.nm}」: ${s.h}`,'i');toast(`「${s.nm}」を読み込みました`)};
$('#run').onclick=start;$('#stop').onclick=()=>stop();$('#reset').onclick=resetSim;$('#undo').onclick=undo;$('#redo').onclick=redo;$('#fit').onclick=fit;
$('#zi').onclick=()=>zoom(1.2);$('#zo').onclick=()=>zoom(.8);
$('#l1').href=CFG.codelab;$('#l2').href=CFG.portfolio;
const TUT='<b>はじめてのチュートリアル</b> <button id="tx">閉じる</button><ol><li>左の「ON/OFFスイッチ」をクリックして配置</li><li>「ランプ」も配置</li><li>スイッチの右の●をクリックし、ランプの左の●をクリックして接続（ドラッグも可）</li><li>「▶ 実行」を押し、スイッチ下部のつまみをクリックしてランプを確認</li></ol>';
function tut(s){$('#tut').innerHTML=s?TUT:'';if(!s)localStorage.setItem('lp.tut','1')}
$('#help').onclick=()=>tut(1);$('#tut').onclick=e=>{if(e.target.id=='tx')tut(0)};
(function init(){plist();ui();$('#pname').value=S.name;
 try{const h=location.hash;
  if(h.startsWith('#c=')){setData(clean(JSON.parse(decodeURIComponent(escape(atob(h.slice(3)))))));log('共有URLの回路を読み込みました','i')}
  else{const a=localStorage.getItem('lp.auto');if(a){try{setData(clean(JSON.parse(a)));log('前回の回路を復元しました','i')}catch(e){localStorage.setItem('lp.broken',a);log('自動保存データを読み込めませんでした（lp.brokenに退避）: '+e.message,'e')}}}
 }catch(e){toast('共有URLを読み込めませんでした: '+e.message,'e')}
 if(!localStorage.getItem('lp.tut'))tut(1);fit();draw()})();

// ================= LOGIC PLAYGROUND 2.0: CPU Lab =================
//#CORE-START
const CPUCORE=(()=>{
const REG=['A','B','C','D'],hx=v=>(v&255).toString(16).toUpperCase().padStart(2,'0');
// [ニーモニック, オペランド形(r=レジスタ,i=即値/ラベル,m=[アドレス],p=[レジスタ]), 命令コード, 説明]
const ISA=[['NOP','',0,'何もしない'],['HLT','',1,'停止'],['LDI','r,i',0x10,'即値をレジスタへ'],['LD','r,m',0x11,'メモリ[addr]→レジスタ'],['ST','m,r',0x12,'レジスタ→メモリ[addr]'],
['LD','r,p',0x13,'メモリ[レジスタ]→レジスタ'],['ST','p,r',0x14,'レジスタ→メモリ[レジスタ]'],['MOV','r,r',0x15,'レジスタ間コピー'],
['ADD','r,r',0x20,'加算 (Z,C,N更新)'],['SUB','r,r',0x21,'減算 (C=借り)'],['AND','r,r',0x22,'論理積'],['OR','r,r',0x23,'論理和'],['XOR','r,r',0x24,'排他的論理和'],['CMP','r,r',0x25,'比較(減算してフラグのみ更新)'],
['INC','r',0x26,'+1 (Z,N更新)'],['DEC','r',0x27,'-1 (Z,N更新)'],
['ADD','r,i',0x28,'即値加算'],['SUB','r,i',0x29,'即値減算'],['AND','r,i',0x2A,'即値論理積'],['OR','r,i',0x2B,'即値論理和'],['XOR','r,i',0x2C,'即値XOR'],['CMP','r,i',0x2D,'即値比較'],['NOT','r',0x2E,'ビット反転'],
['JMP','i',0x30,'無条件ジャンプ'],['JZ','i',0x31,'Z=1ならジャンプ'],['JNZ','i',0x32,'Z=0ならジャンプ'],['JC','i',0x33,'C=1ならジャンプ'],['JNC','i',0x34,'C=0ならジャンプ'],['JN','i',0x35,'N=1ならジャンプ'],
['IN','r',0x40,'入力値(IN欄)→レジスタ'],['OUT','r',0x41,'レジスタ→出力履歴']];
const BYKEY={},BYOP={},MN=new Set;
ISA.forEach(([m,s,op])=>{BYKEY[m+' '+s]={m,s,op};BYOP[op]={m,s,op,n:s?s.split(',').length:0};MN.add(m)});
const shp=a=>/^[ABCD]$/i.test(a)?'r':/^\[[ABCD]\]$/i.test(a)?'p':/^\[.+\]$/.test(a)?'m':'i';
function num(t){t=String(t).trim();if(/^0x[0-9a-f]+$/i.test(t))return parseInt(t,16);if(/^0b[01]+$/i.test(t))return parseInt(t.slice(2),2);if(/^-?\d+$/.test(t))return parseInt(t,10);return NaN}
function assemble(src){
 const errs=[],lab={},items=[];let pc=0;const E=(ln,msg)=>errs.push({ln:ln+1,msg});
 String(src).split('\n').forEach((raw,ln)=>{
  let l=raw.replace(/;.*/,'').trim(),m;
  while(l&&(m=l.match(/^([A-Za-z_]\w*):\s*(.*)$/))){const k=m[1].toUpperCase();
   if(lab[k]!=null)E(ln,`ラベル「${m[1]}」が重複しています`);else if(REG.includes(k)||MN.has(k))E(ln,`「${m[1]}」はラベル名に使えません`);else lab[k]=pc;l=m[2]}
  if(!l)return;
  const mm=l.match(/^(\.?[A-Za-z]\w*)\s*(.*)$/);if(!mm)return E(ln,`構文エラー: ${l}`);
  const op=mm[1].toUpperCase(),args=mm[2]?mm[2].split(',').map(s=>s.trim()):[];
  if(op=='.DB'){if(!args.length)return E(ln,'.DB には値が必要です');args.forEach(a=>items.push({ln,k:'d',a,at:pc++}));return}
  const e=BYKEY[op+' '+args.map(shp).join(',')];
  if(!e)return E(ln,MN.has(op)?`${op} のオペランドが不正です`:`未知の命令: ${mm[1]}`);
  items.push({ln,k:'i',e,args,at:pc});pc+=1+args.length});
 if(pc>256)E(0,`プログラムが大きすぎます（${pc}バイト／上限256）`);
 const bytes=[],kinds=[];
 const val=(ln,a,s)=>{if(s=='r'||s=='p')return REG.indexOf(a.replace(/[\[\]]/g,'').toUpperCase());
  if(s=='m')a=a.slice(1,-1).trim();let v=num(a);
  if(isNaN(v)){const k=a.toUpperCase();if(lab[k]==null){E(ln,`未定義の値またはラベル: ${a||'(空)'}`);return 0}v=lab[k]}
  if(v<-128||v>255){E(ln,`値が範囲外です (-128〜255): ${a}`);return 0}return v&255};
 items.forEach(it=>{if(it.k=='d'){bytes[it.at]=val(it.ln,it.a,'i');kinds[it.at]='d'}
  else{bytes[it.at]=it.e.op;kinds[it.at]='c';const sh=it.e.s?it.e.s.split(','):[];it.args.forEach((a,i)=>{bytes[it.at+1+i]=val(it.ln,a,sh[i]);kinds[it.at+1+i]='c'})}});
 return{bytes,kinds,errs,labels:lab,size:pc}}
const newCpu=()=>({r:[0,0,0,0],pc:0,f:{z:0,c:0,n:0},mem:new Uint8Array(256),kind:Array(256).fill(''),halted:false,err:'',out:[],cyc:0,rd:-1,wr:-1,hist:[],inp:0,msg:'',loaded:false});
function wr(c,a,v){v&=255;c.hist.push({cyc:c.cyc,a,o:c.mem[a],n:v});if(c.hist.length>200)c.hist.shift();c.mem[a]=v;c.wr=a}
function reset(c){Object.assign(c,{r:[0,0,0,0],pc:0,f:{z:0,c:0,n:0},halted:false,err:'',out:[],cyc:0,rd:-1,wr:-1,msg:''})}
function load(c,as){c.mem.fill(0);c.kind=Array(256).fill('');as.bytes.forEach((b,i)=>{if(b!=null&&i<256){c.mem[i]=b;c.kind[i]=as.kinds[i]}});reset(c);c.hist=[];c.loaded=true}
function step(c){
 if(c.halted)return false;c.rd=c.wr=-1;c.msg='';
 const pc=c.pc,fault=m=>{c.halted=true;c.err=m;return false};
 if(pc>255)return fault('PCがメモリ範囲(0〜255)を超えました');
 const e=BYOP[c.mem[pc]];
 if(!e)return fault(`不正な命令コード 0x${hx(c.mem[pc])} (アドレス 0x${hx(pc)})`);
 if(pc+e.n>255)return fault(`命令がメモリ末尾を超えています (アドレス 0x${hx(pc)})`);
 const sh=e.s?e.s.split(','):[],a=sh.map((_,i)=>c.mem[pc+1+i]);
 for(let i=0;i<e.n;i++)if((sh[i]=='r'||sh[i]=='p')&&a[i]>3)return fault(`不正なレジスタ番号 ${a[i]} (アドレス 0x${hx(pc)})`);
 c.pc=pc+1+e.n;const r=c.r,m=e.m,F=c.f;
 const fl=(v,cy)=>{F.z=+(v==0);F.n=v>>7;if(cy!=null)F.c=cy};
 const rdm=ad=>{c.rd=ad;return c.mem[ad]};
 const put=(ad,v)=>{if(c.kind[ad]=='c')c.msg=`警告: プログラム領域 0x${hx(ad)} を書き換えました`;wr(c,ad,v)};
 switch(m){
 case'NOP':break;
 case'HLT':c.halted=true;c.pc=pc;break;
 case'LDI':r[a[0]]=a[1];break;
 case'LD':r[a[0]]=rdm(sh[1]=='p'?r[a[1]]:a[1]);break;
 case'ST':sh[0]=='p'?put(r[a[0]],r[a[1]]):put(a[0],r[a[1]]);break;
 case'MOV':r[a[0]]=r[a[1]];break;
 case'ADD':case'SUB':case'AND':case'OR':case'XOR':case'CMP':{const x=r[a[0]],y=sh[1]=='r'?r[a[1]]:a[1];let v,cy=0;
  if(m=='ADD'){v=x+y;cy=+(v>255)}else if(m=='SUB'||m=='CMP'){v=x-y;cy=+(v<0)}else v=m=='AND'?x&y:m=='OR'?x|y:x^y;
  v&=255;fl(v,cy);if(m!='CMP')r[a[0]]=v;break}
 case'INC':r[a[0]]=(r[a[0]]+1)&255;fl(r[a[0]]);break;
 case'DEC':r[a[0]]=(r[a[0]]+255)&255;fl(r[a[0]]);break;
 case'NOT':r[a[0]]=~r[a[0]]&255;fl(r[a[0]],0);break;
 case'JMP':c.pc=a[0];break;
 case'JZ':if(F.z)c.pc=a[0];break;case'JNZ':if(!F.z)c.pc=a[0];break;
 case'JC':if(F.c)c.pc=a[0];break;case'JNC':if(!F.c)c.pc=a[0];break;case'JN':if(F.n)c.pc=a[0];break;
 case'IN':r[a[0]]=c.inp&255;break;
 case'OUT':c.out.push(r[a[0]]);if(c.out.length>500)c.out.shift();break}
 c.cyc++;return true}
function run(c,max){let n=0;while(!c.halted&&n<max){step(c);n++}return n}
const SAMPLES=[
{nm:'加算ループ（1〜10の合計）',inp:0,code:'; 1から10までの合計を求める (結果 55)\nLDI A,0\nLDI B,10\nloop:\nADD A,B\nDEC B\nJNZ loop\nOUT A\nHLT'},
{nm:'配列の合計（メモリ操作）',inp:0,code:'; data の5要素を合計する (結果 35)\nLDI A,0\nLDI B,0\nloop:\nLDI C,data\nADD C,B\nLD D,[C]\nADD A,D\nINC B\nCMP B,5\nJNZ loop\nOUT A\nST [200],A   ; 結果をアドレス200へ保存\nHLT\ndata:\n.db 3,5,7,9,11'},
{nm:'フィボナッチ数列',inp:0,code:'; 最初の10項を出力\nLDI A,0\nLDI B,1\nLDI C,10\nloop:\nOUT A\nMOV D,A\nADD D,B\nMOV A,B\nMOV B,D\nDEC C\nJNZ loop\nHLT'},
{nm:'条件分岐（IN値が10以上なら1）',inp:12,code:'; IN欄の値を10と比較。10未満なら0、以上なら1を出力\nIN A\nCMP A,10\nJC small\nLDI B,1\nOUT B\nHLT\nsmall:\nLDI B,0\nOUT B\nHLT'}];
function selfTest(){const T=[],ck=(n,ok,d)=>T.push([n,!!ok,d||'']);
 const go=(code,inp)=>{const r=assemble(code);if(r.errs.length)return{err:r.errs};const c=newCpu();load(c,r);c.inp=inp||0;run(c,10000);return c};
 let c=go(SAMPLES[0].code);ck('1〜10の合計=55',c.out+''=='55'&&c.halted&&!c.err,c.out+'');
 c=go(SAMPLES[1].code);ck('配列合計=35 とメモリ[200]',c.out+''=='35'&&c.mem[200]==35,c.out+'');
 c=go(SAMPLES[2].code);ck('フィボナッチ10項',c.out+''=='0,1,1,2,3,5,8,13,21,34',c.out+'');
 c=go(SAMPLES[3].code,5);ck('分岐 IN=5 → 0',c.out+''=='0');c=go(SAMPLES[3].code,12);ck('分岐 IN=12 → 1',c.out+''=='1');
 c=go('LDI A,250\nADD A,10\nLDI B,100\nST [B],A\nHLT');ck('加算の桁上がりと間接書込',c.r[0]==4&&c.f.c==1&&c.mem[100]==4);
 c=go('FOO A');ck('未知の命令を行番号付きで検出',c.err&&c.err.length==1&&c.err[0].ln==1);
 c=go('LDI E,1');ck('不正なレジスタ名を検出',!!c.err);
 c=go('JMP nowhere');ck('未定義ラベルを検出',!!c.err);
 c=newCpu();c.mem[0]=0xFF;step(c);ck('不正な命令コードで停止',c.halted&&!!c.err);
 c=go('JMP end\nLDI A,1\nend:\nHLT');ck('前方ラベル参照',c.halted&&c.r[0]==0);
 c=go('loop:\nJMP loop');ck('無限ループは上限で打ち切り',!c.halted&&c.cyc==10000);
 return T}
return{REG,hx,ISA,SAMPLES,assemble,newCpu,load,reset,step,run,wr,num,selfTest}})();
//#CORE-END

// ---- CPU Lab UI ----
(()=>{
const K=CPUCORE;let C=K.newCpu(),tmr=null,hexm=true,runN=0;const MAXRUN=100000,hd=document.querySelector('header');
// タブ切替（回路用ボタンはCircuit Studioの時だけ表示）
[...hd.children].forEach(el=>{if(!el.matches('.logo,.tabs,#pname'))el.classList.add('ct')});
const st=document.createElement('style');st.textContent='header[data-tab=cpu] .ct,header[data-tab=cpu] #pname,header[data-tab=sa] .ct,header[data-tab=sa] #pname,header[data-tab=machine] .ct,header[data-tab=machine] #pname{display:none}';document.head.append(st);
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{const t=b.dataset.tab;hd.dataset.tab=t;
 document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x==b));$('main').hidden=t!='circuit';$('#cpu').hidden=t!='cpu';$('#sa').hidden=t!='sa';$('#ml').hidden=t!='machine';window.MLAB&&MLAB.tab(t=='machine');if(t=='circuit')fit();else if(t=='cpu')render();else if(t=='sa')ANL.show()});
function stepC(){const p=window.ANL&&ANL.cpuPre(C),r=K.step(C);window.ANL&&ANL.cpuPost(C,p);return r}
const asm=$('#asm');
$('#asmsel').innerHTML=K.SAMPLES.map((s,i)=>`<option value="${i}">${esc(s.nm)}</option>`).join('');
asm.value=localStorage.getItem('lp.asm')||K.SAMPLES[0].code;
asm.oninput=()=>{try{localStorage.setItem('lp.asm',asm.value)}catch(e){}};
$('#asmsel').onchange=e=>{const s=K.SAMPLES[e.target.value];asm.value=s.code;$('#cin').value=s.inp;asm.oninput();log(`サンプル「${s.nm}」を読み込みました。「アセンブル＆ロード」で実行準備できます`,'i')};
$('#isa').innerHTML='<table><tr><th>命令</th><th>コード</th><th>説明</th></tr>'+K.ISA.map(([m,s,op,d])=>`<tr><td><code>${m} ${s.replace(/r/g,'R').replace(/i/g,'imm').replace(/m/g,'[addr]').replace(/p/g,'[R]')}</code></td><td>0x${K.hx(op)}</td><td>${d}</td></tr>`).join('')+'</table><p class="mu">レジスタ A,B,C,D／数値は 10進・0x16進・0b2進／ラベルは「name:」／データは「.db 1,2,3」／コメントは「;」</p>';
const inp=()=>{C.inp=Math.max(0,Math.min(255,+$('#cin').value|0))};
function doLoad(){stopRun(1);const r=K.assemble(asm.value),ul=$('#asmerr');ul.innerHTML='';
 if(r.errs.length){r.errs.forEach(x=>{const li=document.createElement('li');li.textContent=`行${x.ln}: ${x.msg}`;li.onclick=()=>{const ls=asm.value.split('\n');let s=0;for(let i=0;i<x.ln-1;i++)s+=ls[i].length+1;asm.focus();asm.setSelectionRange(s,s+(ls[x.ln-1]||'').length)};ul.append(li)});
  log(`アセンブル失敗: ${r.errs.length}件のエラー（メモリは変更されていません）`,'e');toast('アセンブルエラーがあります','e');return false}
 K.load(C,r);inp();render();window.ANL&&ANL.cpuSync('load');log(`ロード完了: ${r.size}バイト（メモリを初期化して書き込みました）`,'i');return true}
function post(){if(C.msg)log(C.msg,'w');if(C.halted){stopRun(1);log(C.err?'CPUエラー: '+C.err:`HLTで停止（${C.cyc}命令）`,C.err?'e':'i')}}
function stopRun(q){if(tmr){clearInterval(tmr);tmr=null}if(!q)render()}
$('#asmload').onclick=doLoad;
$('#cstep').onclick=()=>{if(!C.loaded&&!doLoad())return;stopRun(1);inp();stepC();post();render()};
$('#crun').onclick=()=>{if(tmr)return;if(!C.loaded&&!doLoad())return;if(C.halted)return toast('停止中です。CPUリセットしてください','e');
 const n=Math.max(1,(+$('#cspd').value/20)|0);runN=0;window.ANL&&ANL.sys('cpu','sim','CPU実行開始');
 tmr=setInterval(()=>{inp();for(let i=0;i<n&&!C.halted;i++){stepC();if(C.msg)log(C.msg,'w')}runN+=n;post();
  if(tmr&&runN>=MAXRUN){stopRun(1);log(`実行上限(${MAXRUN}命令)に達したため停止しました（無限ループの可能性）`,'w')}render()},50);render()};
$('#cstop').onclick=()=>{stopRun();window.ANL&&ANL.sys('cpu','sim','CPU停止');log('CPUを停止しました','i')};
$('#creset').onclick=()=>{stopRun(1);K.reset(C);render();window.ANL&&ANL.cpuSync('reset');log('CPUをリセットしました（メモリは保持）','i')};
$('#mclr').onclick=()=>{stopRun(1);C.mem.fill(0);C.kind=Array(256).fill('');C.hist=[];C.loaded=false;K.reset(C);render();window.ANL&&ANL.cpuSync('clear');log('メモリを全消去しました','i')};
$('#mfmt').onclick=()=>{hexm=!hexm;$('#mfmt').textContent=hexm?'2進表示に切替':'16進表示に切替';render()};
$('#mem').onclick=e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=+b.dataset.a,s=prompt(`アドレス 0x${K.hx(a)} の新しい値（0〜255。10進 / 0x16進 / 0b2進）`,'0x'+K.hx(C.mem[a]));if(s==null)return;
 const v=K.num(s);if(!Number.isInteger(v)||v<0||v>255)return toast('0〜255の整数を入力してください','e');K.wr(C,a,v);render();window.ANL&&ANL.cpuSync('edit')};
$('#ctest').onclick=()=>{const T=K.selfTest();T.forEach(([n,ok,d])=>log(`${ok?'合格':'不合格'}: ${n}${ok?'':' '+d}`,ok?'i':'e'));const ng=T.filter(t=>!t[1]).length;toast(ng?`セルフテスト: ${ng}件不合格`:`セルフテスト: ${T.length}件すべて合格`,ng?'e':'')};
function render(){const h=K.hx;
 $('#regs').innerHTML=K.REG.map((n,i)=>`<div class="rg"><b>${n}</b><span>${h(C.r[i])}</span><small>${C.r[i]}</small></div>`).join('')+`<div class="rg"><b>PC</b><span>${h(C.pc)}</span><small>${C.pc}</small></div><div class="rg"><b>FLAG</b><span>Z${C.f.z} C${C.f.c} N${C.f.n}</span></div><div class="rg"><b>命令数</b><span>${C.cyc}</span></div>`;
 $('#cout').textContent='OUT: '+(C.out.join(', ')||'（なし）');
 const s=$('#cstat');s.className=C.err?'e':'';s.textContent=C.err?'エラー停止: '+C.err:C.halted?'HLTで停止':tmr?'実行中':C.loaded?'待機中':'未ロード（アセンブル＆ロードしてください）';
 let o='';for(let a=0;a<256;a++){const k=C.kind[a],v=C.mem[a];o+=`<button data-a="${a}" class="${k=='c'?'mc':k=='d'?'md':''}${a==C.pc?' mp':''}${a==C.rd?' mr':''}${a==C.wr?' mw':''}" title="0x${h(a)} = ${v}">${hexm?h(v):v.toString(2).padStart(8,'0')}</button>`}
 const m=$('#mem');m.style.setProperty('--c',hexm?16:8);m.innerHTML=o;
 $('#mhist').textContent=C.hist.length?C.hist.slice(-12).reverse().map(x=>`#${x.cyc} 0x${h(x.a)}: ${h(x.o)}→${h(x.n)}`).join('\n'):'（まだ書き込みはありません）';$('#mhist').style.whiteSpace='pre'}
window.LPCPU={cpu:()=>C,running:()=>!!tmr};render()})();

// ================= LOGIC PLAYGROUND 2.1: SIGNAL ANALYZER =================
// 責務: Recorder(記録) / Registry(解析対象) / CPUTrace(CPU連携) / EventLog / Renderer(描画) / Cursor / CSV。
// 回路は step(dt) の計算結果を after(dt) で読むだけ（更新処理は複製しない）。描画は記録を読むだけで計算を進めない。
window.ANL=(()=>{
const K=CPUCORE,REG=K.REG,hx=K.hx,MAXLOG=20000,COL=['#22d3ee','#a78bfa','#3b82f6','#34d399','#fbbf24','#f472b6','#fb923c','#a3e635','#60a5fa','#e879f9'];
let MAX=300000,testing=0,cpuOv=null;
const KL={init:'初期値',rise:'立ち上がり',fall:'立ち下がり',chg:'値変化',clk:'クロック立ち上がり',upd:'クロックで状態更新',rst:'リセット',edit:'手動編集'};
const CAT={rise:'sig',fall:'sig',chg:'sig',init:'sig',rst:'sig',edit:'sig',clk:'clk',upd:'clk',exec:'cpu',branch:'cpu',reg:'reg',mrd:'mem',mwr:'mem',io:'io',sim:'sim',rec:'sim',warn:'warn',err:'err'};
const pd=id=>id[0]=='c'?'circ':'cpu',curCpu=()=>cpuOv||(window.LPCPU&&LPCPU.cpu());
const parse=id=>{const a=id.split(':');return a[0]=='c'?{n:+a[1],io:a[2][0],i:+a[2].slice(1)}:{k:a[1],m:a[2]}};
const newRC=()=>({on:false,t:{circ:0,cpu:0},n:{circ:0,cpu:0},ev:new Map,last:new Map,mm:new Map,nb:new Set,segs:{circ:[],cpu:[]},cnt:0,pin:new Map,log:[],lid:0});
let RC=newRC(),reg=[];
const ui={sel:null,only:false,fmt:'hex',th:44,follow:true,clr:false,dom:'circ',act:'A',dt:.05,cw:800,v:{circ:{t0:0,pps:100},cpu:{t0:0,pps:14}},cur:{circ:{A:null,B:null},cpu:{A:null,B:null}},pins:[]};
const ub=(a,t)=>{let l=0,h=a.length;while(l<h){const m=(l+h)>>1;a[m].t<=t?l=m+1:h=m}return l};
const lb=(a,t)=>{let l=0,h=a.length;while(l<h){const m=(l+h)>>1;a[m].t<t?l=m+1:h=m}return l};

// ---- 信号の定義と読み出し（Registry） ----
function isNum(nid,io,i){const n=N(nid);if(!n)return false;if(io=='o')return n.t=='num'||n.t=='cnt';const w=S.wires.find(w=>w.to==nid&&w.ti==i);return!!w&&isNum(w.from,'o',w.fo)}
const isBit=id=>{if(id[0]=='c'){const p=parse(id);return!RC.nb.has(id)&&!isNum(p.n,p.io,p.i)}return['fz','fc','fn'].includes(parse(id).k)};
function readSig(id,cp){if(id[0]=='c'){const p=parse(id),n=N(p.n);if(!n)return;const v=p.io=='o'?n.o[p.i]:(n.inp[p.i]||0);return v==null||!isFinite(v)?undefined:+v}
 cp=cp||curCpu();if(!cp)return;const q=parse(id);
 return q.k=='pc'?cp.pc:q.k[0]=='r'?cp.r[+q.k[1]]:q.k=='fz'?cp.f.z:q.k=='fc'?cp.f.c:q.k=='fn'?cp.f.n:q.k=='m'?cp.mem[+q.m]:undefined}
const validW=w=>w.dom=='cpu'||(()=>{const n=N(parse(w.id).n);return!!n&&n.t==w.ty})();
const nodeName=n=>(n.lb||D[n.t].n)+'#'+n.id;
function defName(id){if(id[0]=='c'){const p=parse(id),n=N(p.n);if(!n)return id;const d=D[n.t];return nodeName(n)+'.'+(p.io=='o'?d.o[p.i]:d.i[p.i]+'(入)')}
 const q=parse(id);return q.k=='pc'?'PC':q.k[0]=='r'?'Reg '+REG[+q.k[1]]:q.k=='fz'?'Flag Z':q.k=='fc'?'Flag C':q.k=='fn'?'Flag N':'MEM[0x'+hx(+q.m)+']'}
const ID_OK=/^(c:\d+:[io]\d+|p:(pc|r[0-3]|fz|fc|fn)|p:m:(\d{1,3}))$/;
function mkW(id){const n=id[0]=='c'?N(parse(id).n):null;return{id,dom:pd(id),name:defName(id),col:COL[reg.length%COL.length],vis:true,ty:n?n.t:''}}
function addSig(id){if(!ID_OK.test(id)||reg.some(w=>w.id==id))return false;if(id[0]=='c'&&!N(parse(id).n))return false;if(id.startsWith('p:m:')&&+id.slice(4)>255)return false;
 const w=mkW(id);reg.push(w);if(RC.on&&validW(w)){const v=readSig(id);if(v!==undefined)put(RC,id,'init',v)}ui.sel=ui.sel||id;cfgSave();return true}
const vis=()=>reg.filter(w=>w.dom==ui.dom&&w.vis&&(!ui.only||w.id==ui.sel));
function cfgSave(){try{localStorage.setItem('lp.sa',JSON.stringify({reg:reg.map(({id,name,col,vis,ty})=>({id,name,col,vis,ty})),fmt:ui.fmt,th:ui.th,dom:ui.dom}))}catch(e){}}
function cfgLoad(){try{const c=JSON.parse(localStorage.getItem('lp.sa')||'null');if(!c||!Array.isArray(c.reg))return;
 c.reg.slice(0,64).forEach(w=>{if(w&&typeof w.id=='string'&&ID_OK.test(w.id)&&!reg.some(x=>x.id==w.id))reg.push({id:w.id,dom:pd(w.id),name:String(w.name||defName(w.id)).slice(0,40),col:/^#[0-9a-f]{6}$/i.test(w.col)?w.col:COL[reg.length%COL.length],vis:w.vis!==false,ty:String(w.ty||'')})});
 if(['hex','bin','dec','num'].includes(c.fmt))ui.fmt=c.fmt;if(c.th>=24&&c.th<=140)ui.th=+c.th;if(c.dom=='cpu')ui.dom='cpu'}catch(e){}}

// ---- EventLog ----
function lg(r,dom,k,text,x){r.log.push({i:r.lid++,dom,t:r.t[dom],n:r.n[dom],k,text,...x});if(r.log.length>MAXLOG)r.log.splice(0,MAXLOG/10)}
const logById=i=>{const L=RC.log;let l=0,h=L.length;while(l<h){const m=(l+h)>>1;L[m].i<i?l=m+1:h=m}return L[l]&&L[l].i==i?L[l]:null};

// ---- SignalRecorder ----
function put(r,id,k,v){const dom=pd(id);
 if(r.cnt>=MAX){if(r.on){stopRec(r);lg(r,dom,'warn',`記録上限(${MAX}件)に達したため記録を停止しました。クリアするか不要な信号を外してください`);if(!testing)toast('記録上限に達したため記録を停止しました。クリアしてください','e')}return false}
 let a=r.ev.get(id);if(!a)r.ev.set(id,a=[]);a.push({t:r.t[dom],n:r.n[dom],v,p:k=='init'?null:(r.last.has(id)?r.last.get(id):null),k});r.last.set(id,v);r.cnt++;
 if(id[0]=='c'&&v!==0&&v!==1)r.nb.add(id);const m=r.mm.get(id);if(!m)r.mm.set(id,[v,v]);else{if(v<m[0])m[0]=v;if(v>m[1])m[1]=v}return true}
function startRec(r){if(r.on)return false;if(r.cnt>=MAX)return false;r.on=true;for(const d of['circ','cpu'])r.segs[d].push({a:r.t[d],b:null});
 for(const w of reg){if(!validW(w))continue;const v=readSig(w.id);if(v!==undefined)put(r,w.id,'init',v)}
 lg(r,'circ','rec','記録開始');lg(r,'cpu','rec','記録開始');return true}
function stopRec(r){if(!r.on)return;r.on=false;for(const d of['circ','cpu']){const s=r.segs[d],l=s[s.length-1];if(l&&l.b==null)l.b=r.t[d]}lg(r,'circ','rec','記録停止');lg(r,'cpu','rec','記録停止')}
function clearDom(r,dom){const pre=dom=='circ'?'c':'p';
 for(const id of[...r.ev.keys()])if(id[0]==pre){r.cnt-=r.ev.get(id).length;r.ev.delete(id);r.mm.delete(id);r.nb.delete(id)}
 for(const id of[...r.last.keys()])if(id[0]==pre)r.last.delete(id);
 r.segs[dom]=[];r.t[dom]=0;r.n[dom]=0;r.log=r.log.filter(e=>e.dom!=dom);if(dom=='circ')r.pin.clear();ui.cur[dom]={A:null,B:null};ui.v[dom].t0=0;
 if(r.on){r.segs[dom].push({a:0,b:null});for(const w of reg)if(w.dom==dom&&validW(w)){const v=readSig(w.id);if(v!==undefined)put(r,w.id,'init',v)}}}
function valueAt(r,id,t){const dom=pd(id),sg=r.segs[dom].find(s=>t>=s.a&&t<=(s.b==null?Infinity:s.b)),a=r.ev.get(id);if(!sg||!a)return null;const i=ub(a,t)-1;return i<0||a[i].t<sg.a?null:{e:a[i],i}}
// 回路: step(dt)直後に呼ばれる。計算結果(n.o / n.inp)を読むだけ。
function circAfter(r,dt){r.t.circ+=dt;r.n.circ++;
 if(r.on)for(const w of reg){if(w.dom!='circ')continue;const p=parse(w.id),n=N(p.n);if(!n||n.t!=w.ty)continue;
  const v=readSig(w.id);if(v===undefined)continue;const l=r.last.get(w.id);if(l===v)continue;let k='init';
  if(l!==undefined){const bit=(v===0||v===1)&&(l===0||l===1)&&!isNum(n.id,p.io,p.i);k=bit?(v>l?'rise':'fall'):'chg';
   if(p.io=='o'&&k=='rise'&&n.t=='clk')k='clk';
   else if(p.io=='o'&&(n.t=='dff'||n.t=='cnt')){const pi=r.pin.get(n.id)||[],ci=n.t=='dff'?1:0;if(!pi[ci]&&n.inp[ci])k='upd'}}
  if(put(r,w.id,k,v)&&k!='init')lg(r,'circ',k,`${w.name}: ${fv(w.id,l)}→${fv(w.id,v)}`,{sid:w.id})}
 for(const n of S.nodes)r.pin.set(n.id,n.inp.slice())}
// ---- CPUTraceAdapter（時間単位は命令ステップ。回路の仮想時間とは別） ----
const OPS={};K.ISA.forEach(([m,s,op])=>OPS[op]={m,s,n:s?s.split(',').length:0});
const cpuPre=c=>{const e=OPS[c.mem[c.pc]]||null,n=e?e.n:0;return{pc:c.pc,r:c.r.slice(),f:{...c.f},cyc:c.cyc,halted:c.halted,e,bytes:Array.from(c.mem.slice(c.pc,Math.min(256,c.pc+1+n)))}};
function dis(e,b){if(!e)return'??? 0x'+hx(b[0]);const sh=e.s?e.s.split(','):[];return e.m+(sh.length?' '+sh.map((s,i)=>{const v=b[1+i];return s=='r'?REG[v]:s=='p'?'['+REG[v]+']':s=='m'?'[0x'+hx(v)+']':'0x'+hx(v)}).join(','):'')}
const fs=f=>`Z${f.z}C${f.c}N${f.n}`;
function cpuPost(r,c,pre){
 if(c.cyc===pre.cyc){if(r.on&&c.halted&&!pre.halted)lg(r,'cpu','err','CPUエラー停止: '+c.err,{d:c.err});return}
 r.t.cpu++;r.n.cpu++;if(!r.on)return;
 const e=pre.e,ad='0x'+hx(pre.pc);lg(r,'cpu','exec',`${ad}: フェッチ→実行 ${dis(e,pre.bytes)}`,{addr:pre.pc});
 for(let i=0;i<4;i++)if(c.r[i]!==pre.r[i])lg(r,'cpu','reg',`${REG[i]}: ${hx(pre.r[i])}→${hx(c.r[i])}`);
 if(fs(c.f)!=fs(pre.f))lg(r,'cpu','reg',`FLAG ${fs(pre.f)}→${fs(c.f)}`);
 if(e&&e.m[0]=='J'&&e.m!='JMP'||e&&e.m=='JMP'){const tk=c.pc!==pre.pc+1+e.n;lg(r,'cpu','branch',`${e.m} ${tk?'成立→0x'+hx(c.pc):'不成立'}`)}
 if(c.rd>=0)lg(r,'cpu','mrd',`READ 0x${hx(c.rd)}: ${hx(c.mem[c.rd])}`);
 if(c.wr>=0){const h=c.hist[c.hist.length-1],o=h&&h.cyc==pre.cyc&&h.a==c.wr?hx(h.o):'??';lg(r,'cpu','mwr',`WRITE 0x${hx(c.wr)}: ${o}→${hx(c.mem[c.wr])}`)}
 if(e&&e.m=='IN')lg(r,'cpu','io',`IN → ${REG[pre.bytes[1]]}=${hx(c.r[pre.bytes[1]])}`);
 if(e&&e.m=='OUT')lg(r,'cpu','io',`OUT ← ${REG[pre.bytes[1]]}=${hx(c.r[pre.bytes[1]])}`);
 if(c.msg)lg(r,'cpu','warn',c.msg);if(c.halted)lg(r,'cpu','sim',c.err?'CPUエラー停止: '+c.err:`HLTで停止（${c.cyc}命令）`,{d:c.err});
 for(const w of reg){if(w.dom!='cpu')continue;const v=readSig(w.id,c);if(v===undefined)continue;const l=r.last.get(w.id);if(l===v)continue;put(r,w.id,l===undefined?'init':isBit(w.id)?(v>l?'rise':'fall'):'chg',v)}}
function cpuSync(r,c,why){const L={reset:'CPUリセット',load:'プログラムロード',clear:'メモリ全消去',edit:'メモリ手動編集'}[why]||why;
 if(ui.clr&&why!='edit')clearDom(r,'cpu');
 else if(r.on)for(const w of reg)if(w.dom=='cpu'){const v=readSig(w.id,c),l=r.last.get(w.id);if(v!==undefined&&v!==l)put(r,w.id,l===undefined?'init':why=='edit'?'edit':'rst',v)}
 lg(r,'cpu','sim',L)}

// ---- 表示整形 ----
function fv(id,v,mode){if(v==null)return'—';if(isBit(id))return v?'1':'0';mode=mode||ui.fmt;if(!Number.isInteger(v)||v<0)return String(+(+v).toFixed(3));
 const cpu=id[0]=='p';return mode=='hex'?'0x'+(cpu&&v<256?hx(v):v.toString(16).toUpperCase()):mode=='bin'?'0b'+v.toString(2).padStart(cpu?8:1,'0'):String(v)}
const fT=(t,d)=>d=='cpu'?'命令#'+t:(+t).toFixed(3)+' s';
const nice=x=>{const p=10**Math.floor(Math.log10(x)),m=x/p;return(m<=1?1:m<=2?2:m<=5?5:10)*p};
const nmOf=id=>(reg.find(w=>w.id==id)||{name:id}).name;

// ---- CursorController / 視点 ----
const spanOf=()=>(ui.cw-150)/ui.v[ui.dom].pps;
function zoomBy(f,x){const v=ui.v[ui.dom],lim=ui.dom=='cpu'?[.02,2000]:[.05,200000],tA=v.t0+((x==null?ui.cw/2:x)-150)/v.pps;v.pps=Math.min(lim[1],Math.max(lim[0],v.pps*f));v.t0=Math.max(0,tA-((x==null?ui.cw/2:x)-150)/v.pps)}
function fit(){const v=ui.v[ui.dom],tot=RC.t[ui.dom]||(ui.dom=='cpu'?20:5);v.t0=0;v.pps=Math.max(.05,(ui.cw-150-16)/tot)}
function latest(){const v=ui.v[ui.dom];v.t0=Math.max(0,RC.t[ui.dom]-spanOf()*.9)}
function setCur(w,t){const d=ui.dom;if(t==null||!isFinite(t))return;t=Math.max(0,Math.min(t,RC.t[d]));ui.cur[d][w]=t;syncT();rRight();redraw()}
function syncT(){const c=ui.cur[ui.dom];['A','B'].forEach(k=>{const el=$('#t'+k.toLowerCase());if(el&&document.activeElement!==el)el.value=c[k]==null?'':ui.dom=='cpu'?c[k]:+c[k].toFixed(4)})}
function evTimes(){const out=[];vis().forEach(w=>(RC.ev.get(w.id)||[]).forEach(e=>out.push(e.t)));return out}
function jumpEv(dir){const c=ui.cur[ui.dom],t=c[ui.act]??0,ts=evTimes();let r=null;for(const x of ts){if(dir>0&&x>t+1e-12&&(r==null||x<r))r=x;if(dir<0&&x<t-1e-12&&(r==null||x>r))r=x}if(r!=null)setCur(ui.act,r)}

// ---- WaveformRenderer ----
const cv=$('#wc'),rcv=$('#rc'),wvEl=$('#wv'),g=cv.getContext('2d'),rg=rcv.getContext('2d');let dirty=0;
const redraw=()=>{if(!dirty){dirty=1;requestAnimationFrame(paint)}};
function setup(c,ctx,w,h,dpr){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);c.style.width=w+'px';c.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0)}
function paint(){dirty=0;if($('#sa').hidden)return;
 const dom=ui.dom,v=ui.v[dom],sg=vis(),GW=150,RH=26,th=ui.th,cw=Math.max(320,wvEl.clientWidth||320),ch=Math.max(sg.length*th,wvEl.clientHeight||0),dpr=window.devicePixelRatio||1,now=RC.t[dom];ui.cw=cw;
 let span=(cw-GW)/v.pps;if(ui.follow&&RC.on&&now>v.t0+span*.98)v.t0=Math.max(0,now-span*.9);
 setup(cv,g,cw,ch,dpr);setup(rcv,rg,cw,RH,dpr);const X=t=>GW+(t-v.t0)*v.pps,t1=v.t0+span,BG='#0a1128',INK='#dbe5ff',MU='#8093c4';
 g.fillStyle=BG;g.fillRect(0,0,cw,ch);rg.fillStyle='#0f1a3a';rg.fillRect(0,0,cw,RH);
 const step=Math.max(dom=='cpu'?1:1e-6,nice(80/v.pps)),dec=dom=='cpu'?0:Math.max(0,Math.ceil(-Math.log10(step))),tk=[];for(let t=Math.ceil(v.t0/step)*step;t<=t1;t+=step)tk.push(t);
 rg.font='11px sans-serif';rg.fillStyle=MU;rg.textBaseline='middle';rg.fillText(dom=='cpu'?'命令ステップ':'仮想時間(s)',6,RH/2);
 g.strokeStyle='#16224a';g.lineWidth=1;g.beginPath();tk.forEach(t=>{const x=Math.round(X(t))+.5;if(x<GW)return;g.moveTo(x,0);g.lineTo(x,ch);rg.fillStyle=MU;rg.fillText((+t.toFixed(dec)).toFixed(dec),x+3,RH/2);rg.fillRect(x-.5,RH-6,1,6)});g.stroke();
 const cov=RC.segs[dom].map(s=>[s.a,s.b==null?now:s.b]).sort((a,b)=>a[0]-b[0]);let pp=v.t0;g.fillStyle='rgba(128,140,190,.10)';
 const gap=(a,b)=>{const x0=Math.max(GW,X(a)),x1=Math.min(cw,X(b));if(x1>x0)g.fillRect(x0,0,x1-x0,ch)};
 cov.forEach(([a,b])=>{if(a>pp)gap(pp,Math.min(a,t1));pp=Math.max(pp,b)});if(pp<t1)gap(pp,t1);
 g.font='11px sans-serif';g.textBaseline='alphabetic';
 sg.forEach((w,i)=>{const y0=i*th,yH=y0+6,yL=y0+th-6,bit=isBit(w.id),analog=!bit&&ui.fmt=='num',box=!bit&&!analog;
  g.fillStyle=i%2?'#0c1530':BG;g.globalAlpha=.7;g.fillRect(0,y0,GW,th);g.globalAlpha=1;g.fillStyle='#0f1a3a';g.fillRect(0,y0,GW,th);
  g.fillStyle=w.col;g.fillRect(0,y0+3,4,th-6);g.save();g.beginPath();g.rect(8,y0,GW-12,th);g.clip();g.fillStyle=w.id==ui.sel?'#fff':INK;g.font='600 12px sans-serif';g.fillText(w.name,9,y0+th/2-1);
  g.fillStyle=MU;g.font='10px sans-serif';g.fillText(bit?'1ビット':box?'多ビット/数値':'数値',9,y0+th/2+12);g.restore();
  g.strokeStyle='#24366a';g.beginPath();g.moveTo(0,y0+th+.5);g.lineTo(cw,y0+th+.5);g.stroke();if(w.id==ui.sel){g.strokeStyle='#a78bfa';g.strokeRect(.5,y0+.5,cw-1,th-1)}
  const a=RC.ev.get(w.id);if(!a||!a.length)return;const mm=RC.mm.get(w.id)||[0,1],yv=x=>bit?(x?yH:yL):yL-(mm[1]>mm[0]?(x-mm[0])/(mm[1]-mm[0]):.5)*(yL-yH);
  g.save();g.beginPath();g.rect(GW,y0,cw-GW,th);g.clip();g.font='11px ui-monospace,monospace';
  for(const s of RC.segs[dom]){const e=s.b==null?now:s.b;if(e<v.t0||s.a>t1)continue;const lo=lb(a,s.a),hi=ub(a,e);if(lo>=hi)continue;const i0=Math.max(lo,ub(a,v.t0)-1);
   if(box){let lx=-9;for(let j=i0;j<hi;j++){const x1=Math.max(GW,X(a[j].t)),x2=Math.min(cw,j+1<hi?X(a[j+1].t):X(e));if(x1>cw)break;
     if(x2-x1<1.5){if(x1-lx>=1.5){g.fillStyle=w.col;g.fillRect(x1,yH,1,yL-yH);lx=x1}continue}lx=x1;g.strokeStyle=w.col;g.lineWidth=1.2;g.strokeRect(x1+.5,yH+.5,x2-x1-1,yL-yH-1);
     const tx=fv(w.id,a[j].v);if(x2-x1>g.measureText(tx).width+8){g.fillStyle=INK;g.fillText(tx,x1+4,y0+th/2+4)}}}
   else{g.strokeStyle=w.col;g.lineWidth=1.8;g.beginPath();let px=Math.max(GW,X(a[i0].t)),py=yv(a[i0].v),mn=py,mx=py,dn=0;g.moveTo(px,py);
    for(let j=i0+1;j<hi;j++){const x=X(a[j].t);if(x>cw+2)break;const y2=yv(a[j].v);
     if(x-px<.5){dn=1;mn=Math.min(mn,y2);mx=Math.max(mx,y2);py=y2;continue}
     if(dn){g.lineTo(px,mn);g.lineTo(px,mx);g.lineTo(px,py);dn=0}g.lineTo(x,py);px=x;if(y2!=py)g.lineTo(x,y2);py=y2;mn=mx=py}
    if(dn){g.lineTo(px,mn);g.lineTo(px,mx);g.lineTo(px,py)}g.lineTo(Math.min(cw+2,X(e)),py);g.stroke()}}
  g.restore()});
 const c=ui.cur[dom];[['A','#22d3ee'],['B','#a78bfa']].forEach(([k,col])=>{const t=c[k];if(t==null)return;const x=Math.round(X(t))+.5;if(x<GW||x>cw)return;
  g.strokeStyle=col;g.lineWidth=1.5;g.beginPath();g.moveTo(x,0);g.lineTo(x,ch);g.stroke();rg.fillStyle=col;rg.fillRect(x-8,0,16,13);rg.fillStyle='#04101f';rg.font='bold 11px sans-serif';rg.fillText(k,x-3,7)});
 if(!sg.length){g.fillStyle=MU;g.font='13px sans-serif';g.fillText(reg.some(w=>w.dom==dom)?'この時間軸の表示対象がありません（表示チェックを確認）':'解析対象がありません。左の一覧から信号を追加してください。',GW+20,40)}
 const mx=RC.t[dom];$('#wsl').value=mx>0?Math.round(Math.min(1,v.t0/Math.max(1e-9,mx-span*.1||1))*1000):0;
 $('#wrng').textContent=`表示範囲: ${fT(v.t0,dom)} – ${fT(+(v.t0+span).toFixed(3),dom)}（幅 ${dom=='cpu'?Math.round(span):span.toFixed(3)}${dom=='cpu'?' 命令':' s'}）`}

// ---- 右パネル（値・A/B・診断） ----
const KLs=k=>KL[k]||k;
function rRight(){const dom=ui.dom,c=ui.cur[dom],A=c.A,B=c.B,sg=vis(),dt=d=>dom=='cpu'?d+' 命令':d.toFixed(4)+' s';
 $('#sdelta').innerHTML=A!=null&&B!=null?`<b>B−A</b> = ${dt(B-A)}${dom=='circ'?'（仮想時間。ステップ数ではありません）':'（命令ステップ差）'}`:'A/Bカーソルを置くと時間差を表示します（クリック=Aを移動 / Shift+クリック=B）';
 let h='<table class="vt"><tr><th>信号</th><th>A値</th>'+(B!=null?'<th>B値</th>':'')+'<th>直前</th><th>変化</th><th>種別</th><th>時刻/step</th></tr>';
 if(A==null)h='<p class="mu">波形をクリックしてカーソルAを置くと、各信号の値を表示します。</p>';
 else{sg.forEach(w=>{const a=valueAt(RC,w.id,A),b=B!=null?valueAt(RC,w.id,B):null;
   h+=`<tr data-s="${esc(w.id)}"><td><i class="dot" style="background:${w.col}"></i>${esc(w.name)}</td>`+(a?`<td><b>${fv(w.id,a.e.v)}</b></td>`+(B!=null?`<td>${b?fv(w.id,b.e.v):'—'}</td>`:'')+`<td>${a.e.p==null?'—':fv(w.id,a.e.p)}</td><td>${a.e.p==null?'初期値':fv(w.id,a.e.p)+'→'+fv(w.id,a.e.v)}</td><td>${KLs(a.e.k)}</td><td>${fT(a.e.t,dom)} / #${a.e.n}</td>`:`<td>未記録</td>`+(B!=null?`<td>${b?fv(w.id,b.e.v):'—'}</td>`:'')+'<td colspan="4">—</td>')+'</tr>'});h+='</table>'}
 $('#svals').innerHTML=h;
 $('#spins').innerHTML=ui.pins.map(p=>`<div class="pin"><b>固定 ${esc(p.t)}</b><br>${p.r.map(esc).join('<br>')}</div>`).join('');
 let b='<p class="mu">AとBの両方を置くと、間で起きた変化を一覧表示します。</p>';
 if(A!=null&&B!=null){const lo=Math.min(A,B),hi=Math.max(A,B),rows=[];sg.forEach(w=>{const a=RC.ev.get(w.id)||[];for(let i=ub(a,lo);i<a.length&&a[i].t<=hi;i++){rows.push([a[i].t,a[i].n,w,a[i]])}if(rows.length>5000)return});
  rows.sort((x,y)=>x[0]-y[0]);b=`<p class="mu">${rows.length}件${rows.length>300?'（先頭300件を表示）':''}</p><table class="vt"><tr><th>時刻</th><th>step</th><th>信号</th><th>変化</th><th>種別</th></tr>`+rows.slice(0,300).map(([t,n,w,e])=>`<tr><td>${fT(t,dom)}</td><td>#${n}</td><td>${esc(w.name)}</td><td>${e.p==null?'':fv(w.id,e.p)+'→'}${fv(w.id,e.v)}</td><td>${KLs(e.k)}</td></tr>`).join('')+'</table>'}
 $('#sbtw').innerHTML=b;
 $('#sdiag').innerHTML=diag().map(([l,t])=>`<div class="dg ${l}">${l=='warn'?'⚠ ':l=='err'?'✖ ':'ℹ '}${esc(t)}</div>`).join('');
 const s=reg.find(w=>w.id==ui.sel);$('#ssig').innerHTML=s?`<b>${esc(s.name)}</b><br>出所: ${s.dom=='circ'?'回路シミュレーション（部品出力/入力・1ビットまたは数値）':'CPUモデルの状態（命令ステップ単位）'}<br>ID: ${esc(s.id)}<br>記録イベント数: ${(RC.ev.get(s.id)||[]).length}<br>最新値: ${fv(s.id,RC.last.get(s.id))}`:'<span class="mu">トラック名またはログをクリックして選択</span>'}
function diag(){const dom=ui.dom,ws=reg.filter(w=>w.dom==dom),o=[];if(!ws.length)return[['info','解析対象がありません']];if(!RC.segs[dom].length)return[['info','まだ記録していません（● 記録開始）']];
 o.push(['info','診断は変化の有無に基づく参考情報です。変化がなくても正当な回路・プログラムはあります']);
 for(const w of ws){const a=RC.ev.get(w.id)||[],ch=a.filter(e=>e.k!='init').length;if(!validW(w)){o.push(['warn',`「${w.name}」: 対応する部品が現在の回路にありません（要確認）`]);continue}
  if(dom=='circ'){const p=parse(w.id),n=N(p.n);if(ch==0&&RC.t.circ>0)o.push(['info',`「${w.name}」: 記録期間中に一度も変化していません（要確認）`]);
   if(p.io=='o'&&ch==0&&reg.some(x=>x.id.startsWith('c:'+n.id+':i')&&(RC.ev.get(x.id)||[]).some(e=>e.k!='init')))o.push(['warn',`「${w.name}」: 入力は変化したが出力は変化していません（要確認）`]);
   const u=a.filter(e=>e.k=='upd').length;if(u)o.push(['info',`「${w.name}」: クロック立ち上がりに同期した状態更新を${u}回記録`])}}
 RC.log.filter(e=>(e.dom==dom||e.dom=='sys')&&(e.k=='err'||e.k=='warn')).slice(-6).forEach(e=>o.push([e.k=='err'?'err':'warn',e.text]));return o}

// ---- 左パネル ----
function rl(){$('#swl').innerHTML=reg.length?reg.map((w,i)=>`<div class="wi${w.id==ui.sel?' sel':''}${validW(w)?'':' bad'}" data-i="${i}"><input type="checkbox" data-f="vis" ${w.vis?'checked':''} title="表示"><input type="color" data-f="col" value="${w.col}" title="表示色"><input data-f="name" value="${esc(w.name)}" maxlength="40" title="表示名（編集可）"><button data-a="up" title="上へ">↑</button><button data-a="dn" title="下へ">↓</button><button data-a="rm" title="解析対象から外す">✕</button><small>${w.dom=='circ'?'回路':'CPU'} ${esc(w.id)}${validW(w)?'':' ⚠部品なし'}</small></div>`).join(''):'<p class="mu">解析対象がありません。下の一覧から信号を追加してください（回路で部品を選択して「選択部品を追加」も可）。</p>';
 const q=String($('#sq').value||'').trim().toLowerCase(),L=[];
 S.nodes.forEach(n=>{const d=D[n.t];d.o.forEach((l,i)=>L.push(['c:'+n.id+':o'+i,nodeName(n)+'.'+l+'［出力］',d.n]));d.i.forEach((l,i)=>L.push(['c:'+n.id+':i'+i,nodeName(n)+'.'+l+'［入力］',d.n]))});
 [['p:pc','PC'],...REG.map((r,i)=>['p:r'+i,'Reg '+r]),['p:fz','Flag Z'],['p:fc','Flag C'],['p:fn','Flag N']].forEach(([id,n])=>L.push([id,'[CPU] '+n,'CPU']));
 const f=L.filter(([id,n,t])=>!q||(n+' '+t+' '+id).toLowerCase().includes(q));
 $('#savail').innerHTML=f.slice(0,150).map(([id,n])=>`<div class="av"><span>${esc(n)}</span><button data-add="${id}" ${reg.some(w=>w.id==id)?'disabled':''} title="解析対象に追加">${reg.some(w=>w.id==id)?'✓':'＋'}</button></div>`).join('')+(f.length>150?`<p class="mu">他${f.length-150}件。検索で絞り込んでください。</p>`:'')||'<p class="mu">該当する信号がありません</p>'}
function rLog(){const q=String($('#lq').value||'').toLowerCase(),k=$('#lk').value,d=$('#ld').value,L=RC.log,out=[];let n=0;
 for(let i=L.length-1;i>=0;i--){const e=L[i];if(d&&e.dom!=d)continue;if(k&&CAT[e.k]!=k)continue;if(q&&!e.text.toLowerCase().includes(q))continue;n++;if(out.length<200)out.push(`<div class="le ${e.k}" data-i="${e.i}"><span class="lt">${e.dom=='cpu'?'CPU':'回路'} ${fT(e.t,e.dom)} #${e.n}</span> <span class="lk">${esc(KLs(e.k))}</span> ${esc(e.text)}${e.d?' <u>詳細</u>':''}</div>`)}
 $('#llist').innerHTML=out.join('')||'<p class="mu">ログはありません</p>';$('#lcnt').textContent=`${n}件${n>200?'（新しい200件を表示。検索/フィルターで絞り込み）':''}`}
function gotoLog(e){if(e.dom=='circ'||e.dom=='cpu'){if(ui.dom!=e.dom){ui.dom=e.dom;$('#sdom').value=e.dom}ui.cur[e.dom].A=e.t;const v=ui.v[e.dom];v.t0=Math.max(0,e.t-spanOf()/2);syncT();rl();rRight();redraw()}
 if(e.d)$('#ssig').innerHTML=`<b>詳細</b><pre class="det">${esc(e.text+'\n'+e.d)}</pre>`}

// ---- 状態バー / 実行制御 ----
const runCirc=()=>!!tm,runCpu=()=>!!(window.LPCPU&&LPCPU.running()),runAny=()=>runCirc()||runCpu();
function stat(){const d=ui.dom,run=d=='circ'?runCirc():runCpu();
 $('#sstat').innerHTML=`<span class="${runCirc()?'on':''}">回路: ${runCirc()?'● 実行中':'停止中'}</span><span class="${runCpu()?'on':''}">CPU: ${runCpu()?'● 実行中':'停止中'}</span><span class="${RC.on?'rec':''}">記録: ${RC.on?'● 記録中':'停止'}</span><span>回路時間 ${RC.t.circ.toFixed(3)} s (step ${RC.n.circ})</span><span>CPU ${RC.t.cpu} 命令</span><span class="${RC.cnt>MAX*.9?'warnc':''}">イベント ${RC.cnt}/${MAX}</span><span>解析対象 ${reg.length}</span>`;
 const rb=$('#srec');rb.textContent=RC.on?'■ 記録停止':'● 記録開始';rb.classList.toggle('recon',RC.on);$('#srun').disabled=run;$('#spause').disabled=!run;$('#sa').classList.toggle('running',run)}
function doStep(){if(tm)stop();if(!S.nodes.length)return toast('部品がありません','e');try{step(ui.dt);draw()}catch(x){sys('circ','err','計算エラー: '+x.message,x.stack);toast('計算エラー: '+x.message,'e')}}
function sys(dom,k,text,d){lg(RC,dom,k,text,{d});if(k=='err')log(text,'e')}
function ctl(a){const c=ui.dom=='circ';
 if(a=='run')c?start():$('#crun').click();
 else if(a=='pause')c?stop():$('#cstop').click();
 else if(a=='step'){if(c)doStep();else{if(LPCPU.running())$('#cstop').click();$('#cstep').click()}}
 else if(a=='reset')c?resetSim():$('#creset').click();stat();redraw()}
function toggleRec(){if(RC.on){stopRec(RC);toast('波形の記録を停止しました（シミュレーションは継続します）')}else{if(!startRec(RC))return toast('記録を開始できません（上限に達している場合はクリアしてください）','e');toast('記録を開始しました')}stat();rl();redraw()}

// ---- CSVExporter ----
const q=v=>{v=v==null?'':String(v);return/[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v},row=a=>a.map(q).join(',');
function csvEvents(r){const it=[];for(const w of reg){const a=r.ev.get(w.id);if(!a)continue;const c=w.dom=='circ';for(const e of a)it.push([c?0:1,e.t,e.n,row([c?'circuit':'cpu',c?e.t.toFixed(6):e.t,c?'s':'instruction',e.n,w.name,c?parse(w.id).n:'',w.id,e.v,e.p,e.k])])}
 it.sort((x,y)=>x[0]-y[0]||x[1]-y[1]||x[2]-y[2]);return[row(['domain','time','time_unit','step','signal_name','component_id','signal_id','value','previous_value','event_type']),...it.map(x=>x[3])].join('\r\n')}
function csvTimeline(r,dom){const ws=reg.filter(w=>w.dom==dom),ts=new Set;ws.forEach(w=>(r.ev.get(w.id)||[]).forEach(e=>ts.add(e.t)));const T=[...ts].sort((a,b)=>a-b).slice(0,200000);
 return[row([dom=='cpu'?'instruction':'time_s',...ws.map(w=>w.name)]),...T.map(t=>row([dom=='cpu'?t:t.toFixed(6),...ws.map(w=>{const x=valueAt(r,w.id,t);return x?x.e.v:''})]))].join('\r\n')}
const csvLog=r=>[row(['domain','time','step','category','type','text']),...r.log.map(e=>row([e.dom,e.t,e.n,CAT[e.k],e.k,e.text]))].join('\r\n');
function exportCsv(){try{const k=$('#scsv').value,s=k=='ev'?csvEvents(RC):k=='tl'?csvTimeline(RC,ui.dom):csvLog(RC),n=s.split('\r\n').length-1;if(n<1)return toast('出力できるデータがありません','e');
 const b=new Blob(['\ufeff'+s],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`signal-${k}-${Date.now()}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);toast(`CSVを生成しました（${n}行）。ダウンロードを確認してください`)}catch(e){toast('CSV出力に失敗しました: '+e.message,'e')}}

// ---- セルフテスト（本物の step() と CPUCORE を使用。ユーザー回路は退避して復元） ----
function selfTest(){if(tm)return toast('実行中はテストできません。一時停止してください','e');
 const res=[],T=(n,ok,d)=>res.push([n,!!ok,d||'']),sr=RC,sreg=reg,sn=S.nodes,sw=S.wires,smax=MAX,swarn=warned,scur=cpuOv;testing=1;
 const build=(ns,ws)=>{S.nodes=ns.map(([id,t,p])=>mk({id,t,x:0,y:0,p:p||{}}));S.wires=ws.map(([f,fo,t,ti],i)=>({id:i+1,from:f,fo,to:t,ti}))};
 const fresh=ids=>{RC=newRC();reg=ids.map(mkW);startRec(RC)};
 try{
  build([[1,'sw',{on:0}],[2,'lamp']],[[1,0,2,0]]);fresh(['c:1:o0']);step(.05);N(1).p.on=1;step(.05);step(.05);
  let a=RC.ev.get('c:1:o0');T('スイッチ切替で実際の信号変化を記録',a.length==2&&a[1].v==1&&a[1].k=='rise'&&Math.abs(a[1].t-.1)<1e-9,JSON.stringify(a));
  T('同値が続く間は追加イベントなし',a.length==2);
  T('カーソル位置の値が記録と一致',valueAt(RC,'c:1:o0',.05).e.v==0&&valueAt(RC,'c:1:o0',.12).e.v==1&&valueAt(RC,'c:1:o0',.12).e.p==0);
  T('A/B時間差が記録時刻から算出される',Math.abs((.15-.05)-0.1)<1e-9&&Math.abs(RC.t.circ-.15)<1e-9);
  const snap=JSON.stringify([...RC.ev]);zoomBy(2,300);zoomBy(.5);ui.v.circ.t0=3;fit();latest();T('ズーム/スクロールで記録データは不変',JSON.stringify([...RC.ev])==snap);ui.v.circ.t0=0;ui.v.circ.pps=100;
  let bad=[];[['and',(a,b)=>a&b],['or',(a,b)=>a|b],['xor',(a,b)=>a^b],['not',a=>a?0:1]].forEach(([t,f])=>{for(const x of[0,1])for(const y of(t=='not'?[0]:[0,1])){
    build([[1,'sw',{on:x}],[2,'sw',{on:y}],[3,t]],t=='not'?[[1,0,3,0]]:[[1,0,3,0],[2,0,3,1]]);fresh(['c:3:o0']);step(.05);const ex=f(x,y),eng=N(3).o[0],rv=valueAt(RC,'c:3:o0',RC.t.circ).e.v;if(eng!==ex||rv!==ex)bad.push(`${t}(${x},${y}) exp=${ex} eng=${eng} rec=${rv}`)}});
  T('AND/OR/NOT/XOR: 記録値=回路計算=真理値表',!bad.length,bad.join(';'));
  build([[1,'clk',{sec:.1}],[2,'lamp']],[[1,0,2,0]]);fresh(['c:1:o0']);doStep();T('1ステップ実行で実シミュレーションが1ステップ進む',RC.n.circ==1&&Math.abs(N(1).s.t-ui.dt)<1e-9,RC.n.circ+'/'+N(1).s.t);
  for(let i=0;i<19;i++)step(.05);const c1=RC.cnt;T('クロックの変化とクロックイベント記録',c1>3&&RC.ev.get('c:1:o0').some(e=>e.k=='clk'),c1+'');
  stopRec(RC);for(let i=0;i<20;i++)step(.05);T('記録停止後は新イベントが追加されない',RC.cnt==c1&&RC.n.circ==40);
  let dup=0;for(const[,arr]of RC.ev)for(let i=1;i<arr.length;i++)if(arr[i].v===arr[i-1].v&&arr[i].k!='init')dup++;T('連続する同値の不要な遷移が記録されない',dup==0);
  MAX=15;fresh(['c:1:o0']);for(let i=0;i<60;i++)step(.05);T('記録上限で自動停止し暴走しない',!RC.on&&RC.cnt<=15,RC.cnt+'');MAX=smax;
  const c=K.newCpu(),as=K.assemble(K.SAMPLES[1].code);K.load(c,as);cpuOv=c;fresh(['p:pc','p:r0','p:fz','p:m:200']);let n=0;while(!c.halted&&n++<5000){const p=cpuPre(c);K.step(c);cpuPost(RC,c,p)}
  T('CPUのPC/レジスタ記録が実行結果と一致',valueAt(RC,'p:pc',RC.t.cpu).e.v==c.pc&&valueAt(RC,'p:r0',RC.t.cpu).e.v==c.r[0]&&c.r[0]==35&&RC.t.cpu==c.cyc,`A=${c.r[0]} cyc=${c.cyc}`);
  T('CPU命令実行ログ数=実行命令数',RC.log.filter(e=>e.k=='exec').length==c.cyc);
  T('メモリ書込/読込ログが実際のイベントと一致',RC.log.filter(e=>e.k=='mwr').length==c.hist.length&&RC.log.some(e=>e.k=='mwr'&&e.text.includes('0xC8: 00→23'))&&RC.log.filter(e=>e.k=='mrd').length==5&&valueAt(RC,'p:m:200',RC.t.cpu).e.v==c.mem[200]);
  reg[0].name='a,"b"\nc';const csv=csvEvents(RC),rows=[];{let r=[],f='',iq=0;for(let i=0;i<csv.length;i++){const ch=csv[i];if(iq){if(ch=='"'){if(csv[i+1]=='"'){f+='"';i++}else iq=0}else f+=ch}else if(ch=='"')iq=1;else if(ch==','){r.push(f);f=''}else if(ch=='\r'){}else if(ch=='\n'){r.push(f);rows.push(r);r=[];f=''}else f+=ch}r.push(f);rows.push(r)}
  T('CSV出力が記録内容と一致（引用符・改行・カンマ対応）',rows.length==RC.cnt+1&&rows.some(r=>r[4]=='a,"b"\nc')&&rows[1].length==10,rows.length+'/'+RC.cnt);
  RC=newRC();reg=[mkW('p:pc')];RC.t.cpu=0;const t0=performance.now();for(let i=1;i<=100000;i++){RC.t.cpu=i;RC.n.cpu=i;put(RC,'p:pc','chg',i&255)}RC.segs.cpu.push({a:0,b:100000});const v=valueAt(RC,'p:pc',77777);
  T('10万イベントでも処理が制御可能',v&&v.e.v==(77777&255)&&performance.now()-t0<3000,Math.round(performance.now()-t0)+'ms');
  T('不正データでも例外を出さない',readSig('c:99999:o0')===undefined&&valueAt(RC,'zz',1)===null&&!addSig('c:99999:o0')&&!addSig('x:y'));
 }catch(e){T('テスト実行中の例外',0,e.message+' '+(e.stack||'').split('\n')[1])}
 finally{RC=sr;reg=sreg;S.nodes=sn;S.wires=sw;MAX=smax;warned=swarn;cpuOv=scur;testing=0;draw();rl();redraw()}
 res.forEach(([n,ok,d])=>log(`${ok?'合格':'不合格'}: ${n}${ok?'':' '+d}`,ok?'i':'e'));const ng=res.filter(x=>!x[1]).length;toast(ng?`Analyzerセルフテスト: ${ng}件不合格`:`Analyzerセルフテスト: ${res.length}件すべて合格`,ng?'e':'');return res}

// ---- UI配線 ----
function wire(){
 const on=(id,f)=>{$(id).onclick=f};
 on('#srec',toggleRec);
 on('#sclr',()=>{if(RC.cnt&&!confirm('記録データ（'+DOMN()+'）をクリアします。よろしいですか？'))return;clearDom(RC,ui.dom);rl();rRight();rLog();redraw();toast('記録をクリアしました')});
 on('#srun',()=>ctl('run'));on('#spause',()=>ctl('pause'));on('#sstep',()=>ctl('step'));on('#srst',()=>ctl('reset'));
 on('#szi',()=>{zoomBy(1.5);redraw()});on('#szo',()=>{zoomBy(1/1.5);redraw()});on('#sfit',()=>{fit();redraw()});on('#slat',()=>{latest();redraw()});
 on('#sexp',exportCsv);on('#stest',selfTest);on('#shelp',()=>{$('#shbox').hidden=!$('#shbox').hidden});on('#shx',()=>{$('#shbox').hidden=true});
 on('#stl',()=>{$('#sa').classList.toggle('nl')});on('#str',()=>{$('#sa').classList.toggle('nr')});on('#stg',()=>{$('#sa').classList.toggle('nlog')});
 $('#sdt').onchange=e=>{const v=+e.target.value;ui.dt=v>0&&v<=.25?v:.05;e.target.value=ui.dt};
 $('#sclrrst').onchange=e=>{ui.clr=e.target.checked};
 $('#sdom').onchange=e=>{ui.dom=e.target.value;cfgSave();syncT();rl();rRight();redraw()};
 $('#sfmt').onchange=e=>{ui.fmt=e.target.value;cfgSave();rRight();redraw()};
 $('#sth').oninput=e=>{ui.th=+e.target.value;cfgSave();redraw()};
 $('#sfol').onchange=e=>{ui.follow=e.target.checked};
 $('#sq').oninput=rl;['#lq','#lk','#ld'].forEach(s=>$(s).oninput=rLog);
 $('#wsl').oninput=e=>{const v=ui.v[ui.dom];v.t0=(+e.target.value/1000)*Math.max(0,RC.t[ui.dom]-spanOf()*.1);ui.follow=false;$('#sfol').checked=false;redraw()};
 $('#cA').onclick=()=>{ui.act='A';ab()};$('#cB').onclick=()=>{ui.act='B';ab()};
 const ab=()=>{$('#cA').classList.toggle('on',ui.act=='A');$('#cB').classList.toggle('on',ui.act=='B')};
 ['a','b'].forEach(k=>{const K2=k.toUpperCase();$('#t'+k).onchange=e=>{const v=parseFloat(e.target.value);if(!isFinite(v))return toast('数値を入力してください','e');setCur(K2,v)};$('#g'+k).onclick=()=>{const v=parseFloat($('#t'+k).value);isFinite(v)?(ui.v[ui.dom].t0=Math.max(0,v-spanOf()/2),setCur(K2,v)):toast('時刻を入力してください','e')}});
 on('#spin',()=>{const A=ui.cur[ui.dom].A;if(A==null)return toast('先にカーソルAを置いてください','e');ui.pins.push({t:fT(A,ui.dom),r:vis().map(w=>{const a=valueAt(RC,w.id,A);return`${w.name} = ${a?fv(w.id,a.e.v):'未記録'}`})});if(ui.pins.length>5)ui.pins.shift();rRight()});
 on('#spclr',()=>{ui.pins=[];rRight()});
 on('#sall',()=>{reg.forEach(w=>w.vis=true);ui.only=false;cfgSave();rl();redraw()});
 on('#sonly',()=>{if(!ui.sel)return toast('先にトラック名または一覧で信号を選択してください','e');ui.only=!ui.only;$('#sonly').classList.toggle('on',ui.only);redraw()});
 on('#ssel',()=>{if(!sel.size)return toast('Circuit Studioで部品を選択してください','e');let n=0;S.nodes.filter(x=>sel.has(x.id)).forEach(x=>{D[x.t].o.forEach((_,i)=>n+=addSig('c:'+x.id+':o'+i));D[x.t].i.forEach((_,i)=>n+=addSig('c:'+x.id+':i'+i))});rl();redraw();toast(n?`${n}個の信号を追加しました`:'追加できる信号がありません')});
 on('#sadd64',()=>{let n=0;S.nodes.forEach(x=>D[x.t].o.forEach((_,i)=>{if(reg.length<64)n+=addSig('c:'+x.id+':o'+i)}));rl();redraw();toast(n?`${n}個の出力を追加しました（上限64）`:'追加できる出力がありません')});
 on('#smadd',()=>{const v=K.num($('#smem').value);if(!Number.isInteger(v)||v<0||v>255)return toast('番地は0〜255で入力してください','e');addSig('p:m:'+v);rl();redraw()});
 $('#savail').onclick=e=>{const b=e.target.closest('[data-add]');if(b&&addSig(b.dataset.add)){rl();redraw()}};
 $('#swl').onclick=e=>{const it=e.target.closest('.wi'),b=e.target.closest('[data-a]');if(!it)return;const i=+it.dataset.i;
  if(b){const a=b.dataset.a;if(a=='rm'){const [w]=reg.splice(i,1);if(ui.sel==w.id)ui.sel=null}else if(a=='up'&&i>0)[reg[i-1],reg[i]]=[reg[i],reg[i-1]];else if(a=='dn'&&i<reg.length-1)[reg[i+1],reg[i]]=[reg[i],reg[i+1]];cfgSave();rl();rRight();redraw()}
  else if(e.target.tagName!='INPUT'){ui.sel=reg[i].id;rl();rRight();redraw()}};
 $('#swl').onchange=e=>{const it=e.target.closest('.wi'),f=e.target.dataset.f;if(!it||!f)return;const w=reg[+it.dataset.i];if(f=='vis')w.vis=e.target.checked;else if(f=='name')w.name=e.target.value.trim().slice(0,40)||defName(w.id);else if(f=='col')w.col=e.target.value;cfgSave();rRight();redraw()};
 $('#swl').oninput=e=>{if(e.target.dataset.f=='col'){reg[+e.target.closest('.wi').dataset.i].col=e.target.value;redraw()}};
 $('#llist').onclick=e=>{const d=e.target.closest('[data-i]');const x=d&&logById(+d.dataset.i);if(x)gotoLog(x)};
 $('#svals').onclick=e=>{const t=e.target.closest('[data-s]');if(t){ui.sel=t.dataset.s;rl();rRight();redraw()}};
 let drag=0;const ptr=(e,rule)=>{const r=cv.getBoundingClientRect(),x=e.clientX-r.left;if(x<150&&rule){const w=vis()[Math.floor((e.clientY-r.top)/ui.th)];if(w){ui.sel=w.id;rl();rRight();redraw()}return 0}
  const v=ui.v[ui.dom];setCur(e.shiftKey?'B':ui.act,v.t0+(x-150)/v.pps);return 1};
 [cv,rcv].forEach(c=>{c.addEventListener('pointerdown',e=>{if(e.button)return;const r=c.getBoundingClientRect();if(e.clientX-r.left<150&&c==rcv)return;drag=ptr(e,c==cv)?(c.setPointerCapture(e.pointerId),1):0});
  c.addEventListener('pointermove',e=>{if(drag){const r=c.getBoundingClientRect(),v=ui.v[ui.dom];setCur(e.shiftKey?'B':ui.act,v.t0+(e.clientX-r.left-150)/v.pps)}});
  c.addEventListener('pointerup',()=>{drag=0});c.addEventListener('pointercancel',()=>{drag=0})});
 wvEl.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();zoomBy(e.deltaY<0?1.2:1/1.2,e.clientX-cv.getBoundingClientRect().left);redraw()}else if(e.shiftKey){e.preventDefault();const v=ui.v[ui.dom];v.t0=Math.max(0,v.t0+(e.deltaY+e.deltaX)/v.pps);ui.follow=false;$('#sfol').checked=false;redraw()}},{passive:false});
 addEventListener('resize',()=>{redraw()});
 addEventListener('keydown',e=>{if($('#sa').hidden||e.ctrlKey||e.metaKey||e.altKey||/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))return;const k=e.key,v=ui.v[ui.dom];let h=1;
  if(k==' '&&e.target.tagName!='BUTTON')(ui.dom=='circ'?runCirc():runCpu())?ctl('pause'):ctl('run');else if(k==' ')h=0;
  else if(k=='r'||k=='R')toggleRec();else if(k=='s'||k=='S')ctl('step');else if(k=='+'||k=='=')zoomBy(1.5);else if(k=='-')zoomBy(1/1.5);else if(k=='0')fit();else if(k=='End')latest();else if(k=='Home')v.t0=0;
  else if(k=='ArrowLeft'||k=='ArrowRight'){const d=k=='ArrowLeft'?-1:1;if(e.shiftKey)jumpEv(d);else{v.t0=Math.max(0,v.t0+d*spanOf()*.2);ui.follow=false;$('#sfol').checked=false}}
  else if(k=='a'||k=='A'){ui.act='A';ab()}else if(k=='b'||k=='B'){ui.act='B';ab()}else if(k=='?')$('#shbox').hidden=!$('#shbox').hidden;else h=0;
  if(h){e.preventDefault();redraw()}})}
const DOMN=()=>ui.dom=='circ'?'回路':'CPU';
function show(){$('#sdom').value=ui.dom;$('#sfmt').value=ui.fmt;$('#sth').value=ui.th;rl();rRight();rLog();stat();syncT();requestAnimationFrame(()=>{fit0();redraw()})}
let fitted=0;function fit0(){if(!fitted&&wvEl.clientWidth){ui.cw=wvEl.clientWidth;fitted=1}}
cfgLoad();wire();setInterval(()=>{if($('#sa').hidden)return;stat();if(RC.on||runAny())rRight();rLog();redraw()},200);
if(window.innerWidth<1000)$('#sa').classList.add('nl','nr');
return{after:dt=>{try{circAfter(RC,dt)}catch(e){lg(RC,'circ','err','記録処理エラー: '+e.message,{d:e.stack})}},
 sys,cpuPre:c=>{try{return cpuPre(c)}catch(e){return null}},cpuPost:(c,p)=>{try{if(p)cpuPost(RC,c,p)}catch(e){lg(RC,'cpu','err','CPU記録エラー: '+e.message,{d:e.stack})}},
 cpuSync:why=>{try{cpuSync(RC,curCpu(),why)}catch(e){}},
 reset:()=>{try{if(ui.clr)clearDom(RC,'circ');else{RC.pin.clear();if(RC.on)for(const w of reg)if(w.dom=='circ'&&validW(w)){const v=readSig(w.id),l=RC.last.get(w.id);if(v!==undefined&&v!==l)put(RC,w.id,l===undefined?'init':'rst',v)}}lg(RC,'circ','sim','シミュレーションをリセット')}catch(e){}},
 circuitChanged:()=>{RC.pin.clear();if(!$('#sa').hidden){rl();rRight();redraw()}},show,selfTest,_:{get rec(){return RC}}}})();

// ================= LOGIC PLAYGROUND 2.2: Machine Lab =================
//#MSIM-START
const MSIM=(()=>{
const R=10,GR=900,DT=.02,CK={r:'#f43f5e',b:'#3b82f6',g:'#22c55e'},CN={r:'赤',b:'青',g:'緑'},TN={belt:'ベルトコンベア',sensor:'色センサー',gate:'仕分けゲート',bin:'仕分け箱'};
const PD={belt:{len:300,spd:90,dir:1,on:1,src:''},sensor:{range:40},gate:{mode:'auto',w:40,open:0,col:'r',src:''},bin:{w:110,acc:'any'}};
const RG={len:[60,1500],spd:[0,400],range:[10,200],w:[20,150]},EN={mode:['auto','manual','circuit'],col:['r','b','g'],acc:['any','r','b','g'],dir:[1,-1]};
function cleanP(t,q){const o={};q=q&&typeof q=='object'?q:{};for(const[k,d]of Object.entries(PD[t])){let v=q[k]===undefined?d:q[k];
 if(k=='src')v=/^\d{1,6}:\d{1,2}$/.test(v)?v:'';else if(EN[k])v=EN[k].includes(v)?v:d;else if(k=='on'||k=='open')v=v?1:0;
 else{v=+v;if(!isFinite(v))v=d;v=Math.min(RG[k][1],Math.max(RG[k][0],v))}o[k]=v}return o}
const blank=()=>({name:'無題の機械',parts:[],balls:[]}),
 ps=(X,p)=>X.ps[p.id]||(X.ps[p.id]={det:0,last:'',cnt:0,hold:0,open:0}),bn=(X,p)=>X.bn[p.id]||(X.bn[p.id]={r:0,b:0,g:0,wr:0}),
 nb=q=>({id:q.id,x:q.x,y:q.y,c:q.c,vx:0,vy:0,py:q.y+R,on:0,seen:'',sn:{},dead:0}),
 newX=M=>({t:0,lost:0,ps:{},bn:{},balls:M.balls.map(nb)}),
 vel=(b,env)=>(b.p.src?!!env.sig(b.p.src):!!b.p.on)?b.p.dir*b.p.spd:0;
// ゲート開口: ベルト上に載ったゲートの範囲で、条件を満たすボールだけ支えを失う
function gOpen(M,X,env,bl,b){for(const g of M.parts){if(g.t!='gate'||Math.abs(g.y-bl.y)>6||b.x<g.x||b.x>g.x+g.p.w)continue;
 const m=g.p.mode,o=m=='auto'?!!b.seen&&b.seen==g.p.col:m=='circuit'?!!env.sig(g.p.src):!!g.p.open;if(o){if(m=='auto')ps(X,g).hold=X.t+.35;return 1}}return 0}
function support(M,X,env,b){for(const bl of M.parts){if(bl.t!='belt'||b.x<bl.x||b.x>bl.x+bl.p.len)continue;const bot=b.y+R;
 if(b.on==bl.id?Math.abs(bot-bl.y)<=1:(b.py<=bl.y+1&&bot>=bl.y))if(!gOpen(M,X,env,bl,b))return bl}return null}
function tick(M,X,env){X.t+=DT;const P=M.parts;P.forEach(p=>{if(p.t=='sensor')ps(X,p).det=0});
 for(const b of X.balls){const bl=support(M,X,env,b);b.py=b.y+R;
  if(bl){b.on=bl.id;b.vy=0;b.y=bl.y-R;b.vx=vel(bl,env);b.x+=b.vx*DT}else{b.on=0;b.vy+=GR*DT;b.y+=b.vy*DT;b.x+=b.vx*DT}
  for(const p of P){if(p.t=='sensor'){const s=ps(X,p);if(b.x>=p.x&&b.x<=p.x+p.p.range&&b.y>=p.y&&b.y<=p.y+70){if(!b.sn[p.id]){b.sn[p.id]=1;s.cnt++}s.det=1;s.last=b.c;b.seen=b.c}else b.sn[p.id]=0}
   else if(p.t=='bin'&&!b.dead&&b.x>p.x&&b.x<p.x+p.p.w&&b.y>p.y+8&&b.y<p.y+70){const k=bn(X,p);k[b.c]++;if(p.p.acc!='any'&&p.p.acc!=b.c)k.wr++;b.dead=1}}
  if(!b.dead&&(b.y>1500||b.x<-1000||b.x>4000)){b.dead=1;X.lost++}}
 X.balls=X.balls.filter(b=>!b.dead);
 P.forEach(p=>{if(p.t=='gate'){const s=ps(X,p),m=p.p.mode;s.open=m=='circuit'?!!env.sig(p.p.src):m=='manual'?!!p.p.open:X.t<s.hold}})}
const mkM=(name,parts,balls)=>({name,parts:parts.map((q,i)=>({id:i+1,t:q[0],x:q[1],y:q[2],p:cleanP(q[0],q[3])})),balls:balls.map((c,i)=>({id:i+1,x:24+i*44,y:190,c}))});
const SMP=[
{nm:'COLOR SORTER — 自動ボール仕分け工場',m:()=>mkM('COLOR SORTER',[['belt',0,200,{len:900}],['sensor',420,130,{range:40}],['gate',560,200,{col:'r'}],['gate',700,200,{col:'b'}],['bin',540,320,{acc:'r'}],['bin',680,320,{acc:'b'}],['bin',880,320,{acc:'g'}]],[...'rbgrgbrbg'])},
{nm:'回路でゲート制御（AND）',h:'Circuit StudioのスイッチA・Bが両方ONのとき、ゲートが開いて左の箱に落ちます。実行中に下のスイッチ一覧で切り替えます。',
 m:()=>mkM('回路でゲート制御',[['belt',0,200,{len:600,spd:50}],['gate',380,200,{mode:'circuit',w:60,src:'3:0'}],['bin',360,320,{}],['bin',580,320,{}]],[...'rbgrbg']),
 circ:()=>({v:1,name:'ANDで機械を制御',nodes:[{id:1,t:'sw',x:60,y:50,p:{on:1},lb:'A'},{id:2,t:'sw',x:60,y:180,p:{on:0},lb:'B'},{id:3,t:'and',x:300,y:110,p:{},lb:''},{id:4,t:'lamp',x:520,y:120,p:{},lb:''}],wires:[{from:1,fo:0,to:3,ti:0},{from:2,fo:0,to:3,ti:1},{from:3,fo:0,to:4,ti:0}]})}];
function test(){const T=[],ok=(n,c)=>T.push([n,!!c]),E=v=>({sig:()=>v}),run=(M,env,n=4000)=>{const X=newX(M);for(let i=0;i<n;i++)tick(M,X,env);return X},sum=k=>k.r+k.b+k.g;
 let M=SMP[0].m(),X=run(M,E(0));ok('色別仕分け: 赤箱=赤3',X.bn[5].r==3&&X.bn[5].b+X.bn[5].g==0);ok('青箱=青3',X.bn[6].b==3&&X.bn[6].r+X.bn[6].g==0);ok('緑箱=緑3',X.bn[7].g==3&&X.bn[7].r+X.bn[7].b==0);
 ok('誤仕分け0・消失0・残りボール0',!X.lost&&!X.balls.length&&!X.bn[5].wr&&!X.bn[6].wr&&!X.bn[7].wr);
 ok('再現性(同条件で同結果)',JSON.stringify(run(SMP[0].m(),E(0)).bn)==JSON.stringify(X.bn));
 M=SMP[0].m();M.parts[2].p.mode='manual';M.parts[2].p.open=1;X=run(M,E(0));ok('手動ゲート開: 全9個が手前の箱へ',sum(X.bn[5])==9);
 M=SMP[0].m();M.parts[2].p.mode='circuit';M.parts[2].p.src='1:0';X=run(M,E(0));ok('回路信号0: ゲート閉',!X.bn[5]||sum(X.bn[5])==0);X=run(M,E(1));ok('回路信号1: ゲート開',sum(X.bn[5])==9);
 M=SMP[0].m();M.parts[0].p.on=0;X=run(M,E(0),500);ok('ベルト停止中はボールが動かない',X.balls[0].x==24&&X.balls.length==9);
 M=SMP[0].m();X=run(M,E(0),100);const s=X.ps[2];ok('センサーが色を検出',s&&s.cnt>=1&&!!s.last);
 return T}
return{R,DT,CK,CN,TN,PD,RG,cleanP,blank,ps,bn,nb,newX,vel,tick,SMP,test}})();
//#MSIM-END

window.MLAB=(()=>{
const Q=MSIM,svgM=$('#mlsvg'),KEY='lp.ml.proj',AUTO='lp.ml.auto',hd=document.querySelector('header'),mg=$('#mlg');
let M=Q.blank(),X=Q.newX(M),sel=null,vx=60,vy=60,z=1,run=0,raf=0,acc=0,last=0,spd=1,dr=null,uid=1,bid=1,fr=0,inited=0,at;
const env={sig:s=>{if(!s)return 0;const[a,i]=s.split(':'),n=N(+a);return n?+n.o[+i]||0:0}},
 part=id=>M.parts.find(p=>p.id==id),cp=()=>sel&&sel.k=='p'?part(sel.id):null,cb=()=>sel&&sel.k=='b'?X.balls.find(b=>b.id==sel.id):null,snap=v=>Math.round(v/10)*10,
 okc=m=>!M.parts.length&&!M.balls.length||confirm(m),
 CO=[['any','すべて'],['r','赤'],['b','青'],['g','緑']],
 FD={belt:[['len','長さ(px)','n'],['spd','速度(px/秒)','n'],['dir','方向','e',[[1,'右へ'],[-1,'左へ']]],['on','動作（手動）','b'],['src','回路信号で動作（設定すると手動より優先）','s']],
  sensor:[['range','検出幅(px)','n']],
  gate:[['mode','モード','e',[['auto','色で自動'],['manual','手動'],['circuit','回路信号']]],['col','自動: 落とす色','e',CO.slice(1)],['open','手動: 開く','b'],['src','回路: 制御元（1で開く）','s'],['w','開口幅(px)','n']],
  bin:[['w','幅(px)','n'],['acc','受け入れる色','e',CO]]},
 LB=[['搬送',[['belt','ベルトコンベア','長さ・速度・停止/動作']]],['検知・制御',[['sensor','色センサー','ボールの色を検出'],['gate','仕分けゲート','手動/色/回路で落とす']]],['収納',[['bin','仕分け箱','色別に個数を表示']]]];
function toastE(m){toast(m,'e')}
function autosave(){clearTimeout(at);at=setTimeout(()=>{try{localStorage.setItem(AUTO,JSON.stringify(exp()))}catch(e){}},300)}
const exp=()=>({v:1,kind:'machine',name:M.name,parts:M.parts.map(({id,t,x,y,p})=>({id,t,x,y,p})),balls:M.balls.map(({id,x,y,c})=>({id,x,y,c}))});
function mclean(d){if(!d||d.v!==1||d.kind!='machine'||!Array.isArray(d.parts)||!Array.isArray(d.balls))throw Error('Machine Labの形式ではありません');
 if(d.parts.length>200||d.balls.length>300)throw Error('部品またはボールが多すぎます');const ids=new Set,bi=new Set,ok=isFinite;
 const parts=d.parts.map(r=>{if(!r||!Q.PD[r.t]||!ok(r.x)||!ok(r.y)||!Number.isInteger(r.id)||ids.has(r.id))throw Error('不正な部品データが含まれています');ids.add(r.id);return{id:r.id,t:r.t,x:+r.x,y:+r.y,p:Q.cleanP(r.t,r.p)}}),
  balls=d.balls.map(r=>{if(!r||!ok(r.x)||!ok(r.y)||!['r','b','g'].includes(r.c)||!Number.isInteger(r.id)||bi.has(r.id))throw Error('不正なボールデータが含まれています');bi.add(r.id);return{id:r.id,x:+r.x,y:+r.y,c:r.c}});
 return{name:String(d.name||'無題の機械').slice(0,40),parts,balls}}
function load(m,keepView){pause();M=m;uid=Math.max(0,...M.parts.map(p=>p.id))+1;bid=Math.max(0,...M.balls.map(b=>b.id))+1;X=Q.newX(M);sel=null;$('#mlname').value=M.name;props();if(!keepView)mfit();paint();autosave()}
function ch(rp){if(rp)props();paint();autosave()}
// ---- 描画 ----
const vw=()=>$('#mlvp').setAttribute('transform',`translate(${vx} ${vy}) scale(${z})`),
 sc=p=>sel&&sel.k=='p'&&sel.id==p.id?' sel':'';
function partSvg(p){const s=Q.ps(X,p),q=p.p,h=`<g class="mp${sc(p)}" data-m="${p.id}">`,lab=(t,x=p.x,y=p.y-6)=>`<text x="${x}" y="${y}">${esc(t)}</text>`;
 if(p.t=='belt'){const v=Q.vel(p,env);return h+`<rect class="mlbelt" x="${p.x}" y="${p.y}" width="${q.len}" height="16" rx="8"/><line class="mlstr" x1="${p.x+8}" y1="${p.y+8}" x2="${p.x+q.len-8}" y2="${p.y+8}" stroke-dashoffset="${-(X.t*v)%16}"/>`+lab(`ベルト#${p.id} ${v?(v>0?'▶':'◀')+Math.abs(v):'停止'}`,p.x+4,p.y+31)+'</g>'}
 if(p.t=='sensor')return h+`<rect class="mlbeam${s.det?' on':''}" x="${p.x}" y="${p.y+14}" width="${q.range}" height="56"/><rect class="mlsens" x="${p.x}" y="${p.y}" width="${q.range}" height="14" rx="4"/><circle cx="${p.x+q.range/2}" cy="${p.y+7}" r="4" style="fill:${s.last?Q.CK[s.last]:'#5b6fa8'}"/>`+lab(`センサー#${p.id}${s.det?'（検出中）':''}`)+'</g>';
 if(p.t=='gate')return h+`<rect class="mlhit" x="${p.x}" y="${p.y-26}" width="${q.w}" height="40"/>`+(s.open?`<rect class="mlfl" x="${p.x}" y="${p.y}" width="6" height="5"/><rect class="mlfl" x="${p.x+q.w-6}" y="${p.y}" width="6" height="5"/><rect class="mlhole" x="${p.x}" y="${p.y-2}" width="${q.w}" height="22"/>`:`<rect class="mlgate" x="${p.x}" y="${p.y-1}" width="${q.w}" height="5" rx="2"/>`)+lab(`ゲート#${p.id} ${s.open?'開':'閉'}（${{auto:'色:'+(Q.CN[q.col]||''),manual:'手動',circuit:'回路'}[q.mode]}）`,p.x,p.y-12)+'</g>';
 const k=Q.bn(X,p),w=q.w;return h+`<path class="mlbin" d="M${p.x} ${p.y}V${p.y+70}H${p.x+w}V${p.y}"/>`+['r','b','g'].map((c,i)=>`<text class="mlc" x="${p.x+w*(i+.5)/3}" y="${p.y+45}" style="fill:${Q.CK[c]}">${k[c]}</text>`).join('')+lab(`箱#${p.id} 計${k.r+k.b+k.g}${q.acc!='any'?'／'+Q.CN[q.acc]+'用 誤'+k.wr:''}`,p.x,p.y+88)+'</g>'}
function paint(){mg.innerHTML=M.parts.map(partSvg).join('')+X.balls.map(b=>`<circle class="mlb${sel&&sel.k=='b'&&sel.id==b.id?' sel':''}" data-b="${b.id}" cx="${b.x}" cy="${b.y}" r="${Q.R}" style="fill:${Q.CK[b.c]}"/>`).join('');live()}
function nodeName(n){return (n.lb||D[n.t].n)+'#'+n.id}
function srcOpts(cur){const o=S.nodes.flatMap(n=>D[n.t].o.map((l,i)=>`<option value="${n.id}:${i}"${cur==n.id+':'+i?' selected':''}>${esc(nodeName(n)+'.'+l)} = ${fmt(n.o[i]||0)}</option>`));
 if(cur&&!o.some(s=>s.includes(`value="${cur}"`)))o.unshift(`<option value="${cur}" selected>（見つかりません: ${cur}）</option>`);return'<option value="">（なし）</option>'+o.join('')}
const fld=(p,[k,l,t,o])=>t=='b'?`<label>${l}<input type="checkbox" data-k="${k}"${p.p[k]?' checked':''}></label>`:t=='n'?`<label>${l}<input type="number" data-k="${k}" value="${p.p[k]}" step="10" min="${Q.RG[k][0]}" max="${Q.RG[k][1]}"></label>`:
 t=='e'?`<label>${l}<select data-k="${k}">${o.map(([v,n])=>`<option value="${v}"${v==p.p[k]?' selected':''}>${n}</option>`).join('')}</select></label>`:`<label class="mlsrc">${l}<select data-k="${k}">${srcOpts(p.p[k])}</select></label>`;
function props(){const e=$('#mlprops'),p=cp(),b=cb();
 if(p)e.innerHTML=`<h3>${Q.TN[p.t]} #${p.id}</h3>`+FD[p.t].map(f=>fld(p,f)).join('')+`<div id="mlst" class="mu"></div><div class="row">${p.t=='bin'?'<button id="mlbr">中身をリセット</button>':''}<button id="mldup">複製</button><button id="mldel">削除</button></div>`;
 else if(b)e.innerHTML=`<h3>ボール #${b.id}</h3><label>色<select data-k="c">${['r','b','g'].map(c=>`<option value="${c}"${b.c==c?' selected':''}>${Q.CN[c]}</option>`).join('')}</select></label><div class="row"><button id="mldel">削除</button></div>`;
 else e.innerHTML=`<h3>プロパティ</h3><p class="mu">部品かボールをクリックすると設定を編集できます。ライブラリの「ボール」で赤・青・緑を生成（ベルトを選ぶとその入口に出ます）。</p><h4 style="color:var(--cy);font-size:12px">回路スイッチ（Circuit Studio）</h4>`+(S.nodes.filter(n=>n.t=='sw').map(n=>`<button data-sw="${n.id}">${esc(nodeName(n))}: ${n.p.on?'ON':'OFF'}</button> `).join('')||'<p class="mu">スイッチなし。回路の出力でゲートやベルトを制御できます。</p>')}
function live(){const p=cp(),el=$('#mlst');
 if(el&&p){const s=Q.ps(X,p),k=Q.bn(X,p);el.innerHTML=p.t=='sensor'?`現在: ${s.det?'検出中':'検出なし'}<br>最後に検出した色: ${s.last?Q.CN[s.last]:'なし'}<br>検出回数: ${s.cnt}`:p.t=='gate'?`状態: ${s.open?'開（落とす）':'閉（通過）'}`:p.t=='belt'?`状態: ${Q.vel(p,env)?'動作中':'停止中'}`:`赤${k.r} 青${k.b} 緑${k.g}／合計${k.r+k.b+k.g}`}
 if(++fr%10==0)document.querySelectorAll('#mlprops select[data-k=src]').forEach(s=>{const v=s.value;if(s===document.activeElement)return;s.innerHTML=srcOpts(v)});
 const t=Object.values(X.bn).reduce((a,k)=>a+k.r+k.b+k.g,0);$('#mlstat').textContent=`状態: ${run?'実行中':'停止中'}　時刻: ${X.t.toFixed(2)}秒　速度: ${spd}×　ボール: ${X.balls.length}　仕分け済み: ${t}　消失: ${X.lost}　回路: ${S.nodes.length?S.nodes.length+'部品':'なし'}`;
 $('#mlrun').disabled=!!run;$('#mlpause').disabled=!run}
// ---- 実行制御（回路エンジンstep()を再利用、タイマーは本タブのrAFのみ） ----
function tk(){if(S.nodes.length)step(Q.DT);Q.tick(M,X,env)}
function frame(now){raf=0;if(!run)return;try{acc+=Math.min((now-last)/1e3,.1)*spd;last=now;let n=0;while(acc>=Q.DT&&n<12){tk();acc-=Q.DT;n++}if(n==12)acc=0;paint();raf=requestAnimationFrame(frame)}
 catch(x){pause();log('Machine Lab計算エラー: '+x.message,'e');toastE('計算エラー: '+x.message)}}
function go(){if(run)return;if(!M.parts.length)return toastE('部品がありません');if(tm){stop(1);log('Machine Labが回路の実行を引き継ぎました','i')}run=1;acc=0;last=performance.now();window.ANL&&ANL.sys('circ','sim','Machine Labが回路を駆動開始');raf=requestAnimationFrame(frame);live()}
function pause(){if(run)window.ANL&&ANL.sys('circ','sim','Machine Labが回路駆動を停止');run=0;cancelAnimationFrame(raf);raf=0;if(vis())paint()}
const vis=()=>hd.dataset.tab=='machine';
function stepN(){pause();try{for(let i=0;i<5;i++)tk()}catch(x){toastE('計算エラー: '+x.message)}paint()}
function reset(){pause();X=Q.newX(M);if(S.nodes.length)resetSim();paint()}
// ---- 編集 ----
function addPart(t){const r=svgM.getBoundingClientRect(),o=(M.parts.length%6)*20,p={id:uid++,t,x:snap((r.width/2-vx)/z-60+o),y:snap((r.height/2-vy)/z+o),p:Q.cleanP(t)};if(M.parts.length>=200)return toastE('部品が多すぎます');M.parts.push(p);magnet(p);sel={k:'p',id:p.id};ch(1)}
function magnet(p){if(p.t!='gate')return;const b=M.parts.find(b=>b.t=='belt'&&p.x>=b.x&&p.x<=b.x+b.p.len&&Math.abs(p.y-b.y)<30);if(b)p.y=b.y}
function spawn(c){const b0=cp()&&cp().t=='belt'?cp():M.parts.find(p=>p.t=='belt'),r=svgM.getBoundingClientRect();let x,y;
 if(b0){x=b0.x+16;y=b0.y-Q.R;while(X.balls.some(b=>Math.hypot(b.x-x,b.y-y)<Q.R*2+2)&&x<b0.x+b0.p.len-10)x+=Q.R*2+4;if(x>=b0.x+b0.p.len-10)return toastE('ベルトの入口に空きがありません')}
 else{x=(r.width/2-vx)/z;y=(r.height/2-vy)/z-100;toast('ベルトがないため、ボールは落下します')}
 if(X.balls.length>=300)return toastE('ボールが多すぎます');const q={id:bid++,x,y,c};if(X.t==0)M.balls.push(q);X.balls.push(Q.nb(q));sel={k:'b',id:q.id};ch(1)}
function del(){const p=cp(),b=cb();if(p){M.parts=M.parts.filter(q=>q!=p);delete X.ps[p.id];delete X.bn[p.id]}else if(b){X.balls=X.balls.filter(q=>q!=b);M.balls=M.balls.filter(q=>q.id!=b.id)}else return;sel=null;ch(1)}
function dup(){const p=cp();if(!p||M.parts.length>=200)return;const n={id:uid++,t:p.t,x:p.x+30,y:p.y+30,p:{...p.p}};M.parts.push(n);sel={k:'p',id:n.id};ch(1)}
// ---- 入力 ----
const wp=e=>{const r=svgM.getBoundingClientRect();return[(e.clientX-r.left-vx)/z,(e.clientY-r.top-vy)/z]};
function zoom(f,mx,my){const r=svgM.getBoundingClientRect();mx=mx??r.width/2;my=my??r.height/2;const nz=Math.min(2.5,Math.max(.3,z*f));vx=mx-(mx-vx)/z*nz;vy=my-(my-vy)/z*nz;z=nz;vw()}
function mfit(){const r=svgM.getBoundingClientRect();if(!r.width)return;const xs=[],ys=[];M.parts.forEach(p=>{xs.push(p.x,p.x+(p.p.len||p.p.w||p.p.range));ys.push(p.y-40,p.y+(p.t=='bin'?100:30))});
 if(!xs.length){vx=60;vy=60;z=1;return vw()}const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 z=Math.min(1.5,Math.max(.3,Math.min(r.width/(x1-x0+80),r.height/(y1-y0+80))));vx=(r.width-(x1-x0)*z)/2-x0*z;vy=(r.height-(y1-y0)*z)/2-y0*z;vw()}
svgM.addEventListener('pointerdown',e=>{e.preventDefault();svgM.focus();const[x,y]=wp(e),m=e.target.closest('[data-m]'),b=e.target.closest('[data-b]');dr=null;
 if(m){const p=part(+m.dataset.m);sel={k:'p',id:p.id};dr={m:'move',p,dx:x-p.x,dy:y-p.y,sx:e.clientX,sy:e.clientY,mv:0}}
 else if(b)sel={k:'b',id:+b.dataset.b};else{sel=null;dr={m:'pan',x:e.clientX,y:e.clientY,vx,vy}}props();paint()});
addEventListener('pointermove',e=>{if(!dr)return;if(dr.m=='pan'){vx=dr.vx+e.clientX-dr.x;vy=dr.vy+e.clientY-dr.y;return vw()}
 if(!dr.mv&&Math.hypot(e.clientX-dr.sx,e.clientY-dr.sy)<4)return;dr.mv=1;const[x,y]=wp(e);dr.p.x=snap(x-dr.dx);dr.p.y=snap(y-dr.dy);magnet(dr.p);paint()});
const up=()=>{if(dr&&dr.mv)autosave();dr=null};addEventListener('pointerup',up);addEventListener('pointercancel',up);
svgM.addEventListener('wheel',e=>{e.preventDefault();const r=svgM.getBoundingClientRect();zoom(e.deltaY<0?1.1:.9,e.clientX-r.left,e.clientY-r.top)},{passive:false});
addEventListener('keydown',e=>{if(!vis()||/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)||e.ctrlKey||e.metaKey)return;const k=e.key.toLowerCase();
 if(k=='delete'||k=='backspace'){e.preventDefault();del()}else if(k==' '){e.preventDefault();run?pause():go()}else if(k=='escape'){sel=null;props();paint()}});
$('#mlprops').addEventListener('change',e=>{const k=e.target.dataset.k,p=cp(),b=cb();if(!k||e.target.value==='')return;
 if(b&&k=='c'){b.c=e.target.value;const m=M.balls.find(q=>q.id==b.id);if(m)m.c=b.c;return ch()}
 if(!p)return;const v=e.target.type=='checkbox'?+e.target.checked:e.target.type=='number'||k=='dir'?+e.target.value:e.target.value;p.p=Q.cleanP(p.t,{...p.p,[k]:v});if(e.target.type=='number')e.target.value=p.p[k];magnet(p);ch()});
$('#mlprops').addEventListener('click',e=>{const t=e.target,i=t.id;if(i=='mldel')del();else if(i=='mldup')dup();else if(i=='mlbr'){const p=cp();if(p){delete X.bn[p.id];ch()}}
 else if(t.dataset.sw){const n=N(+t.dataset.sw);if(n){push();n.p.on=n.p.on?0:1;pk='';props();paint()}}});
// ---- 保存・読込 ----
const PL=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{}}catch{return{}}};
function plist(){$('#mlplist').innerHTML=Object.keys(PL()).map(k=>`<option>${esc(k)}</option>`).join('')||'<option value="">（保存なし）</option>'}
function save(){try{const p=PL();p[M.name]=exp();localStorage.setItem(KEY,JSON.stringify(p));plist();$('#mlplist').value=M.name;toast(`機械「${M.name}」を保存しました`)}catch(e){toastE('保存に失敗しました: '+e.message)}}
function loadData(d,msg){try{const m=mclean(d);if(!okc('現在の機械を読み込み内容で置き換えますか？（現在の機械は自動保存されています）'))return;load(m);toast(msg)}catch(x){toastE('読み込み失敗: '+x.message+'（現在の機械は変更されていません）')}}
$('#mlsave').onclick=save;$('#mlload').onclick=()=>{const k=$('#mlplist').value,p=PL()[k];if(!p)return toastE('読み込む項目がありません');loadData(p,`機械「${k}」を読み込みました`)};
$('#mlpdel').onclick=()=>{const k=$('#mlplist').value,p=PL();if(!p[k]||!confirm(`機械「${k}」を削除しますか？`))return;delete p[k];localStorage.setItem(KEY,JSON.stringify(p));plist();toast('削除しました')};
$('#mlnew').onclick=()=>{if(!okc('新しい機械を作成します。現在の機械は自動保存されています。よろしいですか？'))return;load(Q.blank())};
$('#mlclr').onclick=()=>{if(!okc('すべての部品とボールを削除します。よろしいですか？'))return;load({name:M.name,parts:[],balls:[]})};
$('#mlexp').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(exp(),null,1)],{type:'application/json'}));a.download=M.name+'.machine.json';a.click();URL.revokeObjectURL(a.href);toast('JSONを出力しました')};
$('#mlimp').onclick=()=>$('#mlfile').click();
$('#mlfile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(!f)return;const r=new FileReader();r.onload=()=>{try{loadData(JSON.parse(r.result),'JSONを読み込みました')}catch(x){toastE('読み込み失敗: '+x.message)}};r.readAsText(f)};
$('#mlname').onchange=e=>{M.name=e.target.value.trim()||'無題の機械';e.target.value=M.name;autosave()};
$('#mlsamples').innerHTML='<option value="">サンプル機械…</option>'+Q.SMP.map((s,i)=>`<option value="${i}">${esc(s.nm)}</option>`).join('');
$('#mlsamples').onchange=e=>{const s=Q.SMP[e.target.value];e.target.value='';if(!s)return;if(!okc('サンプルを読み込みます。現在の機械は自動保存されています。よろしいですか？'))return;
 if(s.circ){if(S.nodes.length&&!confirm('このサンプルはCircuit Studioの回路も置き換えます（Circuit Studioの「元に戻す」で復元可）。続けますか？'))return;push();stop(1);setData(clean(s.circ()));sv()}
 load(s.m());if(s.h)log(s.h,'i');toast(`「${s.nm}」を読み込みました`)};
$('#mlrun').onclick=go;$('#mlpause').onclick=pause;$('#mlstep').onclick=stepN;$('#mlreset').onclick=reset;$('#mlfit').onclick=mfit;$('#mlzi').onclick=()=>zoom(1.2);$('#mlzo').onclick=()=>zoom(.8);
$('#mlspd').onchange=e=>{spd=+e.target.value||1;live()};
$('#mlbrall').onclick=()=>{if(X.bn&&Object.keys(X.bn).length&&!confirm('すべての仕分け箱の中身を空にします。よろしいですか？'))return;X.bn={};ch(1)};
// ---- ライブラリ ----
$('#mllib').innerHTML=LB.map(([c,a])=>`<h4>${c}</h4>`+a.map(([t,n,d])=>`<button data-add="${t}" title="${d}">${n}<small>${d}</small></button>`).join('')).join('')+'<h4>ボール</h4>'+['r','b','g'].map(c=>`<button data-ball="${c}"><span style="color:${Q.CK[c]}">●</span> ${Q.CN[c]}ボールを生成<small>ベルト入口に追加</small></button>`).join('');
$('#mllib').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.add)addPart(b.dataset.add);else if(b.dataset.ball)spawn(b.dataset.ball)};
function tab(on){if(!on){pause();window.draw&&draw();return}
 if(!inited){inited=1;plist();try{const a=localStorage.getItem(AUTO);if(a)load(mclean(JSON.parse(a)),1);else load(Q.SMP[0].m(),1)}catch(x){log('Machine Labの自動保存を読み込めませんでした: '+x.message,'e');load(Q.SMP[0].m(),1)}}
 $('#mlname').value=M.name;props();requestAnimationFrame(()=>{mfit();paint()})}
vw();return{tab,save,test:Q.test,zs:{exp,mclean,load,pause}}})();/*ZS-HOOK*/
