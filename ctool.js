/* ============================================================
   ctool.js — 配色表 + 冲突检测 + 四宫格模拟

   这一段原样抽自主站 through-their-eyes 的 app.js（调色工具那个
   IIFE），只在外面补了这段说明。刻意不改动内部实现，方便日后与
   主站同步：主站改了，直接重抽一次覆盖即可。

   依赖：i18n.js 提供的全局 t()
   ============================================================ */

(function(){
    var rowsEl=document.getElementById('ctRows'); if(!rowsEl) return;
    var DEFAULT=['#D81B60','#1E88E5','#FFC107','#004D40'];
    var palette=DEFAULT.slice();

    /* 色彩计算全部走 cvd.js。这里原来自带一套 Machado 2009 矩阵，
       和图片检查那半边用的不是同一套——同一个颜色两边显示的模拟
       结果最大差到 ΔE 17。现在两边共用 Brettel 1997。 */
    var hex2rgb=CVD.hex2rgb, rgb2hex=CVD.rgb2hex;
    function simulate(hex,type){ return CVD.simulateHex(hex,type); }

    /* ---------- accessibility check: collision detection + suggested fix ---------- */
    var COLLIDE_DE=CVD.TH.SIM_DE_MAX;   // 只给 suggestFix 当搜索目标用
    var hex2lab=CVD.hex2lab, deltaE=CVD.deltaE;
    function hex2hsl(hex){
      var rgb=hex2rgb(hex).map(function(v){return v/255;});
      var max=Math.max.apply(null,rgb), min=Math.min.apply(null,rgb);
      var l=(max+min)/2, d=max-min, h=0, s=0;
      if(d!==0){
        s=d/(1-Math.abs(2*l-1));
        if(max===rgb[0]) h=60*(((rgb[1]-rgb[2])/d)%6);
        else if(max===rgb[1]) h=60*((rgb[2]-rgb[0])/d+2);
        else h=60*((rgb[0]-rgb[1])/d+4);
      }
      if(h<0) h+=360;
      return [h,s,l];
    }
    function hsl2hex(h,s,l){
      h=((h%360)+360)%360; s=Math.max(0,Math.min(1,s)); l=Math.max(0,Math.min(1,l));
      var c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2, rgb;
      if(h<60) rgb=[c,x,0]; else if(h<120) rgb=[x,c,0]; else if(h<180) rgb=[0,c,x];
      else if(h<240) rgb=[0,x,c]; else if(h<300) rgb=[x,0,c]; else rgb=[c,0,x];
      return rgb2hex(rgb.map(function(v){ return Math.round((v+m)*255); }));
    }
    /* 判据与图片检查共用 CVD.judgePair。

       原来这里只卡"模拟后总 ΔE < 12"，漏得很厉害：站上那个
       "Red / Green"预设按钮里的 #E41A1C / #4DAF4A，三种色觉下最小
       ΔE 是 21，永远够不到 12，于是配色表对着最经典的红绿撞色显示
       "没有发现冲突"。换成 judgePair 后它会被报成"只剩明度差"。

       judgePair 一对只出一条（把受影响的色觉类型合并进去），这里
       展开成每种类型一条，保持原来的渲染逻辑不变。 */
    function findCollisions(){
      var out=[];
      for(var i=0;i<palette.length;i++){
        for(var j=i+1;j<palette.length;j++){
          var la=CVD.hex2lab(palette[i]), lb=CVD.hex2lab(palette[j]);
          var sa=CVD.simLabs(CVD.hex2rgb(palette[i])), sb=CVD.simLabs(CVD.hex2rgb(palette[j]));
          var v=CVD.judgePair(la,lb,sa,sb);
          if(!v) continue;
          var ii=i, jj=j;
          v.detail.forEach(function(d){
            out.push({i:ii,j:jj,type:d.type,de:d.simDE,severity:v.severity});
          });
        }
      }
      return out;
    }
    // Heuristic search: rotate hue / shift lightness of colour B until it clears the
    // collision threshold under the given CVD type, while staying as close as possible
    // (true-colour ΔE) to the original B. Not a global optimum — a bounded grid search.
    function suggestFix(hexB,hexA,type){
      var hsl=hex2hsl(hexB);
      var labA=hex2lab(simulate(hexA,type));
      var labOrigB=hex2lab(hexB);
      var hueSteps=[0,20,-20,40,-40,60,-60,90,-90,120,-120,150,-150,180];
      var lSteps=[0,0.12,-0.12,0.22,-0.22,-0.32,0.32];
      var best=null, bestDist=Infinity;
      hueSteps.forEach(function(dh){
        lSteps.forEach(function(dl){
          var cand=hsl2hex(hsl[0]+dh, hsl[1], hsl[2]+dl);
          var deSim=deltaE(hex2lab(simulate(cand,type)),labA);
          if(deSim>=COLLIDE_DE+3){
            var deOrig=deltaE(hex2lab(cand),labOrigB);
            if(deOrig<bestDist){ bestDist=deOrig; best=cand; }
          }
        });
      });
      return best;
    }
    function renderCheck(){
      var el=document.getElementById('ctCheck'); if(!el) return;
      el.innerHTML='';
      /* 改一个颜色整张表会重画，结论也跟着变。没有 live region 的话
         读屏用户改完不会知道结果变了。 */
      el.setAttribute('role','status');
      el.setAttribute('aria-live','polite');
      el.setAttribute('aria-label',t('ct.a11y.results'));
      var collisions=findCollisions();
      if(collisions.length===0){
        var ok=document.createElement('div'); ok.className='ct-check-ok';
        ok.textContent=t('ct.check.ok');
        el.appendChild(ok);
        return;
      }
      var title=document.createElement('div'); title.className='ct-check-title'; title.textContent=t('ct.check.title');
      el.appendChild(title);
      collisions.forEach(function(c){
        var row=document.createElement('div'); row.className='ct-warn';
        var head=document.createElement('div'); head.className='ct-warn-head';
        var swA=document.createElement('span'); swA.className='sw'; swA.style.background=palette[c.i];
        var swB=document.createElement('span'); swB.className='sw'; swB.style.background=palette[c.j];
        var msg=t('ct.check.row')
          .replace('{a}', palette[c.i].toUpperCase())
          .replace('{b}', palette[c.j].toUpperCase())
          .replace('{type}', t('ct.'+c.type))
          .replace('{de}', c.de.toFixed(1));
        head.appendChild(swA); head.appendChild(swB);
        var txt=document.createElement('span'); txt.textContent=msg;
        head.appendChild(txt);
        row.appendChild(head);

        var fix=suggestFix(palette[c.j], palette[c.i], c.type);
        var fixRow=document.createElement('div'); fixRow.className='ct-warn-fix';
        if(fix){
          var swOld=document.createElement('span'); swOld.className='sw'; swOld.style.background=palette[c.j];
          var arrow=document.createElement('span'); arrow.textContent='→';
          var swNew=document.createElement('span'); swNew.className='sw'; swNew.style.background=fix;
          var suggestTxt=document.createElement('span');
          suggestTxt.textContent=t('ct.check.suggest').replace('{b}', palette[c.j].toUpperCase()).replace('{new}', fix.toUpperCase());
          var applyBtn=document.createElement('button'); applyBtn.className='ct-fixbtn'; applyBtn.textContent=t('ct.check.apply');
          (function(jIdx,newHex){
            applyBtn.addEventListener('click',function(){ palette[jIdx]=newHex; render(); });
          })(c.j, fix);
          fixRow.appendChild(swOld); fixRow.appendChild(arrow); fixRow.appendChild(swNew);
          fixRow.appendChild(suggestTxt); fixRow.appendChild(applyBtn);
        } else {
          var noFix=document.createElement('span'); noFix.textContent=t('ct.check.nofix');
          fixRow.appendChild(noFix);
        }
        row.appendChild(fixRow);
        el.appendChild(row);
      });
    }

    function render(){
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
        inp.addEventListener('input',function(){palette[idx]=inp.value;render();});
        swatchTrue.appendChild(inp);
        var code=document.createElement('span'); code.className='ct-code'; code.textContent=HEX;
        swatchTrue.appendChild(code);
        if(palette.length>2){
          var del=document.createElement('button'); del.className='ct-del'; del.innerHTML='&times;';
          del.type='button';
          /* title='remove' 既没本地化也不是可靠的可及名 */
          del.setAttribute('aria-label',fill(t('ct.a11y.remove'),{n:N,hex:HEX}));
          del.addEventListener('click',function(e){e.preventDefault();palette.splice(idx,1);render();});
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
          row.appendChild(c);
        });
        rowsEl.appendChild(row);
      });
      renderCheck();
    }
    document.getElementById('ctAdd').addEventListener('click',function(){
      if(palette.length>=8)return;
      palette.push('#'+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0')); render();
    });
    document.getElementById('ctReset').addEventListener('click',function(){palette=DEFAULT.slice();render();});
    document.querySelectorAll('.ct-preset').forEach(function(b){
      b.addEventListener('click',function(){palette=b.getAttribute('data-pal').split(',');render();});
    });

    /* ---------- export a plain-text accessibility report ---------- */
    function exportReport(){
      var lines=[];
      lines.push('Through Their Eyes — '+t('ct.check.title'));
      lines.push('');
      lines.push((LANG==='zh'?'配色：':'Palette: ')+palette.map(function(h){return h.toUpperCase();}).join(', '));
      lines.push('');
      var collisions=findCollisions();
      if(collisions.length===0){
        lines.push(t('ct.check.ok'));
      } else {
        collisions.forEach(function(c){
          lines.push('- '+t('ct.check.row')
            .replace('{a}', palette[c.i].toUpperCase())
            .replace('{b}', palette[c.j].toUpperCase())
            .replace('{type}', t('ct.'+c.type))
            .replace('{de}', c.de.toFixed(1)));
          var fix=suggestFix(palette[c.j], palette[c.i], c.type);
          lines.push('  '+(fix
            ? t('ct.check.suggest').replace('{b}', palette[c.j].toUpperCase()).replace('{new}', fix.toUpperCase())
            : t('ct.check.nofix')));
        });
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
