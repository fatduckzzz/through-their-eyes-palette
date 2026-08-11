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

    // sRGB <-> linear
    function s2l(c){c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
    function l2s(c){c=c<=0.0031308?c*12.92:1.055*Math.pow(c,1/2.4)-0.055;return Math.max(0,Math.min(255,Math.round(c*255)));}
    function hex2rgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(function(x){return x+x;}).join('');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
    function rgb2hex(r){return '#'+r.map(function(v){return ('0'+v.toString(16)).slice(-2);}).join('');}
    // Brettel/Viénot-style simulation matrices (linear RGB) for dichromacy
    var M={
      protan:[[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
      deutan:[[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
      tritan:[[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147610],[0.004733,0.691367,0.303900]]
    };
    function simulate(hex,type){
      var rgb=hex2rgb(hex); var lin=[s2l(rgb[0]),s2l(rgb[1]),s2l(rgb[2])]; var m=M[type];
      var out=[0,1,2].map(function(i){return m[i][0]*lin[0]+m[i][1]*lin[1]+m[i][2]*lin[2];});
      return rgb2hex([l2s(out[0]),l2s(out[1]),l2s(out[2])]);
    }

    /* ---------- accessibility check: collision detection + suggested fix ---------- */
    var COLLIDE_DE=12; // CIE76 ΔE below this = "hard to tell apart" in the simulated view
    function rgb2xyz(rgb){
      var lin=[s2l(rgb[0]),s2l(rgb[1]),s2l(rgb[2])];
      return [
        lin[0]*0.4124+lin[1]*0.3576+lin[2]*0.1805,
        lin[0]*0.2126+lin[1]*0.7152+lin[2]*0.0722,
        lin[0]*0.0193+lin[1]*0.1192+lin[2]*0.9505
      ];
    }
    function xyz2lab(xyz){
      var ref=[0.95047,1.0,1.08883];
      var f=xyz.map(function(v,i){ v=v/ref[i]; return v>0.008856?Math.pow(v,1/3):(7.787*v+16/116); });
      return [116*f[1]-16, 500*(f[0]-f[1]), 200*(f[1]-f[2])];
    }
    function hex2lab(hex){ return xyz2lab(rgb2xyz(hex2rgb(hex))); }
    function deltaE(lab1,lab2){
      var dl=lab1[0]-lab2[0], da=lab1[1]-lab2[1], db=lab1[2]-lab2[2];
      return Math.sqrt(dl*dl+da*da+db*db);
    }
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
    function findCollisions(){
      var out=[];
      for(var i=0;i<palette.length;i++){
        for(var j=i+1;j<palette.length;j++){
          ['protan','deutan','tritan'].forEach(function(tp){
            var de=deltaE(hex2lab(simulate(palette[i],tp)), hex2lab(simulate(palette[j],tp)));
            if(de<COLLIDE_DE) out.push({i:i,j:j,type:tp,de:de});
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
        var row=document.createElement('div'); row.className='ct-row';
        var swatchTrue=document.createElement('label'); swatchTrue.className='ct-cell ct-pick';
        swatchTrue.style.background=hex;
        var inp=document.createElement('input'); inp.type='color'; inp.value=hex;
        inp.addEventListener('input',function(){palette[idx]=inp.value;render();});
        swatchTrue.appendChild(inp);
        var code=document.createElement('span'); code.className='ct-code'; code.textContent=hex.toUpperCase();
        swatchTrue.appendChild(code);
        if(palette.length>2){
          var del=document.createElement('button'); del.className='ct-del'; del.innerHTML='&times;'; del.title='remove';
          del.addEventListener('click',function(e){e.preventDefault();palette.splice(idx,1);render();});
          swatchTrue.appendChild(del);
        }
        row.appendChild(swatchTrue);
        ['protan','deutan','tritan'].forEach(function(tp){
          var c=document.createElement('div'); c.className='ct-cell'; c.style.background=simulate(hex,tp);
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
    var S2L_LUT=(function(){ var a=new Float64Array(256); for(var i=0;i<256;i++) a[i]=s2l(i); return a; })();
    function simulatePixel(r,g,b,type){
      var m=M[type];
      var lin=[S2L_LUT[r],S2L_LUT[g],S2L_LUT[b]];
      return [
        l2s(m[0][0]*lin[0]+m[0][1]*lin[1]+m[0][2]*lin[2]),
        l2s(m[1][0]*lin[0]+m[1][1]*lin[1]+m[1][2]*lin[2]),
        l2s(m[2][0]*lin[0]+m[2][1]*lin[1]+m[2][2]*lin[2])
      ];
    }
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
  })();
