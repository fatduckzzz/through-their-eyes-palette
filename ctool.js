/* ============================================================
   ctool.js — 配色表 + 冲突检测 + 四宫格模拟

   这一段原样抽自主站 through-their-eyes 的 app.js（调色工具那个
   IIFE），只在外面补了这段说明。刻意不改动内部实现，方便日后与
   主站同步：主站改了，直接重抽一次覆盖即可。

   依赖：i18n.js 提供的全局 t()
   ============================================================ */

(function(){
    var rowsEl=document.getElementById('ctRows'); if(!rowsEl) return;
    /* 打开页面看到的默认配色。用 Paul Tol muted 里的四个色。

       原来的默认是 Material Design 2014 那组 #D81B60 / #1E88E5 /
       #FFC107 / #004D40，常被人称作"色觉友好"，但它从没被认真验证过：
       #D81B60（品红）在红色盲下会大幅变暗——红色盲对红光的感光效率
       很低——塌到接近 #004D40（墨绿）那一档，模拟后总色差只剩 14.5，
       两块深色摆在一起分不开。这不是判据太紧，是这组配色本身在红色
       盲这一项上确实不行，工具一进来就该指出来。

       换成不进来就报自己一处冲突的默认：Tol muted 四色，模拟后最近
       的一对仍差 36.5，三种色觉全过。 */
    var DEFAULT=['#332288','#88CCEE','#DDCC77','#CC6677'];
    var palette=DEFAULT.slice();
    /* 当前配色是不是原样来自某个标准预设。是的话，检测结果里会先说
       一句"这是 IBM/Okabe–Ito/Tol,下面是它已知的弱项"——否则用户
       载入一个标为"配色"的东西却看到四条冲突,只会觉得工具坏了。
       一旦手动改过任意一格就清空。 */
    var activeRef=null;

    /* 色彩计算全部走 cvd.js。这里原来自带一套 Machado 2009 矩阵，
       和图片检查那半边用的不是同一套——同一个颜色两边显示的模拟
       结果最大差到 ΔE 17。现在两边共用 Brettel 1997。 */
    var hex2rgb=CVD.hex2rgb, rgb2hex=CVD.rgb2hex;
    function simulate(hex,type){ return CVD.simulateHex(hex,type); }

    /* ---------- accessibility check: collision detection + suggested fix ---------- */
    var hex2lab=CVD.hex2lab, deltaE=CVD.deltaE;
    /* One rule for the table and the chart checker: pairs.js applies the thresholds from analyse.js
       to the exact colours in the table. */

    /* ---------- repair: change the whole palette at once ----------
       The old per-pair suggestion moved one colour of one pair and never looked at the rest; on 120 test charts
       43% of such suggestions created a new clash. repair.js changes the colours of the whole palette together. */
    var REP=TTERepair.make(CVD,CVDAnalyse.CONFIG), repTimer=null;
    function clamp8(v){ return Math.max(0,Math.min(255,Math.round(v))); }
    function paletteRepair(){
      var r=REP.repair(palette.map(hex2rgb));
      return { stage:r.stage, remaining:r.remaining, moved:r.moved,
               colours:r.colours.map(function(c){ return rgb2hex(c.map(clamp8)); }) };
    }
    function howText(stage){ return t('ct.repair.how'+(stage>=1&&stage<=3?stage:1)); }

    /* the heads-up tier: pairs that only lightness keeps apart (outside the audited rule, same definition as the story) */
    function softList(F){
      var hard={}; F.forEach(function(v){ hard[v.i+','+v.j]=1; });
      return REP.softPairs(palette.map(hex2rgb)).filter(function(p){ return !hard[p.i+','+p.j]; })
        .sort(function(p,q){ return p.light-q.light; });
    }

    function renderCheck(){
      var el=document.getElementById('ctCheck'); if(!el) return;
      clearTimeout(repTimer);
      el.innerHTML='';
      /* 改一个颜色整张表会重画，结论也跟着变。没有 live region 的话
         读屏用户改完不会知道结果变了。 */
      el.setAttribute('role','status');
      el.setAttribute('aria-live','polite');
      el.setAttribute('aria-label',t('ct.a11y.results'));
      var F=TTEPairs.analyse(palette).findings, soft=softList(F);
      var common=F.filter(function(v){return !v.rareTypeOnly;});
      var rare=F.filter(function(v){return v.rareTypeOnly;});

      if(F.length===0 && soft.length===0){
        var ok=document.createElement('div'); ok.className='ct-check-ok';
        ok.textContent=t('ct.check.ok');
        el.appendChild(ok);
        return;
      }

      var head=document.createElement('div'); head.className='ct-found';
      head.innerHTML=TTEUI.summaryHtml(F.length, F.filter(function(v){return v.severity==='high';}).length, soft.length);
      el.appendChild(head);
      if(activeRef){
        var refnote=document.createElement('div'); refnote.className='ct-check-refnote';
        refnote.textContent=fill(t('ct.check.refnote'),{name:activeRef});
        el.appendChild(refnote);
      }

      function list(items){
        var ul=document.createElement('ul'); ul.className='ct-pairs';
        ul.innerHTML=items.map(function(v){
          return TTEUI.pairRow({a:palette[v.i],b:palette[v.j],i:v.i,j:v.j,severity:v.severity||'soft',types:v.types,de:v.simDE});
        }).join('');
        return ul;
      }

      if(F.length){
        /* 红绿两型的问题(约占男性 8.5%)：正常展示。一条都没有就先说
           "常见的两型下没问题"。 */
        if(common.length===0){
          var okc=document.createElement('div'); okc.className='ct-check-ok';
          okc.textContent=t('ct.check.okcommon');
          el.appendChild(okc);
        } else el.appendChild(list(common));

        /* 只在蓝黄色盲下才塌的对(约万分之一)：单独一组，放后面。 */
        if(rare.length){
          var rh=document.createElement('div'); rh.className='ct-check-subhead';
          rh.textContent=fill(t('ct.check.tritanhead'),{n:rare.length});
          el.appendChild(rh);
          el.appendChild(list(rare));
        }
      }
      if(soft.length){
        var sh=document.createElement('div'); sh.className='ct-check-subhead';
        sh.textContent=t('ct.soft.head');
        el.appendChild(sh);
        el.appendChild(list(soft.map(function(p){ return {i:p.i,j:p.j,types:p.types,severity:'soft'}; })));
      }

      if(F.length){
        var box=document.createElement('div'); box.className='ct-repair';
        box.innerHTML='<div class="ct-repair-k">'+TTEUI.esc(t('ct.repair.title'))+'</div><p class="ct-repair-p">'+TTEUI.esc(t('ct.repair.working'))+'</p>';
        el.appendChild(box);
        /* the search takes a moment; wait until the colour picker stops moving */
        repTimer=setTimeout(function(){ fillRepair(box); },160);
      }
    }
    function fillRepair(box){
      if(!document.body.contains(box)) return;
      var rep=paletteRepair(), h='<div class="ct-repair-k">'+TTEUI.esc(t('ct.repair.title'))+'</div>';
      if(rep.stage<=0 || rep.remaining>0){
        box.innerHTML=h+'<p class="ct-repair-p">'+TTEUI.esc(t('ct.repair.none'))+'</p>';
        return;
      }
      h+='<p class="ct-repair-p">'+TTEUI.esc(fill(t('ct.repair.p'),{n:rep.moved.length,m:palette.length,how:howText(rep.stage)}))+'</p><div class="ct-repair-sw">';
      rep.moved.forEach(function(k){
        h+='<span class="ct-chg"><b>'+(k+1)+'</b><i style="background:'+palette[k]+'"></i><em aria-hidden="true">\u2192</em><i style="background:'+rep.colours[k]+'"></i>'+
           '<span class="ct-chg-hex">'+palette[k].toUpperCase()+' \u2192 '+rep.colours[k].toUpperCase()+'</span></span>';
      });
      h+='</div>';
      if(rep.soft>0) h+='<p class="ct-repair-p ct-repair-left">'+TTEUI.esc(fill(t('ct.repair.softleft'),{n:rep.soft}))+'</p>';
      h+='<button type="button" class="btn ct-apply">'+TTEUI.esc(t('ct.repair.apply'))+'</button><p class="mono-note ct-repair-caveat">'+TTEUI.esc(t('ct.repair.caveat'))+'</p>';
      box.innerHTML=h;
      box.querySelector('.ct-apply').addEventListener('click',function(){ palette=rep.colours.slice(); activeRef=null; render(); });
    }

    /* ---------- second cue: a pattern on every colour, and a small chart drawn with the palette ---------- */
    var fixOn=false, demoEye='normal';
    var PATCSS=[
      'repeating-linear-gradient(45deg,rgba(0,0,0,.62) 0 3px,transparent 3px 8px)',
      'radial-gradient(rgba(0,0,0,.65) 22%,transparent 24%) 0 0/9px 9px',
      'linear-gradient(rgba(0,0,0,.6) 2px,transparent 2px) 0 0/9px 9px,linear-gradient(90deg,rgba(0,0,0,.6) 2px,transparent 2px) 0 0/9px 9px',
      'repeating-linear-gradient(90deg,rgba(0,0,0,.6) 0 3px,transparent 3px 8px)',
      'repeating-linear-gradient(-45deg,rgba(0,0,0,.62) 0 3px,transparent 3px 8px)',
      'repeating-linear-gradient(0deg,rgba(0,0,0,.6) 0 3px,transparent 3px 8px)'
    ];
    function patEl(i){ var p=document.createElement('i'); p.className='ct-pat'; p.setAttribute('aria-hidden','true'); p.style.background=PATCSS[i%PATCSS.length]; return p; }
    var demoChart='bars';
    var WEIGHTS=[6,9,5,8,4,7,3,6,5,8];
    var DASH=['','8 4','2 4','11 4 2 4','15 5','1 5'];
    function colOf(hex){ return demoEye==='normal'?hex:simulate(hex,demoEye); }
    function mark(i,x,y,col){
      var s='<g transform="translate('+x.toFixed(1)+' '+y.toFixed(1)+')" fill="'+col+'" stroke="#0c0c10" stroke-width="1.3">';
      switch(i%6){
        case 0: s+='<circle r="4.6"/>'; break;
        case 1: s+='<rect x="-4.2" y="-4.2" width="8.4" height="8.4"/>'; break;
        case 2: s+='<polygon points="0,-5.4 5,3.8 -5,3.8"/>'; break;
        case 3: s+='<polygon points="0,-5.6 5.6,0 0,5.6 -5.6,0"/>'; break;
        case 4: s+='<path d="M-1.8 -5H1.8V-1.8H5V1.8H1.8V5H-1.8V1.8H-5V-1.8H-1.8Z"/>'; break;
        default: s+='<path d="M-4.6 -2.6L-2.6 -4.6 0 -2 2.6 -4.6 4.6 -2.6 2 0 4.6 2.6 2.6 4.6 0 2 -2.6 4.6 -4.6 2.6 -2 0Z"/>';
      }
      return s+'</g>';
    }
    function barsSVG(w){
      var n=palette.length,gw=(w-40)/n,bw=Math.min(46,gw-10),s='';
      s+='<line x1="20" x2="'+(w-20)+'" y1="150" y2="150" stroke="rgba(255,255,255,.4)"/>';
      palette.forEach(function(hex,i){
        var bh=WEIGHTS[i%10]*12,x=20+gw*i+(gw-bw)/2,y=150-bh;
        s+='<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+'" rx="3" fill="'+colOf(hex)+'"/>';
        if(fixOn) s+='<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+'" rx="3" fill="url(#tp-'+(i%6)+')" opacity=".9"/>';
        s+='<text x="'+(x+bw/2)+'" y="'+(y-6)+'" text-anchor="middle" class="val">'+WEIGHTS[i%10]+'</text>';
        s+='<text x="'+(x+bw/2)+'" y="170" text-anchor="middle">'+(i+1)+'</text>';
      });
      return s;
    }
    /* lines: colour and a legend always; with the second cue on, each line also gets its own dash, its own marker and a number at its end */
    function linesSVG(w){
      var n=palette.length,L=34,R=fixOn?38:16,T=12,B=148,pw=w-L-R,pts=6,s='',ends=[];
      for(var g=0;g<=3;g++){ var gy=B-(B-T)*g/3; s+='<line x1="'+L+'" x2="'+(w-R)+'" y1="'+gy+'" y2="'+gy+'" stroke="rgba(255,255,255,'+(g?'.08':'.4')+')"/>'; }
      palette.forEach(function(hex,i){
        var col=colOf(hex),d='',last=null;
        for(var j=0;j<pts;j++){
          var v=Math.max(10,Math.min(92,44+30*Math.sin(i*1.7+j*0.85+0.4)+(j-2.5)*(i%3-1)*4)),x=L+pw*j/(pts-1),y=B-(B-T)*v/100;
          d+=(j?'L':'M')+x.toFixed(1)+' '+y.toFixed(1); last=[x,y];
        }
        s+='<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"'+(fixOn&&DASH[i%6]?' stroke-dasharray="'+DASH[i%6]+'"':'')+'/>';
        if(fixOn){
          for(var k=0;k<pts;k+=1){ var vv=Math.max(10,Math.min(92,44+30*Math.sin(i*1.7+k*0.85+0.4)+(k-2.5)*(i%3-1)*4)); s+=mark(i,L+pw*k/(pts-1),B-(B-T)*vv/100,col); }
          ends.push({i:i,y:last[1]});
        }
      });
      if(fixOn){   /* number at the end of each line, pushed apart so they do not overlap */
        ends.sort(function(p,q){return p.y-q.y;});
        for(var e=1;e<ends.length;e++) if(ends[e].y-ends[e-1].y<11) ends[e].y=ends[e-1].y+11;
        ends.forEach(function(p){ s+='<text x="'+(w-R+8)+'" y="'+(p.y+4)+'" class="val" style="font-size:12px;text-anchor:start">'+(p.i+1)+'</text>'; });
      }
      palette.forEach(function(hex,i){   /* legend: the part colour has to carry on its own */
        var lx=L+i*46; s+='<rect x="'+lx+'" y="165" width="12" height="12" rx="3" fill="'+colOf(hex)+'"/><text x="'+(lx+17)+'" y="175">'+(i+1)+'</text>';
      });
      return s;
    }
    function pieSVG(w){
      var n=palette.length,cx=150,cy=92,r=78,total=0,a0=-Math.PI/2,s='',i;
      for(i=0;i<n;i++) total+=WEIGHTS[i%10];
      palette.forEach(function(hex,i){
        var a1=a0+2*Math.PI*WEIGHTS[i%10]/total,x0=cx+r*Math.cos(a0),y0=cy+r*Math.sin(a0),x1=cx+r*Math.cos(a1),y1=cy+r*Math.sin(a1),big=(a1-a0>Math.PI)?1:0;
        var d='M'+cx+' '+cy+'L'+x0.toFixed(1)+' '+y0.toFixed(1)+'A'+r+' '+r+' 0 '+big+' 1 '+x1.toFixed(1)+' '+y1.toFixed(1)+'Z';
        s+='<path d="'+d+'" fill="'+colOf(hex)+'" stroke="#0c0c10" stroke-width="1.6"/>';
        if(fixOn){
          s+='<path d="'+d+'" fill="url(#tp-'+(i%6)+')" opacity=".9" stroke="#0c0c10" stroke-width="1.6"/>';
          var am=(a0+a1)/2; s+='<text x="'+(cx+r*0.64*Math.cos(am)).toFixed(1)+'" y="'+(cy+r*0.64*Math.sin(am)+5).toFixed(1)+'" text-anchor="middle" class="val" style="paint-order:stroke;stroke:#0c0c10;stroke-width:3px">'+(i+1)+'</text>';
        }
        a0=a1;
      });
      var lx=290,rowH=Math.min(17,160/n),ly=Math.max(10,95-rowH*n/2);   /* legend: the part colour has to carry on its own */
      palette.forEach(function(hex,i){
        var y=ly+i*rowH;
        s+='<rect x="'+lx+'" y="'+y+'" width="14" height="'+(rowH-4)+'" rx="3" fill="'+colOf(hex)+'"/>';
        if(fixOn) s+='<rect x="'+lx+'" y="'+y+'" width="14" height="'+(rowH-4)+'" rx="3" fill="url(#tp-'+(i%6)+')" opacity=".9"/>';
        s+='<text x="'+(lx+22)+'" y="'+(y+rowH-6)+'">'+(i+1)+' \u00b7 '+WEIGHTS[i%10]+'</text>';
      });
      return s;
    }
    function drawDemo(){
      var svg=document.getElementById('ctDemo'); if(!svg) return;
      var w=560,h=190,s='';
      s+='<defs>'+
        '<pattern id="tp-0" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#0c0c10" stroke-width="3"/></pattern>'+
        '<pattern id="tp-1" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="4.5" cy="4.5" r="2" fill="#0c0c10"/></pattern>'+
        '<pattern id="tp-2" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 0H9M0 0V9" stroke="#0c0c10" stroke-width="2" fill="none"/></pattern>'+
        '<pattern id="tp-3" width="8" height="8" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="8" stroke="#0c0c10" stroke-width="3"/></pattern>'+
        '<pattern id="tp-4" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#0c0c10" stroke-width="3"/></pattern>'+
        '<pattern id="tp-5" width="7" height="7" patternUnits="userSpaceOnUse"><line x1="0" y1="3.5" x2="7" y2="3.5" stroke="#0c0c10" stroke-width="2.6"/></pattern></defs>';
      s+=demoChart==='lines'?linesSVG(w):demoChart==='pie'?pieSVG(w):barsSVG(w);
      svg.setAttribute('viewBox','0 0 '+w+' '+h); svg.setAttribute('aria-label',t('ct.demo.alt')); svg.innerHTML=s;
      var cap=document.getElementById('ctDemoCap');
      if(cap) cap.textContent=fill(t('ct.demo.cap'),{eye:t(demoEye==='normal'?'ct.eye.normal':'ct.'+demoEye)});
    }
    (function(){
      var cb=document.getElementById('ctFix');
      if(cb) cb.addEventListener('change',function(){ fixOn=cb.checked; render(); });
      document.querySelectorAll('[data-demo-chart]').forEach(function(b){
        b.addEventListener('click',function(){
          demoChart=b.getAttribute('data-demo-chart');
          document.querySelectorAll('[data-demo-chart]').forEach(function(x){ x.setAttribute('aria-pressed',String(x===b)); });
          drawDemo();
        });
      });
      document.querySelectorAll('[data-demo-eye]').forEach(function(b){
        b.addEventListener('click',function(){
          demoEye=b.getAttribute('data-demo-eye');
          document.querySelectorAll('[data-demo-eye]').forEach(function(x){ x.setAttribute('aria-pressed',String(x===b)); });
          drawDemo();
        });
      });
    })();

    function render(){
      if(typeof paintPresets==='function') paintPresets(null);
      rowsEl.parentNode.classList.toggle('fix-on',fixOn);
      document.getElementById('ctool').classList.toggle('fix-on',fixOn);
      rowsEl.innerHTML='';
      palette.forEach(function(hex,idx){
        var HEX=hex.toUpperCase(), N=idx+1;
        var row=document.createElement('div'); row.className='ct-row';
        row.setAttribute('role','group');
        row.setAttribute('aria-label',fill(t('ct.a11y.row'),{n:N,hex:HEX}));

        var swatchTrue=document.createElement('label'); swatchTrue.className='ct-cell ct-pick';
        swatchTrue.style.background=hex;
        var inp=document.createElement('input'); inp.type='color'; inp.value=hex;
        /* 原生取色器本身可聚焦、可键盘操作，但没有名字，读屏只会
           念"颜色"。补一个。 */
        inp.setAttribute('aria-label',fill(t('ct.a11y.swatch'),{n:N,hex:HEX}));
        inp.addEventListener('input',function(){palette[idx]=inp.value;activeRef=null;render();});
        swatchTrue.appendChild(inp);
        if(fixOn) swatchTrue.appendChild(patEl(idx));
        var code=document.createElement('span'); code.className='ct-code'; code.textContent=HEX;
        swatchTrue.appendChild(code);
        if(palette.length>2){
          var del=document.createElement('button'); del.className='ct-del'; del.innerHTML='&times;';
          del.type='button';
          /* title='remove' 既没本地化也不是可靠的可及名 */
          del.setAttribute('aria-label',fill(t('ct.a11y.remove'),{n:N,hex:HEX}));
          del.addEventListener('click',function(e){e.preventDefault();palette.splice(idx,1);activeRef=null;render();});
          swatchTrue.appendChild(del);
        }
        row.appendChild(swatchTrue);
        ['protan','deutan','tritan'].forEach(function(tp){
          var sim=simulate(hex,tp);
          var c=document.createElement('div'); c.className='ct-cell'; c.style.background=sim;
          /* 模拟色块原本是裸 div，读屏什么都读不到——整张表对
             非视觉用户等于空白。给每格一个名字。 */
          c.setAttribute('role','img');
          c.setAttribute('aria-label',fill(t('ct.a11y.cell'),{hex:sim.toUpperCase(),type:t('ct.'+tp)}));
          if(fixOn) c.appendChild(patEl(idx));
          row.appendChild(c);
        });
        rowsEl.appendChild(row);
      });
      renderCheck();
      drawDemo();
    }
    document.getElementById('ctAdd').addEventListener('click',function(){
      if(palette.length>=8)return;
      palette.push('#'+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0'));
      activeRef=null; render();
    });
    document.getElementById('ctReset').addEventListener('click',function(){palette=DEFAULT.slice();activeRef=null;render();});
    var presetBtns=document.querySelectorAll('.ct-preset');
    function paintPresets(active){ presetBtns.forEach(function(x){ x.setAttribute('aria-pressed',String(x===active)); }); }
    presetBtns.forEach(function(b){
      b.setAttribute('aria-pressed','false');
      b.addEventListener('click',function(){
        palette=b.getAttribute('data-pal').split(',');
        activeRef=b.getAttribute('data-ref')||null;   // 只有 IBM/Wong/Tol 带 data-ref
        render(); paintPresets(b);
      });
    });

    /* ---------- export a plain-text accessibility report ---------- */
    function exportReport(){
      var lines=[];
      lines.push('Through Their Eyes — '+t('ct.check.title'));
      lines.push('');
      lines.push('Palette: '+palette.map(function(h){return h.toUpperCase();}).join(', '));
      lines.push('');
      var F=TTEPairs.analyse(palette).findings;
      if(F.length===0){
        lines.push(t('ct.check.ok'));
      } else {
        if(activeRef){ lines.push(fill(t('ct.check.refnote'),{name:activeRef})); lines.push(''); }
        var xcommon=F.filter(function(v){return !v.rareTypeOnly;});
        var xrare=F.filter(function(v){return v.rareTypeOnly;});
        if(xcommon.length===0) lines.push(t('ct.check.okcommon'));
        function reportRow(v){
          lines.push('- #'+(v.i+1)+' and #'+(v.j+1)+' ('+palette[v.i].toUpperCase()+' / '+palette[v.j].toUpperCase()+'): '+
            v.types.map(function(x){return t('ct.'+x);}).join(' / ')+', '+t(v.severity==='high'?'sev.high':'sev.moderate')+' (\u0394E \u2248 '+v.simDE.toFixed(1)+')');
        }
        xcommon.forEach(reportRow);
        if(xrare.length){ lines.push(''); lines.push(fill(t('ct.check.tritanhead'),{n:xrare.length})); xrare.forEach(reportRow); }
        var rep=paletteRepair();
        lines.push('');
        if(rep.stage>0 && rep.remaining===0){
          lines.push(fill(t('ct.repair.report'),{n:rep.moved.length,m:palette.length,how:howText(rep.stage)}));
          rep.moved.forEach(function(k){ lines.push('  #'+(k+1)+': '+palette[k].toUpperCase()+' -> '+rep.colours[k].toUpperCase()); });
          lines.push('  '+t('ct.repair.caveat'));
        } else lines.push(t('ct.repair.none'));
      }
      var blob=new Blob([lines.join('\n')], {type:'text/plain'});
      var url=URL.createObjectURL(blob);
      var a=document.createElement('a'); a.href=url; a.download='cvd-accessibility-report.txt';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    }
    var exportBtn=document.getElementById('ctExport');
    if(exportBtn) exportBtn.addEventListener('click', function(){
      exportReport();
      if(window.TTE) TTE.set('ctoolExported', true);
    });

    /* ---------- upload-your-own-image simulator (client-side only, nothing leaves the browser) ---------- */
    var IMG_MAXDIM=480;
    /* 逐像素模拟也走 cvd.js。这里原本是站上第三份模拟实现——配色表
       一份、这个四宫格一份、图片检查再一份，四宫格和色块用的矩阵还
       不一样，于是同一张图"配色表里的色块"和"四宫格里的同一块颜色"
       会显示成两个颜色。 */
    function simulatePixel(r,g,b,type){ return CVD.simulate([r,g,b],type); }
    function simulateImageData(srcData){
      var out={};
      ['protan','deutan','tritan'].forEach(function(tp){
        var d=new ImageData(srcData.width, srcData.height);
        d.data.set(srcData.data);
        for(var i=0;i<d.data.length;i+=4){
          var rgb=simulatePixel(d.data[i], d.data[i+1], d.data[i+2], tp);
          d.data[i]=rgb[0]; d.data[i+1]=rgb[1]; d.data[i+2]=rgb[2];
        }
        out[tp]=d;
      });
      return out;
    }
    function renderImgGrid(srcData, sims, w, h){
      var grid=document.getElementById('ctImgGrid'); if(!grid) return;
      grid.innerHTML=''; grid.hidden=false;
      [
        {key:'true', ik:'ct.true', data:srcData},
        {key:'protan', ik:'ct.protan', data:sims.protan},
        {key:'deutan', ik:'ct.deutan', data:sims.deutan},
        {key:'tritan', ik:'ct.tritan', data:sims.tritan}
      ].forEach(function(p){
        var panel=document.createElement('div'); panel.className='ct-img-panel';
        var cv=document.createElement('canvas'); cv.width=w; cv.height=h;
        cv.getContext('2d').putImageData(p.data,0,0);
        var lbl=document.createElement('div'); lbl.className='ct-img-panel-lbl';
        var name=document.createElement('span'); name.setAttribute('data-i',p.ik); name.textContent=t(p.ik);
        var dl=document.createElement('a'); dl.className='ct-img-dl'; dl.setAttribute('data-i','ct.img.download'); dl.textContent=t('ct.img.download');
        dl.href=cv.toDataURL('image/png'); dl.download='cvd-'+p.key+'.png';
        lbl.appendChild(name); lbl.appendChild(dl);
        panel.appendChild(cv); panel.appendChild(lbl);
        grid.appendChild(panel);
      });
    }
    function loadImageFile(file){
      var reader=new FileReader();
      reader.onload=function(e){
        var img=new Image();
        img.onload=function(){
          var scale=Math.min(1, IMG_MAXDIM/Math.max(img.naturalWidth,img.naturalHeight));
          var w=Math.max(1,Math.round(img.naturalWidth*scale)), h=Math.max(1,Math.round(img.naturalHeight*scale));
          var srcCanvas=document.createElement('canvas'); srcCanvas.width=w; srcCanvas.height=h;
          var sctx=srcCanvas.getContext('2d'); sctx.drawImage(img,0,0,w,h);
          var srcData=sctx.getImageData(0,0,w,h);
          var sims=simulateImageData(srcData);
          renderImgGrid(srcData, sims, w, h);
        };
        img.src=e.target.result;
      };
      reader.readAsDataURL(file);
    }
    var imgInput=document.getElementById('ctImgInput');
    if(imgInput) imgInput.addEventListener('change', function(e){
      var f=e.target.files && e.target.files[0];
      if(f){ loadImageFile(f); if(window.TTE) TTE.set('imgAnalysed', true); }
    });

    render();
    window.__ctoolRerender=render; // re-run on language switch so ct.check.* text updates

    /* 把当前配色暴露给图片检查用。

       上面这张表是使用者亲手调出来的一套配色；下面检查真实设计时，
       如果不知道这套配色长什么样，就只能报"图里这两块颜色撞了"，
       而没法说"撞的是你配色里的第 2 号和第 4 号"。后者才是设计师
       真正需要的信息——他知道要回去改哪一个色值。 */
    window.__ctoolPalette = function(){ return palette.slice(); };
  })();
