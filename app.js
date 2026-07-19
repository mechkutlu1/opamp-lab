'use strict';
/* =======================================================================
   AnalogLab — op-amp & analog electronics teaching engine
   ======================================================================= */

/* ---------- number formatting ---------- */
const fmtR = ohm => {            // ohm value -> "4.7 kΩ"
  if(ohm>=1e6) return (ohm/1e6).toFixed(ohm%1e6?2:0).replace(/\.?0+$/,'')+' MΩ';
  if(ohm>=1e3) return (ohm/1e3).toFixed(ohm%1e3?1:0).replace(/\.?0+$/,'')+' kΩ';
  return Math.round(ohm)+' Ω';
};
const fmtC = f => {              // farads -> "10 nF"
  if(f>=1e-6) return (f*1e6).toFixed(2).replace(/\.?0+$/,'')+' µF';
  if(f>=1e-9) return (f*1e9).toFixed(1).replace(/\.?0+$/,'')+' nF';
  return (f*1e12).toFixed(0)+' pF';
};
const fmtF = hz => hz>=1000 ? (hz/1000).toFixed(hz%1000?2:0).replace(/\.?0+$/,'')+' kHz' : Math.round(hz)+' Hz';
const fmtV = v => (Math.abs(v)<10?v.toFixed(2):v.toFixed(1))+' V';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

/* ---------- input signal ---------- */
function sigVal(P,t){
  const A=P.Vpp/2, ph=2*Math.PI*P.freq*t;
  if(P.wave==='square')   return A*(Math.sin(ph)>=0?1:-1);
  if(P.wave==='triangle') return A*(2/Math.PI)*Math.asin(Math.sin(ph));
  return A*Math.sin(ph);                                  // sine
}

/* ---------- time-domain simulation ---------- */
// Returns {t[],vin[],vout[], tms[]} for a couple of periods.
function simulate(topic,P){
  const N=700, periods=2.5, Tt=periods/P.freq, dt=Tt/N;
  const t=new Array(N), vin=new Array(N), vout=new Array(N);
  const Vs=P.Vsat;
  const kind=topic.kind;

  if(kind==='integrator'||kind==='filter'){
    // integrate ODE with sub-steps for accuracy
    const sub=8, h=dt/sub;
    let vo=0;
    // warm-up one period so we show steady-state (esp. filter)
    let wu=0; const wuN=Math.round(N/periods)*sub;
    const G = topic.dcGain ? topic.dcGain(P) : 0;   // signed DC gain (filter only)
    const tau = topic.tau(P);
    if(kind==='filter'){
      for(let k=0;k<wuN;k++){const tt=-((wuN-k)*h); const vi=sigVal(P,tt);
        vo += ((G*vi - vo)/tau)*h; }
    }
    let acc=vo;
    for(let i=0;i<N;i++){
      const tt=i*dt; t[i]=tt; vin[i]=sigVal(P,tt);
      for(let s=0;s<sub;s++){
        const ts=tt+s*h; const vi=sigVal(P,ts);
        if(kind==='filter') acc += ((G*vi - acc)/tau)*h;
        else                acc += (-(vi)/tau)*h;             // ideal integrator: dVo/dt=-Vin/(R1C)
      }
      vout[i]=clamp(acc,-Vs,Vs);
    }
    if(kind==='integrator'){ // remove DC drift for display (practical integrator has Rf)
      let m=0; for(const v of vout) m+=v; m/=N;
      for(let i=0;i<N;i++) vout[i]=clamp(vout[i]-m,-Vs,Vs);
    }
  } else if(kind==='differentiator'){
    const RC=topic.tau(P);
    for(let i=0;i<N;i++){const tt=i*dt; t[i]=tt; vin[i]=sigVal(P,tt);
      const d=(sigVal(P,tt+dt*0.5)-sigVal(P,tt-dt*0.5))/dt;
      vout[i]=clamp(-RC*d,-Vs,Vs);}
  } else if(kind==='comparator'){
    for(let i=0;i<N;i++){const tt=i*dt; t[i]=tt; vin[i]=sigVal(P,tt);
      vout[i]= vin[i]>P.Vref ? Vs : -Vs;}
  } else if(kind==='schmitt'){
    const VT=Vs*P.R1/(P.R1+P.R2);           // ±trip points
    let state=1;
    for(let i=0;i<N;i++){const tt=i*dt; t[i]=tt; vin[i]=sigVal(P,tt);
      if(state>0 && vin[i]<-VT) state=-1;
      else if(state<0 && vin[i]> VT) state=1;
      vout[i]= state>0 ? Vs : -Vs;}
  } else {                                    // static gain (inverting, non-inv, buffer, sum, diff)
    for(let i=0;i<N;i++){const tt=i*dt; t[i]=tt; vin[i]=sigVal(P,tt);
      vout[i]=clamp(topic.vout(vin[i],P,tt),-Vs,Vs);}
  }
  const tms=t.map(x=>x*1000);
  return {t,vin,vout,tms};
}

/* =======================================================================
   PLOTTING  (crisp, DPR-aware, proper axes)
   ======================================================================= */
function setup(cv,cssH){
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const w=cv.clientWidth||cv.parentElement.clientWidth-16;
  cv.width=w*dpr; cv.height=cssH*dpr;
  cv.style.height=cssH+'px';
  const c=cv.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0);
  return {c,w,h:cssH};
}

// Oscilloscope: CRT graticule + traces
function drawScope(cv,S,P){
  const {c,w,h}=setup(cv,300);
  c.clearRect(0,0,w,h);
  const m={l:34,r:10,t:10,b:24};
  const gw=w-m.l-m.r, gh=h-m.t-m.b;
  // volts/div auto
  const peak=Math.max(P.Vsat, ...S.vout.map(Math.abs), ...S.vin.map(Math.abs))*1.05;
  const divsY=4;                                   // ± 4 divisions
  const vdiv=niceStep(peak/divsY);
  const yspan=vdiv*divsY;
  const tspan=S.tms[S.tms.length-1];
  const divsX=5, tdiv=tspan/divsX;
  const X=t=>m.l+(t/tspan)*gw;
  const Y=v=>m.t+gh/2-(v/yspan)*gh/2;
  // graticule
  c.fillStyle='#08140f'; c.fillRect(m.l,m.t,gw,gh);
  c.lineWidth=1;
  c.strokeStyle=getCSS('--scope-grid');
  for(let i=0;i<=divsX;i++){const x=m.l+i/divsX*gw;c.beginPath();c.moveTo(x,m.t);c.lineTo(x,m.t+gh);c.stroke();}
  for(let i=0;i<=divsY*2;i++){const y=m.t+i/(divsY*2)*gh;c.beginPath();c.moveTo(m.l,y);c.lineTo(m.l+gw,y);c.stroke();}
  // center axes
  c.strokeStyle=getCSS('--scope-axis'); c.lineWidth=1.3;
  c.beginPath();c.moveTo(m.l,Y(0));c.lineTo(m.l+gw,Y(0));c.stroke();
  // rails
  c.strokeStyle=getCSS('--sat'); c.setLineDash([4,4]); c.lineWidth=1.2; c.globalAlpha=.8;
  [P.Vsat,-P.Vsat].forEach(r=>{if(Math.abs(r)<=yspan){c.beginPath();c.moveTo(m.l,Y(r));c.lineTo(m.l+gw,Y(r));c.stroke();}});
  c.setLineDash([]); c.globalAlpha=1;
  // ticks / labels
  c.fillStyle=getCSS('--muted'); c.font='10px "IBM Plex Mono"';
  c.textAlign='right'; c.textBaseline='middle';
  for(let i=-divsY;i<=divsY;i++){const v=i*vdiv;c.fillText(v.toFixed(vdiv<1?1:0),m.l-4,Y(v));}
  c.textAlign='center'; c.textBaseline='top';
  for(let i=0;i<=divsX;i++){const tv=i*tdiv;c.fillText(tv.toFixed(tdiv<1?2:1),m.l+i/divsX*gw,m.t+gh+5);}
  c.fillStyle=getCSS('--dim'); c.textAlign='right';
  c.fillText('ms',m.l+gw,m.t+gh+13);
  c.save();c.translate(11,m.t+gh/2);c.rotate(-Math.PI/2);c.textAlign='center';c.fillText('volts',0,0);c.restore();
  // vdiv readout
  c.textAlign='left';c.fillStyle=getCSS('--dim');
  c.fillText(vdiv+' V/div',m.l+3,m.t+3);
  // traces
  trace(c,S.tms,S.vin,X,Y,getCSS('--in'),2,true);
  trace(c,S.tms,S.vout,X,Y,getCSS('--out'),2.4,true);
}
function trace(c,xs,ys,X,Y,color,wd,glow){
  c.strokeStyle=color;c.lineWidth=wd;c.lineJoin='round';
  if(glow){c.shadowColor=color;c.shadowBlur=6;}
  c.beginPath();
  for(let i=0;i<xs.length;i++){const x=X(xs[i]),y=Y(ys[i]);i?c.lineTo(x,y):c.moveTo(x,y);}
  c.stroke();c.shadowBlur=0;
}

// Transfer characteristic Vout vs Vin
function drawTransfer(cv,topic,P){
  const {c,w,h}=setup(cv,300);
  c.clearRect(0,0,w,h);
  const m={l:40,r:12,t:12,b:30};
  const gw=w-m.l-m.r, gh=h-m.t-m.b;
  const G=topic.staticGain?topic.staticGain(P):1;
  const xr=Math.max(P.Vpp/2*1.3, P.Vsat/Math.max(0.2,Math.abs(G))*1.3, 0.5);
  const yr=P.Vsat*1.15;
  const X=v=>m.l+(v+xr)/(2*xr)*gw, Y=v=>m.t+gh-(v+yr)/(2*yr)*gh;
  axes(c,m,gw,gh,-xr,xr,-yr,yr,'Vin (V)','Vout (V)');
  // build transfer
  let xs=[],ys=[];
  if(topic.kind==='comparator'){
    for(let i=0;i<=400;i++){const vi=-xr+2*xr*i/400;xs.push(vi);ys.push(vi>P.Vref?P.Vsat:-P.Vsat);}
    hline(c,m,gw,X,Y,P.Vref,'x',getCSS('--accent'),'Vref');
    plotLine(c,xs,ys,X,Y,getCSS('--out'),2.4);
  } else if(topic.kind==='schmitt'){
    const VT=P.Vsat*P.R1/(P.R1+P.R2);
    // up sweep
    let up=[],uy=[],st=-1;
    for(let i=0;i<=400;i++){const vi=-xr+2*xr*i/400; if(st<0&&vi>VT)st=1; up.push(vi);uy.push(st>0?P.Vsat:-P.Vsat);}
    let dn=[],dy=[];st=1;
    for(let i=0;i<=400;i++){const vi=xr-2*xr*i/400; if(st>0&&vi<-VT)st=-1; dn.push(vi);dy.push(st>0?P.Vsat:-P.Vsat);}
    plotLine(c,up,uy,X,Y,getCSS('--out'),2.4);
    plotLine(c,dn,dy,X,Y,getCSS('--in'),2.4);
    vline(c,m,gh,X,Y,VT,getCSS('--muted'));vline(c,m,gh,X,Y,-VT,getCSS('--muted'));
    c.fillStyle=getCSS('--muted');c.font='10px "IBM Plex Mono"';c.textAlign='center';
    c.fillText('+VT',X(VT),m.t+10);c.fillText('−VT',X(-VT),m.t+10);
  } else {
    for(let i=0;i<=400;i++){const vi=-xr+2*xr*i/400;xs.push(vi);ys.push(clamp(G*vi,-P.Vsat,P.Vsat));}
    // ideal (unclipped) reference
    plotLine(c,[-xr,xr],[-G*xr,G*xr],X,Y,'rgba(255,255,255,.12)',1.4);
    plotLine(c,xs,ys,X,Y,getCSS('--out'),2.4);
    // slope label
    c.fillStyle=getCSS('--out');c.font='11px "IBM Plex Mono"';c.textAlign='left';
    c.fillText('slope = gain = '+ (G>=0?'':'−')+Math.abs(G).toFixed(2), m.l+6, m.t+14);
  }
  // rails
  c.strokeStyle=getCSS('--sat');c.setLineDash([4,4]);c.globalAlpha=.7;
  [P.Vsat,-P.Vsat].forEach(r=>{c.beginPath();c.moveTo(m.l,Y(r));c.lineTo(m.l+gw,Y(r));c.stroke();});
  c.setLineDash([]);c.globalAlpha=1;
}

// Bode plot: magnitude (dB) + phase (deg) vs log f
function drawBode(cv,topic,P){
  const {c,w,h}=setup(cv,300);
  c.clearRect(0,0,w,h);
  const m={l:42,r:44,t:14,b:32};
  const gw=w-m.l-m.r, gh=h-m.t-m.b;
  const f0=1, f1=1e6;
  const B=topic.bode(P);                       // {mag:[dB], phase:[deg], fc, gain0dB}
  const magMax=Math.ceil((B.gain0dB+10)/20)*20, magMin=magMax-120;
  const X=f=>m.l+(Math.log10(f)-Math.log10(f0))/(Math.log10(f1)-Math.log10(f0))*gw;
  const Ym=db=>m.t+gh-(db-magMin)/(magMax-magMin)*gh;
  const Yp=d=>m.t+gh-(d+180)/360*gh;
  // grid: decades
  c.fillStyle='#08140f';c.fillRect(m.l,m.t,gw,gh);
  c.strokeStyle=getCSS('--scope-grid');c.lineWidth=1;
  for(let e=0;e<=6;e++){const x=X(Math.pow(10,e));c.beginPath();c.moveTo(x,m.t);c.lineTo(x,m.t+gh);c.stroke();
    for(let k=2;k<10;k++){const xx=X(k*Math.pow(10,e));if(xx<m.l+gw){c.globalAlpha=.4;c.beginPath();c.moveTo(xx,m.t);c.lineTo(xx,m.t+gh);c.stroke();c.globalAlpha=1;}}}
  for(let db=magMin;db<=magMax;db+=20){const y=Ym(db);c.beginPath();c.moveTo(m.l,y);c.lineTo(m.l+gw,y);c.stroke();}
  // axis labels
  c.fillStyle=getCSS('--muted');c.font='10px "IBM Plex Mono"';c.textAlign='center';c.textBaseline='top';
  ['1','10','100','1k','10k','100k','1M'].forEach((lb,e)=>c.fillText(lb,X(Math.pow(10,e)),m.t+gh+5));
  c.fillStyle=getCSS('--dim');c.fillText('frequency (Hz)',m.l+gw/2,m.t+gh+16);
  c.textAlign='right';c.textBaseline='middle';c.fillStyle=getCSS('--out');
  for(let db=magMin;db<=magMax;db+=20)c.fillText(db+'',m.l-4,Ym(db));
  c.textAlign='left';c.fillStyle=getCSS('--in');
  for(let d=-180;d<=180;d+=90)c.fillText(d+'°',m.l+gw+4,Yp(d));
  c.save();c.translate(12,m.t+gh/2);c.rotate(-Math.PI/2);c.textAlign='center';c.fillStyle=getCSS('--out');c.fillText('gain (dB)',0,0);c.restore();
  c.save();c.translate(w-8,m.t+gh/2);c.rotate(Math.PI/2);c.textAlign='center';c.fillStyle=getCSS('--in');c.fillText('phase (°)',0,0);c.restore();
  // cutoff marker
  if(B.fc && B.fc>f0 && B.fc<f1){const x=X(B.fc);
    c.strokeStyle=getCSS('--accent');c.setLineDash([5,4]);c.lineWidth=1.3;
    c.beginPath();c.moveTo(x,m.t);c.lineTo(x,m.t+gh);c.stroke();c.setLineDash([]);
    c.fillStyle=getCSS('--accent');c.font='10px "IBM Plex Mono"';c.textAlign='center';c.textBaseline='bottom';
    c.fillText('fc='+fmtF(B.fc),x,m.t+gh-4);}
  // phase (amber, dashed) then magnitude (green)
  const fs=B.fs;
  c.strokeStyle=getCSS('--in');c.lineWidth=1.6;c.setLineDash([5,3]);c.beginPath();
  fs.forEach((f,i)=>{const x=X(f),y=Yp(B.phase[i]);i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();c.setLineDash([]);
  c.strokeStyle=getCSS('--out');c.lineWidth=2.4;c.shadowColor=getCSS('--out');c.shadowBlur=5;c.beginPath();
  fs.forEach((f,i)=>{const x=X(f),y=Ym(B.mag[i]);i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();c.shadowBlur=0;
}

/* ---- plot helpers ---- */
function niceStep(x){const p=Math.pow(10,Math.floor(Math.log10(x)));const n=x/p;return (n<=1?1:n<=2?2:n<=5?5:10)*p;}
function getCSS(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim()||'#888';}
function axes(c,m,gw,gh,xmin,xmax,ymin,ymax,xl,yl){
  const X=v=>m.l+(v-xmin)/(xmax-xmin)*gw, Y=v=>m.t+gh-(v-ymin)/(ymax-ymin)*gh;
  c.fillStyle='#08140f';c.fillRect(m.l,m.t,gw,gh);
  c.strokeStyle=getCSS('--scope-grid');c.lineWidth=1;
  const sx=niceStep((xmax-xmin)/6);
  for(let v=Math.ceil(xmin/sx)*sx;v<=xmax;v+=sx){const x=X(v);c.beginPath();c.moveTo(x,m.t);c.lineTo(x,m.t+gh);c.stroke();}
  const sy=niceStep((ymax-ymin)/6);
  for(let v=Math.ceil(ymin/sy)*sy;v<=ymax;v+=sy){const y=Y(v);c.beginPath();c.moveTo(m.l,y);c.lineTo(m.l+gw,y);c.stroke();}
  c.strokeStyle=getCSS('--scope-axis');c.lineWidth=1.3;
  c.beginPath();c.moveTo(m.l,Y(0));c.lineTo(m.l+gw,Y(0));c.stroke();
  c.beginPath();c.moveTo(X(0),m.t);c.lineTo(X(0),m.t+gh);c.stroke();
  c.fillStyle=getCSS('--muted');c.font='10px "IBM Plex Mono"';
  c.textAlign='center';c.textBaseline='top';
  for(let v=Math.ceil(xmin/sx)*sx;v<=xmax;v+=sx){if(Math.abs(v)>1e-9)c.fillText((+v.toFixed(2))+'',X(v),m.t+gh+4);}
  c.textAlign='right';c.textBaseline='middle';
  for(let v=Math.ceil(ymin/sy)*sy;v<=ymax;v+=sy){if(Math.abs(v)>1e-9)c.fillText((+v.toFixed(1))+'',m.l-4,Y(v));}
  c.fillStyle=getCSS('--dim');c.textAlign='right';c.textBaseline='top';c.fillText(xl,m.l+gw,m.t+gh+13);
  c.save();c.translate(11,m.t+gh/2);c.rotate(-Math.PI/2);c.textAlign='center';c.fillText(yl,0,0);c.restore();
}
function plotLine(c,xs,ys,X,Y,color,wd){c.strokeStyle=color;c.lineWidth=wd;c.lineJoin='round';c.beginPath();
  for(let i=0;i<xs.length;i++){const x=X(xs[i]),y=Y(ys[i]);i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}
function vline(c,m,gh,X,Y,xv,color){c.strokeStyle=color;c.setLineDash([4,3]);c.lineWidth=1;c.beginPath();c.moveTo(X(xv),m.t);c.lineTo(X(xv),m.t+gh);c.stroke();c.setLineDash([]);}
function hline(c,m,gw,X,Y,yv,color,lb){c.strokeStyle=color;c.setLineDash([4,3]);c.lineWidth=1;c.beginPath();c.moveTo(m.l,Y(yv));c.lineTo(m.l+gw,Y(yv));c.stroke();c.setLineDash([]);}

/* =======================================================================
   SCHEMATICS  (IEC rectangle resistors)
   ======================================================================= */
const SW='var(--sch)';
const W=(pts)=>`<polyline points="${pts}" fill="none" stroke="${SW}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
const DOT=(x,y)=>`<circle cx="${x}" cy="${y}" r="3" fill="${SW}"/>`;
const NODE=(x,y,t,dx=6,dy=-7)=>`<text x="${x+dx}" y="${y+dy}" fill="var(--node)" font-family="IBM Plex Mono" font-size="12" font-weight="600">${t}</text>`;
const RH=(x,y,l)=>`<rect x="${x-21}" y="${y-8}" width="42" height="16" rx="2" fill="var(--panel2)" stroke="${SW}" stroke-width="1.7"/><text x="${x}" y="${y-12}" fill="var(--text)" font-family="IBM Plex Mono" font-size="11.5" text-anchor="middle">${l}</text>`;
const RV=(x,y,l)=>`<rect x="${x-8}" y="${y-21}" width="16" height="42" rx="2" fill="var(--panel2)" stroke="${SW}" stroke-width="1.7"/><text x="${x+13}" y="${y+4}" fill="var(--text)" font-family="IBM Plex Mono" font-size="11.5">${l}</text>`;
const CAPV=(x,y,l)=>`<line x1="${x-11}" y1="${y}" x2="${x+11}" y2="${y}" stroke="${SW}" stroke-width="2.4"/><line x1="${x-11}" y1="${y+7}" x2="${x+11}" y2="${y+7}" stroke="${SW}" stroke-width="2.4"/><text x="${x+15}" y="${y+7}" fill="var(--text)" font-family="IBM Plex Mono" font-size="11.5">${l}</text>`;
const CAPH=(x,y,l)=>`<line x1="${x}" y1="${y-11}" x2="${x}" y2="${y+11}" stroke="${SW}" stroke-width="2.4"/><line x1="${x+7}" y1="${y-11}" x2="${x+7}" y2="${y+11}" stroke="${SW}" stroke-width="2.4"/><text x="${x+3.5}" y="${y-15}" fill="var(--text)" font-family="IBM Plex Mono" font-size="11.5" text-anchor="middle">${l}</text>`;
const GND=(x,y)=>`${W(`${x},${y} ${x},${y+10}`)}<line x1="${x-9}" y1="${y+10}" x2="${x+9}" y2="${y+10}" stroke="${SW}" stroke-width="2"/><line x1="${x-5.5}" y1="${y+14}" x2="${x+5.5}" y2="${y+14}" stroke="${SW}" stroke-width="2"/><line x1="${x-2.5}" y1="${y+18}" x2="${x+2.5}" y2="${y+18}" stroke="${SW}" stroke-width="2"/>`;
// op-amp triangle; inputs at (cx,cy-16)&(cx,cy+16), output (cx+62,cy)
function OP(cx,cy,swap){
  const minusY=swap?cy+16:cy-16, plusY=swap?cy-16:cy+16;
  return `<polygon points="${cx},${cy-34} ${cx},${cy+34} ${cx+62},${cy}" fill="var(--panel3)" stroke="${SW}" stroke-width="2"/>`
    +`<line x1="${cx+7}" y1="${minusY}" x2="${cx+17}" y2="${minusY}" stroke="var(--text)" stroke-width="1.8"/>`
    +`<line x1="${cx+7}" y1="${plusY}" x2="${cx+17}" y2="${plusY}" stroke="var(--text)" stroke-width="1.8"/>`
    +`<line x1="${cx+12}" y1="${plusY-5}" x2="${cx+12}" y2="${plusY+5}" stroke="var(--text)" stroke-width="1.8"/>`;
}
const SVG=(inner,vb='0 0 460 240')=>`<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans">${inner}</svg>`;
const VIN=(x,y,t='Vin')=>`${DOT(x,y)}<text x="${x-8}" y="${y+4}" fill="var(--node)" font-family="IBM Plex Mono" font-size="12" font-weight="600" text-anchor="end">${t}</text>`;
const VOUT=(x,y)=>`${DOT(x,y)}<text x="${x+8}" y="${y+4}" fill="var(--node)" font-family="IBM Plex Mono" font-size="12" font-weight="600">Vout</text>`;

/* ---- individual circuits ---- */
function scInverting(){const cx=250,cy=130;return SVG(
  VIN(40,cy-24)+W(`40,${cy-24} 70,${cy-24}`)+RH(96,cy-24,'R1')+W(`122,${cy-24} 175,${cy-24} 175,${cy-16} ${cx},${cy-16}`)
  +DOT(175,cy-24)+W(`175,${cy-24} 175,60`)+RH(230,60,'Rf')+W(`204,60 175,60`)+W(`256,60 320,60 320,${cy}`)
  +OP(cx,cy)+W(`${cx+62},${cy} 420,${cy}`)+VOUT(420,cy)+DOT(320,cy)
  +W(`${cx},${cy+16} ${cx-30},${cy+16} ${cx-30},${cy+40}`)+GND(cx-30,cy+40)
  +NODE(175,cy-24,'V−',8,-8));}

function scNonInv(){const cx=250,cy=120;return SVG(
  VIN(40,cy+16)+W(`40,${cy+16} ${cx},${cy+16}`)
  +OP(cx,cy)+W(`${cx+62},${cy} 420,${cy}`)+VOUT(420,cy)+DOT(360,cy)
  +W(`360,${cy} 360,190 306,190`)+RH(280,190,'Rf')+W(`254,190 175,190 175,${cy-16} ${cx},${cy-16}`)+DOT(175,cy-16)
  +W(`175,190 175,210 130,210`)+RH(104,210,'R1')+W(`78,210 60,210`)+GND(60,210)
  +NODE(175,cy-16,'V−',-34,-4));}

function scBuffer(){const cx=250,cy=120;return SVG(
  VIN(40,cy+16)+W(`40,${cy+16} ${cx},${cy+16}`)
  +OP(cx,cy)+W(`${cx+62},${cy} 420,${cy}`)+VOUT(420,cy)+DOT(360,cy)
  +W(`360,${cy} 360,70 175,70 175,${cy-16} ${cx},${cy-16}`)+DOT(175,cy-16)
  +NODE(175,cy-16,'V−',-34,-4)
  +`<text x="230" y="40" fill="var(--muted)" font-family="IBM Plex Mono" font-size="11" text-anchor="middle">100% feedback</text>`);}

function scSumming(){const cx=270,cy=140;return SVG(
  VIN(40,cy-40,'V1')+W(`40,${cy-40} 66,${cy-40}`)+RH(92,cy-40,'R1')+W(`118,${cy-40} 190,${cy-40} 190,${cy-16} ${cx},${cy-16}`)
  +VIN(40,cy-8,'V2')+W(`40,${cy-8} 66,${cy-8}`)+RH(92,cy-8,'R2')+W(`118,${cy-8} 190,${cy-8}`)+DOT(190,cy-16)
  +W(`190,${cy-40} 190,${cy-8}`)+W(`190,${cy-16} 190,64`)+RH(245,64,'Rf')+W(`219,64 190,64`)+W(`271,64 335,64 335,${cy}`)+DOT(335,cy)
  +OP(cx,cy)+W(`${cx+62},${cy} 420,${cy}`)+VOUT(420,cy)
  +W(`${cx},${cy+16} ${cx-34},${cy+16} ${cx-34},${cy+42}`)+GND(cx-34,cy+42)
  +NODE(190,cy-16,'V−',8,-8));}

function scDifference(){const cx=270,cy=130;return SVG(
  VIN(40,cy-24,'V1')+W(`40,${cy-24} 66,${cy-24}`)+RH(92,cy-24,'R1')+W(`118,${cy-24} 190,${cy-24} 190,${cy-16} ${cx},${cy-16}`)+DOT(190,cy-24)
  +W(`190,${cy-24} 190,66`)+RH(245,66,'Rf')+W(`219,66 190,66`)+W(`271,66 335,66 335,${cy}`)+DOT(335,cy)
  +VIN(40,cy+40,'V2')+W(`40,${cy+40} 66,${cy+40}`)+RH(92,cy+40,'R1')+W(`118,${cy+40} 190,${cy+40} 190,${cy+16} ${cx},${cy+16}`)+DOT(190,cy+40)
  +W(`190,${cy+40} 190,${cy+70}`)+RV(190,cy+96,'Rf')+W(`190,${cy+117} 190,${cy+130}`)+GND(190,cy+130)
  +OP(cx,cy)+W(`${cx+62},${cy} 420,${cy}`)+VOUT(420,cy)
  +NODE(190,cy-16,'V−',8,-8)+NODE(190,cy+16,'V+',8,16),'0 0 460 280');}

function scIntegrator(){const cx=250,cy=130;return SVG(
  VIN(40,cy-24)+W(`40,${cy-24} 70,${cy-24}`)+RH(96,cy-24,'R1')+W(`122,${cy-24} 175,${cy-24} 175,${cy-16} ${cx},${cy-16}`)+DOT(175,cy-24)
  +W(`175,${cy-24} 175,60`)+CAPH(228,60,'C')+W(`175,60 228,60`)+W(`235,60 320,60 320,${cy}`)+DOT(320,cy)
  +OP(cx,cy)+W(`${cx+62},${cy} 420,${cy}`)+VOUT(420,cy)
  +W(`${cx},${cy+16} ${cx-30},${cy+16} ${cx-30},${cy+40}`)+GND(cx-30,cy+40)
  +NODE(175,cy-24,'V−',8,-8));}

function scDifferentiator(){const cx=250,cy=130;return SVG(
  VIN(40,cy-24)+W(`40,${cy-24} 84,${cy-24}`)+CAPH(96,cy-24,'C')+W(`103,${cy-24} 175,${cy-24} 175,${cy-16} ${cx},${cy-16}`)+DOT(175,cy-24)
  +W(`175,${cy-24} 175,60`)+RH(230,60,'Rf')+W(`204,60 175,60`)+W(`256,60 320,60 320,${cy}`)+DOT(320,cy)
  +OP(cx,cy)+W(`${cx+62},${cy} 420,${cy}`)+VOUT(420,cy)
  +W(`${cx},${cy+16} ${cx-30},${cy+16} ${cx-30},${cy+40}`)+GND(cx-30,cy+40)
  +NODE(175,cy-24,'V−',8,-8));}

function scComparator(){const cx=250,cy=120;return SVG(
  VIN(40,cy-16)+W(`40,${cy-16} ${cx},${cy-16}`)
  +W(`150,${cy+16} ${cx},${cy+16}`)+DOT(150,cy+16)+W(`150,${cy+16} 150,175 130,175`)+RH(104,175,'')+`<text x="104" y="163" fill="var(--muted)" font-family="IBM Plex Mono" font-size="10" text-anchor="middle">Vref</text>`+W(`78,175 60,175`)+GND(60,175)
  +OP(cx,cy)+W(`${cx+62},${cy} 420,${cy}`)+VOUT(420,cy)
  +NODE(cx-70,cy-16,'Vin',0,-6)
  +`<text x="235" y="40" fill="var(--muted)" font-family="IBM Plex Mono" font-size="11" text-anchor="middle">no feedback → open loop</text>`);}

function scSchmitt(){const cx=250,cy=120;return SVG(
  VIN(40,cy-16)+W(`40,${cy-16} ${cx},${cy-16}`)
  +OP(cx,cy)+W(`${cx+62},${cy} 420,${cy}`)+VOUT(420,cy)+DOT(360,cy)
  +W(`360,${cy} 360,66 306,66`)+RH(280,66,'R2')+W(`254,66 190,66 190,${cy+16} ${cx},${cy+16}`)+DOT(190,cy+16)
  +W(`190,66 190,${cy+16}`)+W(`190,${cy+16} 190,190 150,190`)+RH(124,190,'R1')+W(`98,190 78,190`)+GND(78,190)
  +NODE(190,cy+16,'V+',-34,18)
  +`<text x="250" y="40" fill="var(--out)" font-family="IBM Plex Mono" font-size="11" text-anchor="middle">positive feedback</text>`);}

function scLowpass(){const cx=250,cy=130;return SVG(
  VIN(40,cy-24)+W(`40,${cy-24} 70,${cy-24}`)+RH(96,cy-24,'R1')+W(`122,${cy-24} 175,${cy-24} 175,${cy-16} ${cx},${cy-16}`)+DOT(175,cy-24)
  +W(`175,${cy-24} 175,60`)+RH(230,60,'Rf')+W(`204,60 175,60`)+W(`256,60 320,60 320,${cy}`)
  +W(`175,60 175,30 247,30`)+CAPH(247,30,'C')+W(`254,30 320,30 320,60`)
  +DOT(320,cy)+OP(cx,cy)+W(`${cx+62},${cy} 420,${cy}`)+VOUT(420,cy)
  +W(`${cx},${cy+16} ${cx-30},${cy+16} ${cx-30},${cy+40}`)+GND(cx-30,cy+40)
  +NODE(175,cy-24,'V−',8,-8)+`<text x="215" y="18" fill="var(--muted)" font-family="IBM Plex Mono" font-size="10" text-anchor="middle">C ∥ Rf</text>`);}

function scIntro(){const cx=250,cy=120;return SVG(
  VIN(60,cy-16,'V−')+W(`60,${cy-16} ${cx},${cy-16}`)
  +VIN(60,cy+16,'V+')+W(`60,${cy+16} ${cx},${cy+16}`)
  +OP(cx,cy)+W(`${cx+62},${cy} 420,${cy}`)+VOUT(420,cy)
  +`<text x="150" y="70" fill="var(--muted)" font-family="IBM Plex Mono" font-size="11">Vout = A(V+ − V−)</text>`
  +`<text x="330" y="${cy-14}" fill="var(--dim)" font-family="IBM Plex Mono" font-size="10">A ≈ 100000+</text>`);}

/* =======================================================================
   TOPICS
   ======================================================================= */
const P0 = ()=>({R1:10e3,Rf:100e3,R2:47e3,C:10e-9,Vpp:2,freq:1000,wave:'sine',Vsat:12,Vref:0,GBW:1e6});

const TOPICS={
/* ---- Basics ---- */
intro:{cat:'Basics',name:'Meet the op-amp',kind:'intro',
  tag:'The whole device in one idea: it amplifies the tiny difference between its two inputs — by a colossal amount.',
  schematic:scIntro, graphs:['transfer'],
  params:['Vsat'],
  extra:P=>`<div class="ctl"><div class="lab"><span class="n">V+ input</span><span class="v" id="vpv">${P.vp?.toFixed(2)||'0.50'} V</span></div><input type="range" min="-2" max="2" step="0.01" value="${P.vp??0.5}" data-x="vp"></div>
            <div class="ctl"><div class="lab"><span class="n">V− input</span><span class="v" id="vmv">${P.vm?.toFixed(2)||'0.00'} V</span></div><input type="range" min="-2" max="2" step="0.01" value="${P.vm??0}" data-x="vm"></div>`,
  staticGain:()=>1e5,
  transferKind:'intro',
  readout:P=>{const vp=P.vp??0.5,vm=P.vm??0,d=vp-vm,vo=clamp(1e5*d,-P.Vsat,P.Vsat);
    return {main:`V<span class="sym">out</span> = A · (V<span class="in">+</span> − V<span class="sym">−</span>)`,
      pills:[['V+ − V−',(d*1000).toFixed(1)+' mV'],['open-loop A','100 000'],['Vout',fmtV(vo),Math.abs(vo)>=P.Vsat-0.01]]};},
  theory:`<p>An op-amp has two inputs and one output. Its only job: measure the voltage <b>difference</b> between the <span class="rule">+</span> and <span class="rule">−</span> inputs and multiply it by its <b>open-loop gain</b> <code>A</code> — typically 100,000 or more.</p>
    <p>Because <code>A</code> is so huge, even a <b>millivolt</b> of difference slams the output all the way to a supply rail. On its own the op-amp is really a very sensitive <b>comparator</b>.</p>
    <p>The magic comes from <b>feedback</b>: wire the output back to the − input and the op-amp will do whatever it takes to keep <span class="rule">V+ = V−</span>. That "virtual short", plus <span class="rule">no current into the inputs</span>, are the two golden rules that explain every circuit here.</p>`,
  bench:`<div class="bh">⚙ Try it for real</div><p>A <code>TL072</code> or <code>LM358</code> on a breadboard is all you need. Power it from ±9 V (or single 5 V with a mid-rail reference). Tie both inputs together to a divider and you'll see the output rest mid-rail; nudge them apart and it jumps to a rail.</p>`},

/* ---- Amplifiers ---- */
inverting:{cat:'Amplifiers',name:'Inverting amplifier',kind:'static',
  tag:'Gain set by two resistors, output flipped upside-down. The workhorse of analog design.',
  schematic:scInverting, graphs:['scope','transfer','bode'],
  params:['R1','Rf','wave','Vpp','freq','Vsat'],
  vout:(vin,P)=>-(P.Rf/P.R1)*vin,
  staticGain:P=>-(P.Rf/P.R1),
  bode:P=>bodeAmp(P,-(P.Rf/P.R1),1+P.Rf/P.R1),
  readout:P=>{const G=-(P.Rf/P.R1);return{main:`V<span class="sym">out</span> = −(R<span class="sym">f</span>/R<span class="sym">1</span>) · <span class="in">V<span class="sym">in</span></span>`,
    pills:[['gain',(G).toFixed(2)+' ×'],['|gain| dB',(20*Math.log10(Math.abs(G))).toFixed(1)+' dB'],['bandwidth',fmtF(P.GBW/(1+P.Rf/P.R1))]]};},
  theory:`<p>The + input sits at ground, so the golden rules force the − input to <b>0 V too</b> — a <span class="rule">virtual ground</span>. The input current <code>Vin/R1</code> has nowhere to go but through <code>Rf</code>, which drops <code>−(Rf/R1)·Vin</code> at the output.</p>
    <p>So the gain is just the <b>resistor ratio</b>, and the sign is negative — the output is inverted. Push the gain or the input high enough and the output <b>clips</b> at the rails (watch the red lines).</p>
    <p>The <b>Bode</b> tab shows the catch: gain × bandwidth is roughly constant, so more gain means less bandwidth.</p>`,
  bench:`<div class="bh">⚙ Try it for real</div><p>Virtual ground makes this easy to probe: measure the − input and you should read ~0 V no matter the signal. Use <code>R1 = 10 kΩ</code>, <code>Rf = 100 kΩ</code> for ×10. Feed it from an Arduino PWM pin through an RC low-pass to get a smooth DC you can sweep.</p>`},

noninverting:{cat:'Amplifiers',name:'Non-inverting amplifier',kind:'static',
  tag:'Same resistor pair, but the signal drives the + input — so the output keeps its sign and gain is always ≥ 1.',
  schematic:scNonInv, graphs:['scope','transfer','bode'],
  params:['R1','Rf','wave','Vpp','freq','Vsat'],
  vout:(vin,P)=>(1+P.Rf/P.R1)*vin,
  staticGain:P=>(1+P.Rf/P.R1),
  bode:P=>bodeAmp(P,(1+P.Rf/P.R1),1+P.Rf/P.R1),
  readout:P=>{const G=1+P.Rf/P.R1;return{main:`V<span class="sym">out</span> = (1 + R<span class="sym">f</span>/R<span class="sym">1</span>) · <span class="in">V<span class="sym">in</span></span>`,
    pills:[['gain',G.toFixed(2)+' ×'],['|gain| dB',(20*Math.log10(G)).toFixed(1)+' dB'],['bandwidth',fmtF(P.GBW/G)]]};},
  theory:`<p>Here the signal goes straight into the + input. Feedback still forces <span class="rule">V− = V+ = Vin</span>, and the <code>R1–Rf</code> divider sets how much of the output it takes to achieve that. The result: <code>Vout = (1 + Rf/R1)·Vin</code>.</p>
    <p>Because of the "1 +", the gain <b>can never drop below 1</b>. The output stays the <b>same polarity</b> as the input, and the + input draws essentially no current, giving a very high input impedance.</p>`,
  bench:`<div class="bh">⚙ Try it for real</div><p>Great when you must not load the source (a sensor, say). Set <code>Rf = 0</code> / <code>R1 = ∞</code> and it becomes the buffer in the next tab. Same <code>TL072</code>; watch that the output is in phase with the input on your scope.</p>`},

buffer:{cat:'Amplifiers',name:'Voltage follower (buffer)',kind:'static',
  tag:'Gain exactly 1. Useless as an amplifier, priceless as an impedance shield.',
  schematic:scBuffer, graphs:['scope','bode'],
  params:['wave','Vpp','freq','Vsat'],
  vout:(vin)=>vin,
  staticGain:()=>1,
  bode:P=>bodeAmp(P,1,1),
  readout:P=>({main:`V<span class="sym">out</span> = <span class="in">V<span class="sym">in</span></span>`,
    pills:[['gain','1.00 ×'],['bandwidth',fmtF(P.GBW)],['input Z','≈ ∞']]}),
  theory:`<p>Connect the output straight back to the − input. Feedback then holds <span class="rule">V− = Vin</span>, and since V− <i>is</i> the output, <code>Vout = Vin</code>. Gain of one.</p>
    <p>Why bother? The + input draws almost no current, so the buffer presents a <b>huge input impedance</b> to the source and a <b>low impedance</b> to the load. It lets a weak signal drive a heavy load without sagging — the analog equivalent of a signal repeater.</p>`,
  bench:`<div class="bh">⚙ Try it for real</div><p>Put one between a high-impedance sensor (or a potentiometer) and an Arduino <code>analogRead</code> pin to stop the ADC from loading it and skewing the reading. Full gain-bandwidth is available since the gain is 1.</p>`},

/* ---- Math circuits ---- */
summing:{cat:'Math circuits',name:'Summing amplifier',kind:'static',
  tag:'Add two voltages (an AC signal riding on a DC level) in one op-amp — the basis of the audio mixer.',
  schematic:scSumming, graphs:['scope','transfer'],
  params:['R1','R2','Rf','wave','Vpp','freq','V2','Vsat'],
  vout:(vin,P)=>-((P.Rf/P.R1)*vin + (P.Rf/P.R2)*(P.V2??0)),
  staticGain:P=>-(P.Rf/P.R1),
  readout:P=>({main:`V<span class="sym">out</span> = −(R<span class="sym">f</span>/R<span class="sym">1</span>·<span class="in">V1</span> + R<span class="sym">f</span>/R<span class="sym">2</span>·V2)`,
    pills:[['V1 gain',(-P.Rf/P.R1).toFixed(2)],['V2 gain',(-P.Rf/P.R2).toFixed(2)],['V2 (DC)',fmtV(P.V2??0)]]}),
  theory:`<p>At the virtual ground, each input pushes its own current — <code>V1/R1</code> and <code>V2/R2</code> — and they simply <b>add up</b> through <code>Rf</code>. The output is the (inverted) weighted sum.</p>
    <p>Give each input its own resistor and you set its <b>weight</b> independently. Here <b>V1</b> is your waveform and <b>V2</b> is an adjustable DC level, so you can watch the signal slide up and down as V2 changes — exactly how a mixing desk stacks channels.</p>`,
  bench:`<div class="bh">⚙ Try it for real</div><p>Make <code>R1 = R2 = Rf</code> for a plain inverting adder. Feed V2 from a potentiometer to add a DC offset — handy for shifting a bipolar signal into the 0–5 V window an Arduino ADC can read.</p>`},

difference:{cat:'Math circuits',name:'Difference amplifier',kind:'static',
  tag:'Amplify only what differs between two inputs and reject what they share — the heart of instrumentation.',
  schematic:scDifference, graphs:['scope','transfer'],
  params:['R1','Rf','wave','Vpp','freq','V2','Vsat'],
  vout:(vin,P)=>(P.Rf/P.R1)*((P.V2??0)-vin),
  staticGain:P=>-(P.Rf/P.R1),
  readout:P=>({main:`V<span class="sym">out</span> = (R<span class="sym">f</span>/R<span class="sym">1</span>)·(V2 − <span class="in">V1</span>)`,
    pills:[['diff gain',(P.Rf/P.R1).toFixed(2)+' ×'],['V2 (DC)',fmtV(P.V2??0)],['common-mode','rejected']]}),
  theory:`<p>With matched resistor ratios on both inputs, the output depends only on the <b>difference</b> <code>V2 − V1</code>, scaled by <code>Rf/R1</code>. Any voltage the two inputs have <b>in common</b> cancels out.</p>
    <p>That "common-mode rejection" is priceless: it lets you pull a tiny sensor signal out from under a large shared noise or offset. Here <b>V1</b> is the waveform and <b>V2</b> a DC level — slide V2 and watch the output track the gap between them.</p>`,
  bench:`<div class="bh">⚙ Try it for real</div><p>Match your resistors well (1% or better) or the rejection suffers. This is the front end of every <b>load cell</b> and <b>ECG</b> amplifier. For serious work, three op-amps make an <i>instrumentation amplifier</i> with even better matching.</p>`},

integrator:{cat:'Math circuits',name:'Integrator',kind:'integrator',
  tag:'Replace the feedback resistor with a capacitor and the op-amp performs calculus — it integrates the input over time.',
  schematic:scIntegrator, graphs:['scope'],
  params:['R1','C','wave','Vpp','freq','Vsat'],
  tau:P=>P.R1*P.C,
  readout:P=>({main:`V<span class="sym">out</span> = −(1 / R<span class="sym">1</span>C) ∫ <span class="in">V<span class="sym">in</span></span> dt`,
    pills:[['R1·C',(P.R1*P.C*1e3).toFixed(2)+' ms'],['sine → ','−cosine (90° lag)'],['square → ','triangle']]}),
  theory:`<p>Charge on a capacitor is the running <b>integral</b> of the current into it. Feed the virtual ground through <code>R1</code> and that current, <code>Vin/R1</code>, charges <code>C</code> — so the output becomes <code>−(1/R1C)∫Vin dt</code>.</p>
    <p>Watch the shapes on the scope: a <b>square</b> wave integrates into a <b>triangle</b>; a <b>sine</b> becomes a <b>−cosine</b>, lagging by 90°. Faster signals integrate to smaller outputs (the 1/ω roll-off) — an integrator is also a low-pass filter.</p>
    <p><i>Note:</i> a real integrator adds a large resistor across <code>C</code> so DC doesn't drift it into the rail; here we centre the trace for clarity.</p>`,
  bench:`<div class="bh">⚙ Try it for real</div><p>Add a big <code>Rf</code> (e.g. 1 MΩ) across the capacitor to stop DC drift. Integrators generate the ramps in analog function generators and are one half of an analog PID controller.</p>`},

differentiator:{cat:'Math circuits',name:'Differentiator',kind:'differentiator',
  tag:'Swap the roles — capacitor in, resistor back — and the op-amp outputs the rate of change of the input.',
  schematic:scDifferentiator, graphs:['scope'],
  params:['C','Rf','wave','Vpp','freq','Vsat'],
  tau:P=>P.Rf*P.C,
  readout:P=>({main:`V<span class="sym">out</span> = −R<span class="sym">f</span>C · d<span class="in">V<span class="sym">in</span></span>/dt`,
    pills:[['Rf·C',(P.Rf*P.C*1e3).toFixed(2)+' ms'],['sine → ','+cosine (90° lead)'],['triangle → ','square']]}),
  theory:`<p>Current through a capacitor is proportional to how fast its voltage <b>changes</b>. Put <code>C</code> at the input and that current, <code>C·dVin/dt</code>, flows through <code>Rf</code> — giving <code>Vout = −Rf C·dVin/dt</code>.</p>
    <p>Now a <b>triangle</b> (constant slopes) becomes a <b>square</b>, and the sharp edges of a square wave produce tall <b>spikes</b>. That sensitivity to sudden change is also why pure differentiators amplify noise — real ones add a small resistor in series with <code>C</code> to tame it.</p>`,
  bench:`<div class="bh">⚙ Try it for real</div><p>Add a small series resistor with <code>C</code> (a few hundred Ω) and a small cap across <code>Rf</code> to keep it stable. Differentiators detect edges and are the other half of an analog PID's "D" term — the same Brake you may have met in the controller lessons.</p>`},

/* ---- Comparators ---- */
comparator:{cat:'Comparators',name:'Comparator',kind:'comparator',
  tag:'No feedback at all: the output is fully high or fully low depending on which side of a threshold the input is.',
  schematic:scComparator, graphs:['scope','transfer'],
  params:['wave','Vpp','freq','Vref','Vsat'],
  readout:P=>({main:`V<span class="sym">out</span> = <span class="in">V<span class="sym">in</span></span> > V<span class="sym">ref</span> ?  +V<span class="sym">sat</span> : −V<span class="sym">sat</span>`,
    pills:[['Vref',fmtV(P.Vref)],['output','digital'],['gain','open-loop']]}),
  theory:`<p>With <b>no feedback</b>, the op-amp's enormous gain has nothing to tame it, so the output sits at one rail or the other. It flips the instant <code>Vin</code> crosses <code>Vref</code> — turning a smooth analog signal into a clean <b>digital</b> one.</p>
    <p>The <b>transfer</b> tab shows the tell-tale step at <code>Vref</code>. This is how a light or temperature sensor triggers an action at a set point.</p>`,
  bench:`<div class="bh">⚙ Try it for real</div><p>Use a dedicated comparator (<code>LM393</code>) rather than an op-amp for speed. Its output can drive an Arduino digital pin directly. Set <code>Vref</code> with a potentiometer — but if the input is noisy near the threshold, the output will chatter. That's what the next tab fixes.</p>`},

schmitt:{cat:'Comparators',name:'Schmitt trigger',kind:'schmitt',
  tag:'A comparator with memory. Positive feedback gives it two thresholds, so noise can’t make it chatter.',
  schematic:scSchmitt, graphs:['scope','transfer'],
  params:['R1','R2','wave','Vpp','freq','Vsat'],
  readout:P=>{const VT=P.Vsat*P.R1/(P.R1+P.R2);return{main:`trip points  =  ± V<span class="sym">sat</span> · R<span class="sym">1</span>/(R<span class="sym">1</span>+R<span class="sym">2</span>)`,
    pills:[['upper +VT',fmtV(VT)],['lower −VT',fmtV(-VT)],['hysteresis',fmtV(2*VT)]]};},
  theory:`<p>Feed a little of the output <b>back to the + input</b> and the threshold itself moves. Going up, the input must pass <code>+VT</code> to flip; coming down, it must fall below a <b>lower</b> <code>−VT</code>. The gap between them is the <span class="rule">hysteresis</span>.</p>
    <p>Because the two thresholds are separated, a noisy signal wobbling around one level can't rattle the output back and forth — it snaps once and stays put. The <b>transfer</b> tab shows the classic hysteresis loop (two coloured paths, up vs down).</p>`,
  bench:`<div class="bh">⚙ Try it for real</div><p>Set the gap wider than your noise. <code>R1 = 10 kΩ, R2 = 47 kΩ</code> on ±12 V gives about ±2.5 V trip points. Every mechanical-switch debouncer and zero-crossing detector relies on this trick.</p>`},

/* ---- Filters ---- */
lowpass:{cat:'Filters',name:'Active low-pass filter',kind:'filter',
  tag:'A capacitor across the feedback resistor lets low frequencies through at full gain and quietly rolls off the highs.',
  schematic:scLowpass, graphs:['scope','bode'],
  params:['R1','Rf','C','wave','Vpp','freq','Vsat'],
  dcGain:P=>-(P.Rf/P.R1),
  tau:P=>P.Rf*P.C,
  staticGain:P=>-(P.Rf/P.R1),
  bode:P=>bodeLP(P),
  readout:P=>{const fc=1/(2*Math.PI*P.Rf*P.C);return{main:`f<span class="sym">c</span> = 1 / (2π R<span class="sym">f</span> C)`,
    pills:[['DC gain',(-P.Rf/P.R1).toFixed(2)+' ×'],['cutoff fc',fmtF(fc)],['roll-off','−20 dB/dec']]};},
  theory:`<p>It's an inverting amplifier whose feedback resistor now has a <b>capacitor in parallel</b>. At low frequencies the cap is "open", so the gain is the usual <code>−Rf/R1</code>. As frequency climbs, the cap's impedance falls and <b>shorts out</b> <code>Rf</code>, dropping the gain.</p>
    <p>The corner is <span class="rule">fc = 1/(2π Rf C)</span>. Above it the gain falls at −20 dB per decade — see the <b>Bode</b> tab, where the cyan line marks fc (−3 dB). On the scope, try a fast signal and watch the sharp edges get rounded off.</p>`,
  bench:`<div class="bh">⚙ Try it for real</div><p>Set <code>fc</code> just above your signal band to strip hiss and anti-alias before an ADC. <code>Rf = 100 kΩ, C = 1 nF</code> → fc ≈ 1.6 kHz. Cascade two for a steeper −40 dB/dec (Sallen-Key) filter.</p>`}
};

/* ---- Bode builders ---- */
function bodeAmp(P,G0,noiseGain){         // finite-GBW amplifier
  const fc=P.GBW/noiseGain, fs=[],mag=[],phase=[];
  const g0=Math.abs(G0), base=G0<0?180:0;
  for(let i=0;i<=240;i++){const f=Math.pow(10,i/40);const r=f/fc;
    fs.push(f); mag.push(20*Math.log10(g0/Math.sqrt(1+r*r)));
    phase.push(base - Math.atan(r)*180/Math.PI);}
  return {fs,mag,phase,fc,gain0dB:20*Math.log10(g0)};
}
function bodeLP(P){                        // inverting active low-pass
  const G0=P.Rf/P.R1, fc=1/(2*Math.PI*P.Rf*P.C), fs=[],mag=[],phase=[];
  for(let i=0;i<=240;i++){const f=Math.pow(10,i/40);const r=f/fc;
    fs.push(f); mag.push(20*Math.log10(G0/Math.sqrt(1+r*r)));
    phase.push(180 - Math.atan(r)*180/Math.PI);}
  return {fs,mag,phase,fc,gain0dB:20*Math.log10(G0)};
}

/* ---- parameter definitions ---- */
const PARAM={
  R1:{n:'R1',type:'rlog',min:1e3,max:1e6,fmt:fmtR},
  Rf:{n:'Rf',type:'rlog',min:1e3,max:1e6,fmt:fmtR},
  R2:{n:'R2',type:'rlog',min:1e3,max:1e6,fmt:fmtR},
  C:{n:'C',type:'clog',min:100e-12,max:1e-6,fmt:fmtC},
  Vpp:{n:'Input amplitude (pp)',type:'lin',min:0.2,max:8,step:0.1,fmt:v=>v.toFixed(1)+' V'},
  freq:{n:'Frequency',type:'flog',min:20,max:20000,fmt:fmtF},
  Vsat:{n:'Supply rails ±',type:'lin',min:3,max:15,step:1,fmt:v=>'±'+v+' V'},
  Vref:{n:'Threshold Vref',type:'lin',min:-4,max:4,step:0.1,fmt:fmtV},
  V2:{n:'V2 (DC level)',type:'lin',min:-4,max:4,step:0.1,fmt:fmtV}
};

/* =======================================================================
   UI
   ======================================================================= */
const $=id=>document.getElementById(id);
let CUR=null, P=P0(), GTAB='scope';

function thumbFor(key){ // small schematic thumbnail (reuse full schematic, scaled by viewBox)
  return TOPICS[key].schematic();
}
function buildHome(){
  const cats=['Basics','Amplifiers','Math circuits','Comparators','Filters'];
  let html='';
  cats.forEach(cat=>{
    const keys=Object.keys(TOPICS).filter(k=>TOPICS[k].cat===cat);
    html+=`<div class="catlabel">${cat}</div><div class="cards">`;
    keys.forEach(k=>{const t=TOPICS[k];
      html+=`<button class="tcard" data-k="${k}"><div class="thumb">${t.schematic()}</div><div class="body"><h3>${t.name}</h3><p class="frm">${t.tag.split('.')[0]}.</p></div></button>`;});
    html+='</div>';
  });
  $('catalog').innerHTML=html;
  document.querySelectorAll('.tcard').forEach(b=>b.addEventListener('click',()=>openTopic(b.dataset.k)));
}

function buildChips(){
  const html=Object.keys(TOPICS).map(k=>`<button class="chip${k===CUR?' on':''}" data-k="${k}">${TOPICS[k].name}</button>`).join('');
  $('chipbar').innerHTML=html;
  document.querySelectorAll('#chipbar .chip').forEach(b=>b.addEventListener('click',()=>openTopic(b.dataset.k)));
}

/* log slider mapping */
function toSlider(type,val,d){
  if(type==='rlog'||type==='clog'||type==='flog') return Math.log10(val);
  return val;
}
function fromSlider(type,s){
  if(type==='rlog'||type==='clog'||type==='flog') return Math.pow(10,s);
  return +s;
}
function sliderAttrs(def){
  if(def.type==='lin') return {min:def.min,max:def.max,step:def.step,val:P[keyOf(def)]};
  return {min:Math.log10(def.min),max:Math.log10(def.max),step:0.02,val:Math.log10(P[keyOf(def)])};
}
function keyOf(def){for(const k in PARAM)if(PARAM[k]===def)return k;}

function buildControls(){
  const t=TOPICS[CUR]; let html='';
  t.params.forEach(pk=>{
    if(pk==='wave'){
      html+=`<div class="ctl"><div class="lab"><span class="n">Input waveform</span></div>
        <div class="seg" data-seg="wave">
          ${['sine','square','triangle'].map(w=>`<button data-w="${w}" class="${P.wave===w?'on':''}">${w[0].toUpperCase()+w.slice(1)}</button>`).join('')}
        </div></div>`; return;
    }
    const def=PARAM[pk]; if(!def)return;
    const a=sliderAttrs(def);
    html+=`<div class="ctl"><div class="lab"><span class="n">${def.n}</span><span class="v" data-v="${pk}">${def.fmt(P[pk])}</span></div>
      <input type="range" min="${a.min}" max="${a.max}" step="${a.step}" value="${a.val}" data-p="${pk}"></div>`;
  });
  if(t.extra) html+=t.extra(P);
  $('controls').innerHTML=html;
  // wire sliders
  $('controls').querySelectorAll('input[data-p]').forEach(inp=>{
    const pk=inp.dataset.p, def=PARAM[pk];
    inp.addEventListener('input',()=>{
      P[pk]=fromSlider(def.type,+inp.value);
      $('controls').querySelector(`[data-v="${pk}"]`).textContent=def.fmt(P[pk]);
      refresh();
    });
  });
  $('controls').querySelectorAll('input[data-x]').forEach(inp=>{
    inp.addEventListener('input',()=>{P[inp.dataset.x]=+inp.value;
      const map={vp:'vpv',vm:'vmv'}; const el=$(map[inp.dataset.x]); if(el)el.textContent=(+inp.value).toFixed(2)+' V';
      refresh();});
  });
  const seg=$('controls').querySelector('[data-seg="wave"]');
  if(seg) seg.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    P.wave=b.dataset.w; seg.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); refresh();}));
}

function buildGraphTabs(){
  const t=TOPICS[CUR];
  const names={scope:'Oscilloscope',transfer:'Transfer',bode:'Bode plot'};
  if(!t.graphs.includes(GTAB)) GTAB=t.graphs[0];
  $('graphTabs').innerHTML=t.graphs.map(g=>`<button class="${g===GTAB?'on':''}" data-g="${g}">${names[g]}</button>`).join('');
  $('graphTabs').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{GTAB=b.dataset.g;buildGraphTabs();drawGraph();}));
  // legend
  const leg=$('legend');
  if(GTAB==='scope') leg.innerHTML=`<span class="lg"><i style="background:var(--in)"></i>Vin (input)</span><span class="lg"><i style="background:var(--out)"></i>Vout (output)</span><span class="lg"><i style="background:var(--sat)"></i>supply rails</span>`;
  else if(GTAB==='bode') leg.innerHTML=`<span class="lg"><i style="background:var(--out)"></i>gain (dB)</span><span class="lg"><i style="background:var(--in)"></i>phase (°)</span><span class="lg"><i style="background:var(--accent)"></i>cutoff fc</span>`;
  else leg.innerHTML=`<span class="lg"><i style="background:var(--out)"></i>Vout vs Vin</span><span class="lg"><i style="background:var(--sat)"></i>supply rails</span>`;
}

function drawGraph(){
  const t=TOPICS[CUR], cv=$('scope');
  if(GTAB==='scope'){ const S=simulate(t,P); drawScope(cv,S,P); }
  else if(GTAB==='transfer'){ drawTransfer(cv,t,P); }
  else if(GTAB==='bode'){ drawBode(cv,t,P); }
}

function renderEq(){
  const t=TOPICS[CUR], r=t.readout(P);
  let html=`<div class="main">${r.main}</div><div class="res">`;
  r.pills.forEach(p=>{html+=`<span class="pill${p[2]?' warn':''}"><b>${p[0]}</b> <span>${p[1]}</span></span>`;});
  html+='</div>'; $('eqbox').innerHTML=html;
}

function refresh(){ renderEq(); drawGraph(); }

function openTopic(key){
  CUR=key; const t=TOPICS[key];
  $('home').classList.add('hidden'); $('work').classList.remove('hidden');
  window.scrollTo(0,0);
  // reset only the params this topic doesn't carry sensibly
  P=Object.assign(P0(),{wave:P.wave,Vsat:P.Vsat});
  if(key==='lowpass'){P.Rf=100e3;P.R1=100e3;P.C=1e-9;P.freq=2000;}
  if(key==='integrator'){P.R1=100e3;P.C=10e-9;P.freq=500;P.Vpp=2;}
  if(key==='differentiator'){P.Rf=100e3;P.C=10e-9;P.freq=500;P.Vpp=2;}
  if(key==='intro'){P.vp=0.5;P.vm=0;}
  if(key==='schmitt'){P.R1=10e3;P.R2=47e3;P.Vpp=8;}
  if(key==='comparator'){P.Vpp=6;P.Vref=1;}
  if(key==='summing'||key==='difference'){P.V2=1;}
  $('wTitle').textContent=t.name;
  $('wTag').textContent=t.tag;
  $('schematic').innerHTML=t.schematic();
  $('theory').innerHTML=t.theory;
  $('bench').innerHTML=t.bench;
  $('topHint').textContent=t.cat;
  $('fnote').textContent=t.name+' — '+t.cat;
  buildChips(); buildControls(); buildGraphTabs(); refresh();
}
function goHome(){ $('work').classList.add('hidden'); $('home').classList.remove('hidden'); CUR=null; window.scrollTo(0,0); }

$('backBtn').addEventListener('click',goHome);
$('homeMark').addEventListener('click',goHome);
$('homeWord').addEventListener('click',goHome);
window.addEventListener('resize',()=>{ if(CUR) drawGraph(); });

buildHome();
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
