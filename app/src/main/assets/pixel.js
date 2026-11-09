import{createGameOverlay as $t,getGameTheme as jt,getGameAudioContext as qt,playGameSound as Ct}from"./extras.js";const f=100,D=100,St=500,at=1,Vt=8,kt=30,Pt=4,F=.15,Et=5,Kt=1.2,it=[[0,0,0],[29,43,83],[126,37,83],[0,135,81],[171,82,54],[95,87,79],[194,195,199],[255,241,232],[255,0,77],[255,163,0],[255,236,39],[0,228,54],[41,173,255],[131,118,156],[255,119,168],[255,204,170]];let i=null;function ot(s,p,y,b){return(b<<24|y<<16|p<<8|s)>>>0}function H(s,p,y){return s<p?p:s>y?y:s}function Jt(){if(document.getElementById("pixel-style"))return;const s=document.createElement("style");s.id="pixel-style",s.textContent=`
    .game-canvas-host.pixel-host {
      flex: 1 1 0 !important;
      min-width: 0 !important;
      min-height: 0 !important;
      max-width: none !important;
      height: 100% !important;
    }
    @media (orientation: landscape) {
      .game-canvas-host.pixel-host {
        flex: 0 0 auto !important;
      }
      .game-overlay.pixel-overlay {
        padding-left: max(6px, env(safe-area-inset-left, 0px)) !important;
        padding-right: max(6px, env(safe-area-inset-right, 0px)) !important;
      }
    }

    .pixel-wrap {
      display: flex;
      width: 100%;
      height: 100%;
      padding: 4px;
      box-sizing: border-box;
      overflow: hidden;
      gap: 4px;
      min-width: 0;
      min-height: 0;
    }
    .pixel-wrap.portrait {
      flex-direction: column;
      padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px));
    }
    .pixel-wrap.landscape { flex-direction: row; padding: 2px; }

    .pixel-sidebar {
      display: flex;
      flex-direction: column;
      gap: 3px;
      flex-shrink: 0;
      box-sizing: border-box;
    }
    .pixel-wrap.portrait  .pixel-sidebar { display: contents; }
    .pixel-wrap.landscape .pixel-sidebar { width: 96px; }

    .pixel-palette {
      display: grid;
      gap: 2px;
      padding: 3px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 3px;
      box-sizing: border-box;
    }
    .pixel-wrap.portrait .pixel-palette {
      order: 1;
      grid-template-columns: repeat(16, 1fr);
      width: 100%;
    }
    .pixel-wrap.landscape .pixel-palette {
      grid-template-columns: repeat(4, 1fr);
      width: 100%;
    }
    .pixel-palette button {
      width: 100%;
      aspect-ratio: 1;
      padding: 0;
      border: 2px solid var(--border);
      border-radius: 2px;
      cursor: pointer;
      box-sizing: border-box;
    }

    .pixel-canvas-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    .pixel-wrap.portrait  .pixel-canvas-wrap { order: 2; flex: 1; }
    .pixel-wrap.landscape .pixel-canvas-wrap { flex: 0 0 auto; }

    .pixel-canvas {
      display: block;
      image-rendering: pixelated;
      touch-action: none;
      cursor: crosshair;
      user-select: none;
      -webkit-user-select: none;
      border-radius: 2px;
      box-shadow: inset 0 0 0 2px var(--border);
      background: #ffffff;
    }

    .pixel-tools {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 4px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 3px;
      box-sizing: border-box;
    }
    .pixel-wrap.portrait  .pixel-tools { order: 3; width: 100%; }
    .pixel-wrap.landscape .pixel-tools { width: 100%; }

    .pixel-tools-row { display: flex; gap: 3px; width: 100%; }
    .pixel-wrap.portrait  .pixel-tools-row.pixel-buttons { flex-direction: row; }
    .pixel-wrap.landscape .pixel-tools-row.pixel-buttons { flex-direction: column; }

    .pixel-tools label {
      display: block;
      font-family: monospace;
      font-size: 10px;
      color: var(--text);
      white-space: nowrap;
      width: 100%;
    }
    .pixel-tools input[type=range] {
      width: 100%;
      accent-color: var(--accent);
      margin: 0;
      min-width: 0;
    }

    .pixel-btn {
      flex: 1;
      padding: 5px 4px;
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 3px;
      cursor: pointer;
      font-family: monospace;
      font-size: 10px;
      font-weight: bold;
      white-space: nowrap;
      min-width: 0;
      box-sizing: border-box;
    }
    .pixel-btn.active { background: var(--accent); color: var(--accent-txt); }
    .pixel-wrap.landscape .pixel-btn { flex: 0 0 auto; width: 100%; }
  `,document.head.appendChild(s)}export function startPixelGame(){if(i)return;document.activeElement&&typeof document.activeElement.blur=="function"&&document.activeElement.blur();try{qt()}catch{}Jt();const s=jt(),p=$t({onBack:stopPixelGame,onReset:Qt,resetLabel:"clear"});p.contentHost.classList.add("pixel-host"),p.overlay.classList.add("pixel-overlay"),p.leftSlot.style.display="none",p.rightSlot.style.display="none";const y=new Uint32Array(f*D),b=ot(255,255,255,255);y.fill(b);const U=document.createElement("canvas");U.width=f,U.height=D;const rt=U.getContext("2d"),st=rt.createImageData(f,D),Xt=new Uint32Array(st.data.buffer),x=document.createElement("canvas");x.className="pixel-canvas",x.width=100,x.height=100;const Q=x.getContext("2d",{alpha:!1});Q.fillStyle="#ffffff",Q.fillRect(0,0,100,100);const lt=document.createElement("canvas"),Mt=lt.getContext("2d"),ct=document.createElement("canvas"),Dt=ct.getContext("2d"),dt=document.createElement("canvas"),Yt=dt.getContext("2d"),pt=document.createElement("canvas"),Rt=pt.getContext("2d"),L=document.createElement("div");L.className="pixel-wrap portrait";const I=document.createElement("div");I.className="pixel-sidebar";const W=document.createElement("div");W.className="pixel-palette";const _=document.createElement("div");_.className="pixel-tools";const $=document.createElement("div");$.className="pixel-canvas-wrap",$.appendChild(x),I.appendChild(W),I.appendChild(_),L.appendChild(I),L.appendChild($),p.contentHost.appendChild(L);const ft=[];for(let t=0;t<16;t++){const[e,n,a]=it[t],o=document.createElement("button");o.type="button",o.style.background=`rgb(${e},${n},${a})`,o.addEventListener("click",l=>{l.preventDefault(),i&&ut(t)}),W.appendChild(o),ft.push(o)}const O=document.createElement("div");O.className="pixel-tools-row",O.style.flexDirection="column";const j=document.createElement("label");j.textContent="BRUSH 1";const C=document.createElement("input");C.type="range",C.min="1",C.max="16",C.value="1",C.addEventListener("input",()=>{i&&(i.brushSize=parseInt(C.value,10),j.textContent=`BRUSH ${C.value}`)}),O.appendChild(j),O.appendChild(C);const z=document.createElement("div");z.className="pixel-tools-row pixel-buttons";let q=!0;const P=document.createElement("button");P.type="button",P.className="pixel-btn active",P.textContent="AA",P.addEventListener("click",t=>{t.preventDefault(),q=!q,P.classList.toggle("active",q)});const Y=document.createElement("button");Y.type="button",Y.className="pixel-btn",Y.textContent="UNDO",Y.addEventListener("click",t=>{t.preventDefault(),i&&Bt()});let V=!1;const E=document.createElement("button");E.type="button",E.className="pixel-btn",E.textContent="GLITCH",E.addEventListener("click",t=>{t.preventDefault(),V=!V,E.classList.toggle("active",V),i&&(i.fxOn=V,v())}),z.appendChild(P),z.appendChild(Y),z.appendChild(E),_.appendChild(O),_.appendChild(z),i={overlay:p,theme:s,wrap:L,sidebar:I,palette:W,canvasWrap:$,tools:_,pixels:y,bgColor:b,dataCanvas:U,dataCtx:rt,imageData:st,imgBuf:Xt,displayCanvas:x,displayCtx:Q,fxCanvas:lt,fxCtx:Mt,redCanvas:ct,redCtx:Dt,greenCanvas:dt,greenCtx:Yt,blueCanvas:pt,blueCtx:Rt,swatches:ft,brushSlider:C,brushLabel:j,aaBtn:P,undoBtn:Y,fxBtn:E,brushSize:1,selectedColor:0,colorRGB:it[0].slice(),viewZoom:at,viewPanX:0,viewPanY:0,drawing:!1,strokeFirst:!0,strokeDistance:0,lastX:0,lastY:0,lastDirX:0,lastDirY:0,undoStack:[],strokeChanges:null,activePointers:new Map,pinchStartDist:0,pinchStartZoom:0,pinchStartMidX:0,pinchStartMidY:0,pinchStartPanX:0,pinchStartPanY:0,panning:!1,panStartX:0,panStartY:0,panStartPanX:0,panStartPanY:0,fxOn:!1,renderScheduled:!1,_keydown:null,_resize:null,_render:null,_scheduleRender:null},Object.defineProperty(i,"aa",{get:()=>q});function ut(t){const e=i;if(e){e.selectedColor=t,e.colorRGB=it[t].slice();for(let n=0;n<e.swatches.length;n++)e.swatches[n].style.borderColor=n===t?s.accent:s.border}}function v(){const t=i;!t||t.renderScheduled||(t.renderScheduled=!0,requestAnimationFrame(()=>{i&&(i.renderScheduled=!1,xt())}))}function ht(){const t=i;if(!t)return;const e=window.innerHeight>=window.innerWidth;t.wrap.className="pixel-wrap "+(e?"portrait":"landscape"),Lt()}function Lt(){const t=i;if(!t)return;const e=window.innerHeight>=window.innerWidth;let n;if(e){const o=t.canvasWrap.getBoundingClientRect();n=Math.min(o.width,o.height,St),t.overlay.contentHost.style.width=""}else{const o=window.innerHeight-20,l=window.innerWidth-250;n=Math.min(o,l,St);const r=108;t.overlay.contentHost.style.width=n+r+"px"}n=Math.max(40,Math.round(n));const a=Math.min(2,window.devicePixelRatio||1);t.displayCanvas.style.width=n+"px",t.displayCanvas.style.height=n+"px",t.displayCanvas.width=Math.round(n*a),t.displayCanvas.height=Math.round(n*a),t.displayCtx.fillStyle="#ffffff",t.displayCtx.fillRect(0,0,t.displayCanvas.width,t.displayCanvas.height),K(),v()}function K(){const t=i,e=f/t.viewZoom;t.viewPanX=H(t.viewPanX,0,f-e),t.viewPanY=H(t.viewPanY,0,D-e)}function xt(){const t=i;if(!t)return;const e=t.displayCanvas.width,n=t.displayCanvas.height;if(e===0||n===0)return;t.imgBuf.set(t.pixels),t.dataCtx.putImageData(t.imageData,0,0);const a=f/t.viewZoom,o=H(t.viewPanX,0,f-a),l=H(t.viewPanY,0,D-a),r=t.displayCtx;if(!(t.fxOn&&!t.drawing)){r.imageSmoothingEnabled=!1,r.fillStyle="#ffffff",r.fillRect(0,0,e,n),r.drawImage(t.dataCanvas,o,l,a,a,0,0,e,n);return}t.fxCanvas.width!==e&&(t.fxCanvas.width=e),t.fxCanvas.height!==n&&(t.fxCanvas.height=n);const u=t.fxCtx;u.imageSmoothingEnabled=!1,u.fillStyle="#000",u.fillRect(0,0,e,n),u.drawImage(t.dataCanvas,o,l,a,a,0,0,e,n),t.redCanvas.width!==e&&(t.redCanvas.width=e,t.greenCanvas.width=e,t.blueCanvas.width=e),t.redCanvas.height!==n&&(t.redCanvas.height=n,t.greenCanvas.height=n,t.blueCanvas.height=n);const c=t.redCtx;c.globalCompositeOperation="source-over",c.drawImage(t.fxCanvas,0,0),c.globalCompositeOperation="multiply",c.fillStyle="#ff0000",c.fillRect(0,0,e,n),c.globalCompositeOperation="source-over";const m=t.greenCtx;m.globalCompositeOperation="source-over",m.drawImage(t.fxCanvas,0,0),m.globalCompositeOperation="multiply",m.fillStyle="#00ff00",m.fillRect(0,0,e,n),m.globalCompositeOperation="source-over";const d=t.blueCtx;d.globalCompositeOperation="source-over",d.drawImage(t.fxCanvas,0,0),d.globalCompositeOperation="multiply",d.fillStyle="#0000ff",d.fillRect(0,0,e,n),d.globalCompositeOperation="source-over",r.imageSmoothingEnabled=!1,r.globalCompositeOperation="source-over",r.fillStyle="#000",r.fillRect(0,0,e,n);const h=Math.max(2,Math.round(e*.004));r.globalCompositeOperation="lighter",r.drawImage(t.redCanvas,h,0),r.drawImage(t.greenCanvas,0,0),r.drawImage(t.blueCanvas,-h,0),r.globalCompositeOperation="source-over";const A=3;r.globalAlpha=.14,r.fillStyle="#000";for(let w=0;w<n;w+=A)r.fillRect(0,w,e,1);r.globalAlpha=1;const R=e/2,X=n/2,B=Math.min(e,n)*.35,G=Math.max(e,n)*.75,g=r.createRadialGradient(R,X,B,R,X,G);g.addColorStop(0,"rgba(0,0,0,0)"),g.addColorStop(1,"rgba(0,0,0,0.55)"),r.fillStyle=g,r.fillRect(0,0,e,n)}i._render=xt,i._scheduleRender=v;function mt(t,e){const n=i,a=n.displayCanvas.getBoundingClientRect(),o=a.width>0?(t-a.left)/a.width:0,l=a.height>0?(e-a.top)/a.height:0,r=f/n.viewZoom;return{x:n.viewPanX+o*r,y:n.viewPanY+l*r}}function It(t,e,n,a){const o=i,l=o.brushSize*n;if(l<.4)return;const r=o.colorRGB[0],S=o.colorRGB[1],u=o.colorRGB[2],c=o.pixels;if(l<1.05){const g=Math.floor(t),w=Math.floor(e);if(g<0||g>=f||w<0||w>=D)return;const M=w*f+g,N=c[M],Z=ot(r,S,u,255);if(Z===N)return;a&&o.strokeChanges&&!o.strokeChanges.has(M)&&o.strokeChanges.set(M,N),c[M]=Z;return}const m=o.aa,d=l/2,h=m?d*.55:d,A=d*d,R=Math.max(0,Math.floor(t-d-1)),X=Math.min(f-1,Math.ceil(t+d+1)),B=Math.max(0,Math.floor(e-d-1)),G=Math.min(D-1,Math.ceil(e+d+1));for(let g=B;g<=G;g++)for(let w=R;w<=X;w++){const M=w+.5-t,N=g+.5-e,Z=M*M+N*N;if(Z>A)continue;const bt=Math.sqrt(Z);let k;if(bt<=h)k=1;else{const nt=(bt-h)/(d-h);k=1-nt*nt*(3-2*nt)}if(k<=.02)continue;const J=g*f+w,T=c[J],Zt=T&255,Tt=T>>>8&255,Ft=T>>>16&255,Ht=Math.round(Zt*(1-k)+r*k),Ut=Math.round(Tt*(1-k)+S*k),Wt=Math.round(Ft*(1-k)+u*k),yt=ot(Ht,Ut,Wt,255);yt!==T&&(a&&o.strokeChanges&&!o.strokeChanges.has(J)&&o.strokeChanges.set(J,T),c[J]=yt)}}function tt(t,e,n){It(t,e,n,!0)}function _t(){const t=i;t.strokeChanges=new Map,t.drawing=!0,t.strokeFirst=!0,t.strokeDistance=0}function vt(t,e){const n=i;if(n.strokeFirst){n.strokeFirst=!1,n.strokeDistance=0,n.lastX=t,n.lastY=e,n.lastDirX=0,n.lastDirY=0,tt(t,e,F);return}const a=t-n.lastX,o=e-n.lastY,l=Math.hypot(a,o);if(l<.001)return;n.lastDirX=a/l,n.lastDirY=o/l;const r=Math.max(.35,n.brushSize/6),S=Math.max(1,Math.ceil(l/r));for(let u=1;u<=S;u++){const c=u/S,m=n.lastX+a*c,d=n.lastY+o*c;n.strokeDistance+=l/S;let h=1;n.strokeDistance<Pt&&(h=F+(1-F)*(n.strokeDistance/Pt)),tt(m,d,h)}n.lastX=t,n.lastY=e}function Ot(){const t=i;if(!(!t.lastDirX&&!t.lastDirY)&&!(t.brushSize<=1))for(let e=1;e<=Et;e++){const n=e/(Et+1),a=F+(1-F)*(1-n)*.55,o=e*Kt;tt(t.lastX+t.lastDirX*o,t.lastY+t.lastDirY*o,a)}}function zt(){const t=i;if(!t)return;Ot();const e=t.strokeChanges;if(e&&e.size>0){const n=[],a=[];e.forEach((o,l)=>{n.push(l),a.push(o)}),t.undoStack.push({idxs:n,olds:a}),t.undoStack.length>kt&&t.undoStack.shift()}t.strokeChanges=null,t.drawing=!1,t.strokeFirst=!0,v()}function At(){const t=i;t.strokeChanges&&t.strokeChanges.forEach((e,n)=>{t.pixels[n]=e}),t.strokeChanges=null,t.drawing=!1,t.strokeFirst=!0,v()}function Bt(){const t=i,e=t.undoStack.pop();if(e){for(let n=0;n<e.idxs.length;n++)t.pixels[e.idxs[n]]=e.olds[n];v();try{Ct("click")}catch{}}}function Gt(t){const e=i;if(!e)return;try{x.setPointerCapture(t.pointerId)}catch{}if(e.activePointers.set(t.pointerId,{x:t.clientX,y:t.clientY}),e.activePointers.size===2){e.drawing&&At(),e.panning=!1;const a=Array.from(e.activePointers.values());e.pinchStartDist=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),e.pinchStartZoom=e.viewZoom,e.pinchStartMidX=(a[0].x+a[1].x)/2,e.pinchStartMidY=(a[0].y+a[1].y)/2,e.pinchStartPanX=e.viewPanX,e.pinchStartPanY=e.viewPanY;return}if(t.pointerType!=="touch"&&(t.button===1||t.button===2||t.shiftKey)){t.preventDefault(),e.panning=!0,e.panStartX=t.clientX,e.panStartY=t.clientY,e.panStartPanX=e.viewPanX,e.panStartPanY=e.viewPanY;return}t.preventDefault(),_t();const n=mt(t.clientX,t.clientY);vt(n.x,n.y),v()}function Nt(t){const e=i;if(!e||!e.activePointers.has(t.pointerId))return;if(e.activePointers.set(t.pointerId,{x:t.clientX,y:t.clientY}),e.activePointers.size===2){t.preventDefault();const a=Array.from(e.activePointers.values()),o=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),l=(a[0].x+a[1].x)/2,r=(a[0].y+a[1].y)/2;if(e.pinchStartDist<=0)return;const S=o/e.pinchStartDist,u=H(e.pinchStartZoom*S,at,Vt),c=e.displayCanvas.getBoundingClientRect(),m=c.width>0?(e.pinchStartMidX-c.left)/c.width:.5,d=c.height>0?(e.pinchStartMidY-c.top)/c.height:.5,h=f/e.pinchStartZoom,A=e.pinchStartPanX+m*h,R=e.pinchStartPanY+d*h;e.viewZoom=u;const X=f/u;e.viewPanX=A-m*X,e.viewPanY=R-d*X;const B=(l-e.pinchStartMidX)*h/(c.width||1),G=(r-e.pinchStartMidY)*h/(c.height||1);e.viewPanX-=B,e.viewPanY-=G,K(),v();return}if(e.panning){t.preventDefault();const a=e.displayCanvas.getBoundingClientRect(),o=f/e.viewZoom,l=a.width>0?o/a.width:0;e.viewPanX=e.panStartPanX-(t.clientX-e.panStartX)*l,e.viewPanY=e.panStartPanY-(t.clientY-e.panStartY)*l,K(),v();return}if(!e.drawing)return;t.preventDefault();const n=mt(t.clientX,t.clientY);vt(n.x,n.y),v()}function gt(t){const e=i;if(e){e.activePointers.delete(t.pointerId),e.activePointers.size===0&&(e.drawing&&zt(),e.panning=!1);try{x.releasePointerCapture(t.pointerId)}catch{}}}x.addEventListener("pointerdown",Gt),x.addEventListener("pointermove",Nt),x.addEventListener("pointerup",gt),x.addEventListener("pointercancel",gt),x.addEventListener("contextmenu",t=>t.preventDefault());function wt(t){const e=i;if(!e||e.viewZoom<=at)return;let n=0,a=0;if(t.key==="ArrowLeft")n=-1;else if(t.key==="ArrowRight")n=1;else if(t.key==="ArrowUp")a=-1;else if(t.key==="ArrowDown")a=1;else return;t.preventDefault(),e.viewPanX+=n,e.viewPanY+=a,K(),v()}window.addEventListener("keydown",wt),i._keydown=wt;function et(){i&&ht()}window.addEventListener("resize",et),window.addEventListener("orientationchange",et),i._resize=et,ut(0),ht(),v()}function Qt(){if(!i)return;const s=i,p=[],y=[];for(let b=0;b<s.pixels.length;b++)s.pixels[b]!==s.bgColor&&(p.push(b),y.push(s.pixels[b]));if(p.length!==0){s.pixels.fill(s.bgColor),s.undoStack.push({idxs:p,olds:y}),s.undoStack.length>kt&&s.undoStack.shift(),s.imgBuf.set(s.pixels),s.dataCtx.putImageData(s.imageData,0,0),s._render&&s._render();try{Ct("click")}catch{}}}export function stopPixelGame(){i&&(i._keydown&&window.removeEventListener("keydown",i._keydown),i._resize&&(window.removeEventListener("resize",i._resize),window.removeEventListener("orientationchange",i._resize)),i.overlay.remove(),i=null)}
