{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const has=v=>v!=null&&v!==''&&!Number.isNaN(v);
const nn=a=>a.filter(has);
const mean=a=>{a=nn(a);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null};
const sd=a=>{a=nn(a);const m=mean(a);return a.length>1?Math.sqrt(mean(a.map(x=>(x-m)**2))):0};
const css=v=>getComputedStyle(document.body).getPropertyValue(v).trim();
const mkRnd=s=>()=>(s=s*16807%2147483647)/2147483647;
const keyOf=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dateOf=k=>{const[y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)};
const addDays=(k,n)=>{const d=dateOf(k);d.setDate(d.getDate()+n);return keyOf(d)};
const store=(k,v)=>{try{if(v===undefined)return JSON.parse(localStorage.getItem(k)||'null');localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return v===undefined?null:false}};

/* ================= settings ================= */
const DEF={name:'',age:30,stepGoal:10000,sleepGoal:8,waterGoal:2500,theme:'auto',seen:false};
let S={...DEF,...(store('cirqa-set')||{})};
const saveS=()=>store('cirqa-set',S);
const applyTheme=()=>{const r=document.documentElement;if(S.theme==='auto')r.removeAttribute('data-theme');else r.dataset.theme=S.theme};
applyTheme();
const maxHR=()=>Math.round(208-.7*S.age);
const TODAY=keyOf(new Date());

/* ================= data model =================
 day = {steps,rhr,hrv,spo2,resp,kcal,floors,dist,stress,bbHi,bbLo,
        sleep:{bed,dur,deep,light,rem,awake,score,segs:[{s,a,b}]}, // hours; bed is hours after the previous midnight (23.5 = 23:30 the evening before)
        wk:[{type,start,min,avg,max,kcal}], hr:[[min,bpm]], st:[[min,v]], bb:[[min,v]], tags:[]}
 sleep is filed under the day you woke up. */
let REAL=store('cirqa-data')||{days:{},vo2:null,fitAge:null,imports:[]};
const isReal=()=>Object.keys(REAL.days).length>0;
const saveReal=()=>{
  const keys=Object.keys(REAL.days).sort(),cut=keys.length?addDays(keys.at(-1),-180):'';
  keys.forEach(k=>{if(k<cut)delete REAL.days[k];else if(k<addDays(keys.at(-1),-21)){delete REAL.days[k].hr}});
  return store('cirqa-data',REAL)};

/* ---------- sample data (used only until real data is imported) ---------- */
function sampleDays(){
  let rnd=mkRnd(42);const nrm=()=>{let u=0;for(let i=0;i<6;i++)u+=rnd();return u-3};const out={};
  for(let i=29;i>=0;i--){const k=addDays(TODAY,-i),alc=rnd()<.2,caf=rnd()<.28,late=rnd()<.25,wk=rnd()<.5||i===0;
    const hrv=i?Math.round(64+nrm()*4-(alc?13:0)-(late?5:0)-(caf?4:0)):69,rhr=i?Math.round(53+nrm()*1.3+(alc?4:0)+(late?1:0)):52;
    const bed=i?23.1+nrm()*.35+(late?1.2:0):23,dur=i?clamp(7.4+nrm()*.45-(late?.8:0)-(alc?.3:0),5,9.5):7.6;
    const deepF=clamp(.17+nrm()*.02-(alc?.05:0)+(wk?.025:0),.06,.3),remF=clamp(.22+nrm()*.02-(alc?.04:0),.1,.3),awF=.04;
    const r=mkRnd(1000+i*7),n=()=>{let u=0;for(let q=0;q<6;q++)u+=r();return u-3};
    const wake=bed+dur-24,end=i?24:Math.min(24,new Date().getHours()+new Date().getMinutes()/60||20.5),ws=wk?(i%3?17.5:7.4):99,we=ws+.85;
    const hr=[],st=[],bb=[];let b=clamp(20+(dur-7)*8,8,40);const score=Math.round(clamp(58+dur*3.2+deepF*60-(alc?7:0)-(late?4:0),40,98));
    for(let m=0;m<=end*60;m+=5){const h=m/60,sl=h<wake||h>=bed,work=h>=ws&&h<we,walk=(h>=8.2&&h<8.6)||(h>=12.6&&h<13);
      let v=sl?rhr-2+3*Math.sin(h*2)+n()*1.5:rhr+16+n()*4+(h>9&&h<12?6:0);if(walk)v=96+n()*5;if(work)v=128+28*Math.sin(Math.PI*(h-ws)/.85)+n()*4;
      let s=sl?8+n()*3:28+18*Math.sin(h/1.7)**2+n()*8+(h>10&&h<11.5?25:0)+(alc?6:0);if(work||walk)s=-1;
      b+=sl&&h<12?(.6+score/170):work?-1.4:-(.12+Math.max(0,s)/320);b=clamp(b,5,100);
      hr.push([m,Math.round(v)]);st.push([m,Math.round(clamp(s,-1,100))]);bb.push([m,Math.round(b)])}
    const segs=[];{const rr=mkRnd(500+i*13),pat=[['light',.35],['deep',.55],['light',.25],['rem',.2],['light',.3],['deep',.4],['light',.3],['rem',.35],['awake',.05],['light',.4],['deep',.2],['light',.3],['rem',.45],['light',.35],['awake',.06],['rem',.5],['light',.4]];
      let t=bed,q=0;while(t<bed+dur-.01){const[sg,dd]=pat[q%pat.length];const du=Math.min(dd*(.8+rr()*.4)*(sg==='deep'?deepF/.17:1),bed+dur-t);segs.push({s:sg,a:t,b:t+du});t+=du;q++}}
    const tot={deep:0,light:0,rem:0,awake:0};segs.forEach(x=>tot[x.s]+=x.b-x.a);
    const stAvg=Math.round(mean(st.filter(x=>x[1]>=0&&x[0]/60>wake).map(x=>x[1])));
    out[k]={steps:i?Math.round(clamp(9000+nrm()*2600+(wk?2500:0),2500,19000)):8327,rhr,hrv,spo2:Math.round(clamp(96+nrm()*.7,92,99)),resp:+(14.2+nrm()*.3+(alc?.5:0)).toFixed(1),
      kcal:Math.round(500+rnd()*500+(wk?450:0)),floors:Math.round(6+rnd()*10),stress:stAvg,bbHi:Math.max(...bb.map(x=>x[1])),bbLo:Math.min(...bb.map(x=>x[1])),
      sleep:{bed,dur:+(tot.deep+tot.light+tot.rem).toFixed(2),deep:tot.deep,light:tot.light,rem:tot.rem,awake:tot.awake,score,segs},
      wk:wk?[{type:i%3?'Running':'Cycling',start:ws,min:51,avg:142,max:Math.max(...hr.map(x=>x[1])),kcal:480}]:[],
      hr,st,bb,tags:[alc&&'Alcohol',caf&&'Coffee after 2pm',late&&'Late night',wk&&'Hard workout'].filter(Boolean)}}
  return out}

/* ---------- build the day list the UI renders ---------- */
let days=[],N=0,sel=0;
function logFor(k){return store('cirqa-log-'+k)||{mood:0,tags:[],water:0}}
function build(){
  const src=isReal()?REAL.days:sampleDays(),keys=Object.keys(src).sort();
  const last=keys.at(-1)>TODAY?keys.at(-1):(isReal()&&keys.at(-1)<addDays(TODAY,-3)?keys.at(-1):TODAY),first=keys[0]<addDays(last,-59)?addDays(last,-59):keys[0];
  days=[];for(let k=first;k<=last;k=addDays(k,1)){const raw=src[k]||{},d={key:k,d:dateOf(k),...raw};
    if(isReal()){const lg=logFor(addDays(k,-1));d.tags=lg.tags||[]}  // tags logged the day before affect this night
    days.push(d)}
  N=days.length;sel=N-1;derive()}
function base(i,f,n=30){const v=nn(days.slice(Math.max(0,i-n),i).map(d=>typeof f==='function'?f(d):d[f]));return{m:mean(v),s:sd(v)||1,n:v.length}}
function derive(){
  const hasWk=days.some(d=>d.wk&&d.wk.length);
  days.forEach((d,i)=>{
    const sl=d.sleep;
    if(sl&&has(sl.dur)){sl.ourScore=Math.round(clamp(clamp(sl.dur/S.sleepGoal,0,1)*55+(has(sl.deep)?clamp(sl.deep/sl.dur/.2,0,1)*20:14)+(has(sl.rem)?clamp(sl.rem/sl.dur/.22,0,1)*15:10)+(has(sl.awake)?10-clamp(sl.awake*10,0,10):7),20,100));d.score=has(sl.score)?sl.score:sl.ourScore;d.scoreSrc=has(sl.score)?'Garmin':'Cirqa'}else d.score=null;
    const rb=base(i,'rhr').m||55,mx=maxHR();
    d.load=d.wk&&d.wk.length?Math.round(d.wk.reduce((s,w)=>s+(w.min||0)*(has(w.avg)?clamp((w.avg-rb)/(mx-rb),.15,1)*2:1),0)):hasWk?0:null});
  days.forEach((d,i)=>{
    const w=nn(days.slice(Math.max(0,i-6),i+1).map(x=>x.load)),c=nn(days.slice(Math.max(0,i-27),i+1).map(x=>x.load));
    d.acwr=hasWk&&i>=13&&mean(c)>0?mean(w)/mean(c):null;
    const bh=base(i,'hrv'),br=base(i,'rhr'),parts=[];let sum=0;
    if(has(d.hrv)&&bh.n>=4){sum+=(d.hrv-bh.m)/bh.s*9;parts.push('HRV')}
    if(has(d.rhr)&&br.n>=4){sum-=(d.rhr-br.m)/br.s*6;parts.push('resting heart rate')}
    if(parts.length&&has(d.score)){sum+=(d.score-75)*.6;parts.push('sleep')}
    if(parts.length&&has(d.acwr)){sum-=Math.max(0,d.acwr-1.3)*30;parts.push('training load')}
    d.ready=parts.length?Math.round(clamp(62+sum,1,100)):null;d.readyParts=parts;
    const sl=nn(days.slice(Math.max(0,i-6),i+1).map(x=>x.sleep&&x.sleep.dur));
    d.debt=sl.length?sl.reduce((s,x)=>s+Math.max(0,S.sleepGoal-x),0):null});
}

/* ================= importers ================= */
const pDate=v=>{if(v==null)return null;if(typeof v==='number')return new Date(v>1e12?v:v*1000);let s=String(v).trim();
  let m=s.match(/^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d(?::\d\d(?:\.\d+)?)?)\s*([+-]\d\d):?(\d\d)$/);if(m)return new Date(`${m[1]}T${m[2]}${m[3]}:${m[4]}`);
  if(/^\d{4}-\d\d-\d\d$/.test(s))return dateOf(s);const d=new Date(s.replace(' ','T'));return isNaN(d)?null:d};
const pGMT=v=>{if(v==null)return null;if(typeof v==='number')return new Date(v);const s=String(v);return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s)?s:s.replace(' ','T')+'Z')};
const hOf=d=>d.getHours()+d.getMinutes()/60;
function newAcc(){return{days:{},vo2:null,fitAge:null,count:{}}}
function day(acc,k){return acc.days[k]||(acc.days[k]={})}
function put(acc,k,f,v){if(!has(v)||!k)return;day(acc,k)[f]=v;acc.count[f]=(acc.count[f]||new Set()).add(k)}
function bedFrom(start,wakeKey){const prevMid=dateOf(addDays(wakeKey,-1));return (start-prevMid)/36e5}

/* --- Health Auto Export (JSON) --- */
function importHAE(j,acc){
  const data=j.data||j,metrics=data.metrics||[],sums={},cnt={};
  const add=(k,f,v,op)=>{if(!has(v))return;const id=k+'|'+f;if(op==='sum'){sums[id]=(sums[id]||0)+v}else{sums[id]=(sums[id]||0)+v;cnt[id]=(cnt[id]||0)+1}};
  const map={step_count:['steps','sum'],resting_heart_rate:['rhr','avg'],heart_rate_variability:['hrv','avg'],heart_rate_variability_sdnn:['hrv','avg'],blood_oxygen_saturation:['spo2','avg'],oxygen_saturation:['spo2','avg'],respiratory_rate:['resp','avg'],active_energy:['kcal','sum'],flights_climbed:['floors','sum'],walking_running_distance:['dist','sum']};
  metrics.forEach(mt=>{const name=String(mt.name||'').toLowerCase(),rows=mt.data||[],units=String(mt.units||'').toLowerCase();
    if(map[name]){const[f,op]=map[name];rows.forEach(r=>{const d=pDate(r.date||r.startDate);if(!d)return;let v=+(r.qty??r.Avg??r.avg);if(!has(v))return;
      if(f==='spo2'&&v<=1)v*=100;if(f==='kcal'&&units==='kj')v/=4.184;if(f==='dist'&&units==='mi')v*=1.609;add(keyOf(d),f,v,op)})}
    else if(name==='heart_rate'){const byDay={};rows.forEach(r=>{const d=pDate(r.date||r.startDate);const v=+(r.Avg??r.avg??r.qty);if(!d||!has(v))return;(byDay[keyOf(d)]=byDay[keyOf(d)]||[]).push([d.getHours()*60+d.getMinutes(),Math.round(v)])});
      Object.entries(byDay).forEach(([k,a])=>{if(a.length>=12){a.sort((x,y)=>x[0]-y[0]);put(acc,k,'hr',a)}})}
    else if(name==='sleep_analysis'){
      const segRows=rows.filter(r=>r.value&&(r.startDate||r.start)),aggRows=rows.filter(r=>!r.value&&(r.sleepStart||r.totalSleep||r.asleep));
      aggRows.forEach(r=>{const st=pDate(r.sleepStart||r.inBedStart),en=pDate(r.sleepEnd||r.inBedEnd)||pDate(r.date);if(!en)return;const k=keyOf(en);
        const deep=+r.deep||0,rem=+r.rem||0,core=+(r.core??r.light)||0,aw=+r.awake||0,tot=+(r.totalSleep??r.asleep)||deep+rem+core;if(!tot)return;
        put(acc,k,'sleep',{bed:st?bedFrom(st,k):null,dur:tot,deep:deep||null,rem:rem||null,light:core||null,awake:aw||null})});
      if(segRows.length){const nights={};segRows.forEach(r=>{const a=pDate(r.startDate||r.start),b=pDate(r.endDate||r.end);if(!a||!b)return;let v=String(r.value).toLowerCase();
          const s=v.includes('deep')?'deep':v.includes('rem')?'rem':v.includes('awake')?'awake':v.includes('core')||v.includes('light')?'light':v.includes('asleep')?'light':null;if(!s)return;
          const wk=keyOf(b.getHours()<18?b:new Date(b.getTime()+864e5));(nights[wk]=nights[wk]||[]).push({s,a,b})});
        Object.entries(nights).forEach(([k,sg])=>{sg.sort((x,y)=>x.a-y.a);const tot={deep:0,light:0,rem:0,awake:0};const segs=sg.map(x=>{tot[x.s]+=(x.b-x.a)/36e5;return{s:x.s,a:bedFrom(x.a,k),b:bedFrom(x.b,k)}});
          const dur=tot.deep+tot.light+tot.rem;if(dur<1)return;put(acc,k,'sleep',{bed:segs[0].a,dur,deep:tot.deep||null,light:tot.light||null,rem:tot.rem||null,awake:tot.awake,segs})})}}});
  Object.entries(sums).forEach(([id,v])=>{const[k,f]=id.split('|');put(acc,k,f,cnt[id]?(f==='resp'?+(v/cnt[id]).toFixed(1):Math.round(v/cnt[id])):Math.round(v))});
  (data.workouts||[]).forEach(w=>{const a=pDate(w.start||w.startDate),b=pDate(w.end||w.endDate);if(!a)return;const k=keyOf(a);
    const min=has(+w.duration)?(+w.duration>600?+w.duration/60:+w.duration):b?(b-a)/6e4:null;
    const avg=+(w.avgHeartRate?.qty??w.heartRate?.avg?.qty??w.heartRate?.avg??w.averageHeartRate);const mx=+(w.maxHeartRate?.qty??w.heartRate?.max?.qty??w.heartRate?.max);
    const kc=+(w.activeEnergyBurned?.qty??w.activeEnergy?.qty);const kcal=has(kc)?(String(w.activeEnergyBurned?.units||'').toLowerCase()==='kj'?kc/4.184:kc):null;
    const dd=day(acc,k);(dd.wk=dd.wk||[]).push({type:w.name||'Workout',start:hOf(a),min:min?Math.round(min):null,avg:has(avg)?Math.round(avg):null,max:has(mx)?Math.round(mx):null,kcal:has(kcal)?Math.round(kcal):null});acc.count.wk=(acc.count.wk||new Set()).add(k)});
}

/* --- Garmin Connect account export (JSON files inside the ZIP) --- */
function importGarmin(j,acc){
  const seen=new Set();
  const walk=o=>{if(!o||typeof o!=='object'||seen.has(o))return;seen.add(o);if(Array.isArray(o)){o.forEach(walk);return}
    const cd=typeof o.calendarDate==='string'?o.calendarDate.slice(0,10):(o.calendarDate&&o.calendarDate.date)?String(o.calendarDate.date).slice(0,10):null;
    if(cd&&/^\d{4}-\d\d-\d\d$/.test(cd)){
      put(acc,cd,'steps',o.totalSteps);put(acc,cd,'rhr',o.restingHeartRate??o.currentDayRestingHeartRate);
      put(acc,cd,'kcal',o.activeKilocalories);put(acc,cd,'floors',has(o.floorsAscended)?Math.round(o.floorsAscended):has(o.floorsAscendedInMeters)?Math.round(o.floorsAscendedInMeters/3):null);
      put(acc,cd,'dist',has(o.totalDistanceMeters)?o.totalDistanceMeters/1000:null);
      const stressL=o.allDayStress?.aggregatorList?.find(a=>a.type==='TOTAL')||o.allDayStress;put(acc,cd,'stress',stressL?.averageStressLevel??o.averageStressLevel);
      const bbl=o.bodyBattery?.bodyBatteryStatList||[];put(acc,cd,'bbHi',bbl.find(b=>b.bodyBatteryStatType==='HIGHEST')?.statsValue??o.bodyBatteryHighestValue);
      put(acc,cd,'bbLo',bbl.find(b=>b.bodyBatteryStatType==='LOWEST')?.statsValue??o.bodyBatteryLowestValue);
      put(acc,cd,'spo2',o.averageSpo2??o.averageSpO2Value??o.avgSleepSpo2??o.averageSpO2);
      put(acc,cd,'resp',has(o.avgSleepRespirationValue)?+(+o.avgSleepRespirationValue).toFixed(1):has(o.averageRespiration)?+(+o.averageRespiration).toFixed(1):o.respiration?.avgSleepRespirationValue??null);
      put(acc,cd,'hrv',o.hrvSummary?.lastNightAvg??o.lastNightAvg??o.avgOvernightHrv);
      if(has(o.vo2MaxValue)||has(o.vo2Max)){const v=+(o.vo2MaxValue??o.vo2Max);if(v>10&&(!acc.vo2||cd>=acc.vo2.k))acc.vo2={k:cd,v:Math.round(v)}}
      if(has(o.fitnessAge)&&(!acc.fitAge||cd>=acc.fitAge.k))acc.fitAge={k:cd,v:Math.round(o.fitnessAge)};
      const ss=o.sleepStartTimestampGMT??o.sleepStartTimestampLocal,se=o.sleepEndTimestampGMT??o.sleepEndTimestampLocal;
      if(has(o.deepSleepSeconds)||has(o.lightSleepSeconds)||ss){const h=x=>has(x)?x/3600:null,deep=h(o.deepSleepSeconds),light=h(o.lightSleepSeconds),rem=h(o.remSleepSeconds),aw=h(o.awakeSleepSeconds);
        const local=o.sleepStartTimestampGMT==null;const st=ss!=null?(local?pDate(ss):pGMT(ss)):null,en=se!=null?(local?pDate(se):pGMT(se)):null;
        const dur=(deep||0)+(light||0)+(rem||0)||(st&&en?(en-st)/36e5-(aw||0):null);
        const sc=o.sleepScores?.overallScore??o.sleepScores?.overall?.value??o.overallSleepScore?.value??o.sleepScore;
        if(dur>1)put(acc,cd,'sleep',{bed:st?bedFrom(st,cd):null,dur,deep,light,rem,awake:aw,score:has(sc)?Math.round(sc):null})}}
    if(o.activityType&&(o.startTimeLocal||o.beginTimestamp||o.startTimeGmt)&&has(o.duration)){
      const a=pDate(o.startTimeLocal??o.beginTimestamp??o.startTimeGmt);if(a&&!isNaN(a)){const k=keyOf(a),min=o.duration>36000?o.duration/6e4:o.duration/60;
        const t=typeof o.activityType==='string'?o.activityType:(o.activityType.typeKey||'workout');const dd=day(acc,k);dd.wk=dd.wk||[];
        if(!dd.wk.some(w=>Math.abs(w.start-hOf(a))<.05))dd.wk.push({type:t.replace(/_/g,' ').replace(/^\w/,c=>c.toUpperCase()),start:hOf(a),min:Math.round(min),avg:has(o.avgHr)?Math.round(o.avgHr):has(o.averageHR)?Math.round(o.averageHR):null,max:has(o.maxHr)?Math.round(o.maxHr):has(o.maxHR)?Math.round(o.maxHR):null,kcal:has(o.calories)?Math.round(o.calories>20000?o.calories/4.184:o.calories):null});
        acc.count.wk=(acc.count.wk||new Set()).add(k)}}
    for(const v of Object.values(o))if(v&&typeof v==='object')walk(v)};
  walk(j)}

function sniff(j){const d=j&&(j.data||j);return d&&(Array.isArray(d.metrics)||Array.isArray(d.workouts))?'hae':'garmin'}
let jszip=null;
const loadZip=()=>jszip||(jszip=new Promise((ok,no)=>{if(window.JSZip)return ok(window.JSZip);const s=document.createElement('script');s.src='jszip.min.js';s.onload=()=>ok(window.JSZip);s.onerror=()=>{jszip=null;no(new Error('Could not load the ZIP reader. Close and reopen the app, then try again.'))};document.head.appendChild(s)}));
async function importFiles(files,progress){
  const acc=newAcc(),srcs=new Set();let nfiles=0;
  const handleJSON=(txt,name)=>{let j;try{j=JSON.parse(txt)}catch(e){return}const t=sniff(j);srcs.add(t==='hae'?'Apple Health':'Garmin');nfiles++;(t==='hae'?importHAE:importGarmin)(j,acc)};
  for(const f of files){
    if(/\.zip$/i.test(f.name)||f.type.includes('zip')){progress('Opening '+f.name+'…');const Z=await loadZip(),zip=await Z.loadAsync(f);
      const ents=Object.values(zip.files).filter(e=>!e.dir&&/\.json$/i.test(e.name)&&!/__MACOSX/.test(e.name));let i=0;
      for(const e of ents){i++;if(i%5===0)progress(`Reading file ${i} of ${ents.length}…`);handleJSON(await e.async('string'),e.name)}}
    else{progress('Reading '+f.name+'…');handleJSON(await f.text(),f.name)}}
  return{acc,srcs:[...srcs],nfiles}}
function mergeAcc(acc){
  Object.entries(acc.days).forEach(([k,v])=>{const d=REAL.days[k]=REAL.days[k]||{};
    Object.entries(v).forEach(([f,x])=>{if(f==='sleep'){d.sleep={...(d.sleep||{}),...Object.fromEntries(Object.entries(x).filter(([,y])=>has(y)))}}
      else if(f==='wk'){d.wk=d.wk||[];x.forEach(w=>{if(!d.wk.some(o=>Math.abs(o.start-w.start)<.05))d.wk.push(w)})}else d[f]=x})});
  if(acc.vo2&&(!REAL.vo2||acc.vo2.k>=REAL.vo2.k))REAL.vo2=acc.vo2;if(acc.fitAge&&(!REAL.fitAge||acc.fitAge.k>=REAL.fitAge.k))REAL.fitAge=acc.fitAge}

/* ================= formatting ================= */
const fmtH=h=>{if(!has(h))return '—';h=((h%24)+24)%24;let H=Math.floor(h),M=Math.round((h-H)*60);if(M===60){H=(H+1)%24;M=0}return `${H}:${String(M).padStart(2,'0')}`};
const fmtD=h=>has(h)?`${Math.floor(h)}h ${String(Math.round((h%1)*60)%60).padStart(2,'0')}m`:'—';
const wd=d=>d.toLocaleDateString('en',{weekday:'short'});
const lvl=v=>!has(v)?'none':v>=75?'good':v>=55?'warn':'bad';
const heroBg=v=>!has(v)?'var(--card)':v>=75?'var(--lime)':v>=55?'var(--amber)':'var(--rose)';
const dash=(v,f)=>has(v)?(f?f(v):v):'—';
const longDate=d=>d.toLocaleDateString('en',{weekday:'long',day:'numeric',month:'long'});

/* ================= charts ================= */
const charts=[];
function chart(el,draw){const s=el.querySelector('svg');const f=()=>{if(!el.offsetParent)return;const W=el.clientWidth,H=el.clientHeight;if(W)s.innerHTML=draw(W,H)};new ResizeObserver(f).observe(el);charts.push(f);return f}
const redraw=()=>charts.forEach(f=>f());
const path=p=>{let o='',pen=false;p.forEach(q=>{if(!q){pen=false;return}o+=(pen?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1);pen=true});return o};
function spark(vals,col){const v=nn(vals);if(v.length<2)return '';const lo=Math.min(...v),hi=Math.max(...v),x=i=>i/(vals.length-1)*44,y=q=>18-(q-lo)/((hi-lo)||1)*16;let li=vals.length-1;while(!has(vals[li]))li--;
  return `<svg class="sp" viewBox="0 0 44 18" aria-hidden="true"><path d="${path(vals.map((q,i)=>has(q)?[x(i),y(q)]:null))}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x(li)}" cy="${y(vals[li])}" r="2.5" fill="${col}"/></svg>`}
function trendSvg(W,H,vals,col,band,opt={}){const v=nn(vals);if(!v.length)return `<text x="${W/2}" y="${H/2}" text-anchor="middle">No data yet</text>`;
  const bb=band&&band.every(has)?band:null,lo=Math.min(...v,...(bb||[]))-2,hi=Math.max(...v,...(bb||[]))+2,L=30,R=42,B=22,n=vals.length,x=i=>L+(W-L-R)*i/Math.max(1,n-1),y=q=>8+(H-8-B)*(1-(q-lo)/(hi-lo));
  let o=bb?`<rect x="${L}" width="${W-L-R}" y="${y(bb[1])}" height="${Math.max(0,y(bb[0])-y(bb[1]))}" rx="6" fill="${css('--green')}" opacity=".12"/><text x="${L+8}" y="${y(bb[1])+16}" style="stroke:none">your normal</text>`:'';
  [Math.ceil(lo+2),Math.floor(hi-2)].forEach(q=>o+=`<text x="${L-6}" y="${y(q)+4}" text-anchor="end">${q}</text>`);
  const dd=opt.dates||[];[0,Math.floor((n-1)/2),n-1].forEach(i=>dd[i]&&(o+=`<text x="${x(i)}" y="${H-4}" text-anchor="${i?i===n-1?'end':'middle':'start'}">${dd[i].toLocaleDateString('en',{day:'numeric',month:'short'})}</text>`));
  o+=`<path d="${path(vals.map((q,i)=>has(q)?[x(i),y(q)]:null))}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
  if(v.length<n)o+=vals.map((q,i)=>has(q)&&!has(vals[i-1])&&!has(vals[i+1])?`<circle cx="${x(i)}" cy="${y(q)}" r="2.5" fill="${col}"/>`:'').join('');
  if(opt.marks)o+=vals.map((q,i)=>has(q)&&opt.marks[i]?`<circle cx="${x(i)}" cy="${y(q)}" r="3.5" fill="${css('--coral')}"/>`:'').join('');
  let li=n-1;while(!has(vals[li]))li--;o+=`<circle cx="${x(li)}" cy="${y(vals[li])}" r="5" fill="${col}" stroke="${opt.bg||css('--card')}" stroke-width="2"/><text x="${x(li)+9}" y="${y(vals[li])+5}" style="fill:var(--ink);font-weight:700">${opt.fmt?opt.fmt(vals[li]):vals[li]}</text>`;return o}

/* ================= metric library ================= */
const GX='Comes from Garmin’s data export (Settings → Your data).',AH='Comes from Apple Health or Garmin’s data export.';
const M={
 ready:{n:'Readiness',u:'',v:d=>d.ready,band:()=>[55,100],good:'up',src:'Needs at least 4 days of HRV or resting heart rate to learn your normal.',what:'One number for how prepared your body is today. It blends overnight HRV, resting heart rate, sleep and recent training load, each compared with your own normal.',moves:'Higher after good sleep, low stress and rest days. Lower after alcohol, late nights, illness or several hard sessions in a row.',tip:'Push when it is green, keep it moderate when it is yellow, recover when it is red.'},
 bb:{n:'Body Battery',u:'',v:d=>d.bbHi,label:'Daily peak',band:()=>[70,100],good:'up',src:GX,what:'Garmin’s estimate of your energy reserve from 5 to 100. It charges while you rest and drains with activity and stress.',moves:'Charges fastest in deep sleep. Drains with workouts, stress, illness and alcohol.',tip:'If it rarely charges above 70 overnight, start with your sleep and evening routine.'},
 stress:{n:'Stress',u:'',v:d=>d.stress,label:'Daily average',band:()=>[0,40],good:'down',src:GX,what:'From 0 to 100, measured from heart rate variability while you are still. Under 25 is resting, 26–50 low, 51–75 medium, above 75 high.',moves:'Work pressure, caffeine, dehydration, poor sleep and being unwell all raise it.',tip:'Two minutes of slow breathing (4 seconds in, 6 out) usually lowers it within minutes.'},
 steps:{n:'Steps',u:'',v:d=>d.steps,band:()=>[S.stepGoal,S.stepGoal*1.6],good:'up',src:AH,fmt:v=>Math.round(v).toLocaleString(),what:'Counted by the band’s accelerometer from your wrist movement.',moves:'Walks, errands and stairs. Cycling and some gym work count poorly.',tip:'A 10-minute walk after each meal adds about 3,000 steps.'},
 rhr:{n:'Resting heart rate',u:'bpm',v:d=>d.rhr,band:i=>{const b=base(i,'rhr');return b.n>=4?[Math.round(b.m-b.s),Math.round(b.m+b.s)]:[null,null]},good:'down',src:AH,what:'Your lowest steady heart rate of the day, usually during sleep. Lower generally means a fitter, more relaxed heart.',moves:'Rises 3–5 bpm after alcohol, poor sleep, heat, stress or when you are getting ill. Falls slowly as fitness improves.',tip:'A jump of 5+ bpm above your normal for two days is a cue to rest.'},
 hrv:{n:'HRV',u:'ms',v:d=>d.hrv,band:i=>{const b=base(i,'hrv');return b.n>=4?[Math.round(b.m-b.s),Math.round(b.m+b.s)]:[null,null]},good:'up',src:'Comes from Garmin’s data export, or Apple Health if Garmin shares HRV there.',what:'Heart rate variability: tiny changes in time between heartbeats, averaged overnight. Higher means your body is recovered and relaxed.',moves:'Drops with alcohol, late meals, hard training, stress and illness. Rises with good sleep and rest.',tip:'Only compare it with your own normal range; values differ hugely between people.'},
 sleep:{n:'Sleep score',u:'',v:d=>d.score,band:()=>[75,100],good:'up',src:AH,what:'A 0–100 score for the night. Uses Garmin’s own score when your export has it, otherwise Cirqa works one out from duration and deep sleep.',moves:'Consistent bedtimes, a cool dark room and no alcohol help most.',tip:'Going to bed within the same 30-minute window every night is the biggest lever.'},
 spo2:{n:'Blood oxygen',u:'%',v:d=>d.spo2,band:()=>[95,100],good:'up',src:AH,what:'How saturated your blood is with oxygen, from the band’s pulse ox sensor. 95–100% is typical.',moves:'High altitude, congestion and breathing pauses in sleep lower it.',tip:'Regular overnight dips below 90% are worth mentioning to a doctor.'},
 resp:{n:'Breathing rate',u:'/min',v:d=>d.resp,band:i=>{const b=base(i,'resp');return b.n>=4?[+(b.m-.5).toFixed(1),+(b.m+.5).toFixed(1)]:[null,null]},good:'down',src:AH,fmt:v=>(+v).toFixed(1),what:'Breaths per minute, averaged overnight. Usually 12–20 and very stable for each person.',moves:'Fever, infection and alcohol push it up.',tip:'A rise of 1+ breath per minute over your normal is one of the earliest signs of getting ill.'},
 load:{n:'Training load ratio',u:'',v:d=>has(d.acwr)?+d.acwr.toFixed(2):null,band:()=>[.8,1.3],good:'mid',src:'Needs two weeks of workouts from your export.',fmt:v=>(+v).toFixed(2),what:'Your training over the last 7 days divided by your 4-week average, from workout duration and heart rate.',moves:'Hard weeks push it up; rest weeks bring it down.',tip:'Stay between 0.8 and 1.3. Above 1.5, injury risk rises sharply.'},
};
const bandOf=(k,i)=>M[k].band(i);
function status(k,val,i){if(!has(val))return['mut','No data'];const b=bandOf(k,i);if(!b.every(has))return['mut','Learning your normal'];
  if(M[k].good==='down')return val<=b[1]?['good','In range']:['bad','Above your range'];if(M[k].good==='mid')return val<b[0]?['warn','Low']:val>b[1]?['bad','High']:['good','In range'];
  return val>=b[0]?['good',val>b[1]?'Above your range':'In range']:[val>=b[0]*.85?'warn':'bad','Below your range']}

/* ================= sheet ================= */
let sheetClose=null;
function openSheet(html,onClose){const sh=$('#sheet'),sc=$('#scrim');$('#sbody').innerHTML=html;$('#sbody').scrollTop=0;sh.hidden=sc.hidden=false;requestAnimationFrame(()=>{sh.classList.add('on');sc.classList.add('on')});sheetClose=onClose||null;document.body.style.overflow='hidden';setTimeout(redraw,60)}
function closeSheet(){const sh=$('#sheet'),sc=$('#scrim');sh.classList.remove('on');sc.classList.remove('on');sh.style.transform='';document.body.style.overflow='';setTimeout(()=>{if(sh.classList.contains('on'))return;sh.hidden=sc.hidden=true;$('#sbody').innerHTML='';for(let i=charts.length-1;i>=0;i--)if(charts[i].sheet)charts.splice(i,1)},300);if(sheetClose){const f=sheetClose;sheetClose=null;f()}}
$('#scrim').onclick=closeSheet;
addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#sheet').hidden)closeSheet()});
{let y0=null,dy=0;const g=$('#grab'),sh=$('#sheet');g.addEventListener('pointerdown',e=>{y0=e.clientY;sh.style.transition='none';g.setPointerCapture(e.pointerId)});
 g.addEventListener('pointermove',e=>{if(y0==null)return;dy=Math.max(0,e.clientY-y0);sh.style.transform=`translateY(${dy}px)`});
 g.addEventListener('pointerup',()=>{sh.style.transition='';if(dy>90)closeSheet();else sh.style.transform='';y0=null;dy=0})}
const xBtn=`<button class="ibtn" data-close aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
$('#sbody').addEventListener('click',e=>{if(e.target.closest('[data-close]'))closeSheet()});
function swapSheet(fn){if(!$('#sheet').hidden){closeSheet();setTimeout(fn,330)}else fn()}

function metricSheet(k){const m=M[k],f=m.fmt||(v=>v),from=Math.max(0,sel-29),win=days.slice(from,sel+1),vals=win.map(d=>m.v(d)),val=m.v(days[sel]),[c,t]=status(k,val,sel),b=bandOf(k,sel),v=nn(vals);
  const basis=k==='ready'&&has(val)?`<p class="note" style="margin-top:6px">Based on ${days[sel].readyParts.join(', ')}.</p>`:'';
  const ssrc=k==='sleep'&&has(val)?`<p class="note" style="margin-top:6px">${days[sel].scoreSrc==='Garmin'?'Garmin’s sleep score':'Worked out by Cirqa (no Garmin score in your data)'}.</p>`:'';
  openSheet(`<div class="shead"><div><div class="mut" style="font-weight:600">${esc(m.label||m.n)} · ${esc(days[sel].d.toLocaleDateString('en',{weekday:'long',day:'numeric',month:'short'}))}</div><h2 style="font-size:26px;margin:2px 0 8px">${esc(m.n)}</h2></div>${xBtn}</div>
   <div class="sbig">${dash(val,f)} <i>${has(val)?esc(m.u):''}</i></div><div class="st ${c}" style="font-weight:600;margin-top:6px">${t}</div>${basis}${ssrc}
   ${!has(val)?`<div class="box"><b>Where this comes from</b><p class="note" style="margin-top:4px">${esc(m.src)}</p></div>`:''}
   <div class="sec"><h3>Last ${win.length} days</h3><div class="fig s" id="shFig"><svg></svg></div></div>
   <div class="kv"><button class="ro">Average<b>${v.length?f(+mean(v).toFixed(k==='resp'?1:k==='load'?2:0)):'—'}</b></button><button class="ro">Your range<b>${b.every(has)?b.map(f).join('–'):'—'}</b></button><button class="ro">Best<b>${v.length?f(m.good==='down'?Math.min(...v):Math.max(...v)):'—'}</b></button></div>
   <div class="sec"><h3>What it is</h3><p>${esc(m.what)}</p></div><div class="sec"><h3>What moves it</h3><p>${esc(m.moves)}</p></div><div class="sec"><h3>Try this</h3><p>${esc(m.tip)}</p></div>`);
  const f2=chart($('#shFig'),(W,H)=>trendSvg(W,H,vals,css('--violet'),b,{dates:win.map(d=>d.d),fmt:f,bg:css('--card2'),marks:k==='hrv'||k==='rhr'?win.map(d=>(d.tags||[]).includes('Alcohol')):null}));f2.sheet=true;f2()}

/* ================= header & tabs ================= */
const TABS=[['today','Today','<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],['sleep','Sleep','<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'],['heart','Heart','<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'],['move','Move','<circle cx="13.5" cy="4.5" r="1.6"/><path d="M9 21l2.2-6 3 3v3M7 12l3.2-3 3 1 2 3h3M11.2 15l-1-4"/>'],['log','Log','<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>']];
const titles={today:'Today',sleep:'Sleep',heart:'Heart',move:'Movement',log:'Daily log'};
let view='today';
$('#tabs').innerHTML=TABS.map(t=>`<button data-v="${t[0]}" aria-label="${t[1]}"><svg viewBox="0 0 24 24">${t[2]}</svg>${t[1]}</button>`).join('');
function greet(){const h=new Date().getHours();return (h<12?'Good morning':h<18?'Good afternoon':'Good evening')+(S.name?', '+S.name:'')}
function go(v){if(!titles[v])v='today';view=v;$$('.view').forEach(s=>s.hidden=s.dataset.v!==v);$$('#tabs button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===v));
  $('#ttl').textContent=v==='today'&&days[sel].key!==TODAY?wd(days[sel].d)+' '+days[sel].d.getDate():titles[v];$('#mini').textContent=$('#ttl').textContent;
  $('#sub').textContent=v==='today'&&days[sel].key===TODAY?greet():longDate(v==='log'?new Date():(v==='sleep'||v==='today')?days[sel].d:days[N-1].d);
  if(location.hash.slice(1)!==v)history.replaceState(null,'','#'+v);window.scrollTo(0,0);requestAnimationFrame(redraw)}
$('#tabs').onclick=e=>{const b=e.target.closest('button');if(b)go(b.dataset.v)};
addEventListener('hashchange',()=>go(location.hash.slice(1)));
new IntersectionObserver(([e])=>$('#mini').classList.toggle('on',!e.isIntersecting)).observe($('#sentinel'));

/* ================= date strips ================= */
function renderDays(){const h=days.slice(-7).map((d,j)=>{const i=N-Math.min(7,N)+j;return `<button data-i="${i}" aria-pressed="${i===sel}" aria-label="${d.d.toDateString()}"><small>${d.key===TODAY?'Today':wd(d.d)}</small><b>${d.d.getDate()}</b><i style="background:${has(d.ready)?`var(--${({good:'green',warn:'amber',bad:'coral'})[lvl(d.ready)]})`:'var(--line)'}"></i></button>`}).join('');$('#days1').innerHTML=$('#days2').innerHTML=h}
document.addEventListener('click',e=>{const b=e.target.closest('.days button');if(!b)return;sel=+b.dataset.i;hover=null;renderAll();go(view)});

/* ================= today ================= */
let shownReady=0,dk='hr',hover=null;
function renderBanner(){
  if(!isReal())$('#banner').innerHTML=`<div class="banner"><div><b>You’re looking at sample data</b><span>Connect your Garmin to see your real numbers.</span></div><button class="pbtn" data-guide>Connect</button></div>`;
  else{const last=Object.keys(REAL.days).sort().at(-1),stale=last<addDays(TODAY,-1);
    $('#banner').innerHTML=`<div class="row" style="margin:-4px 0 10px"><span class="src"><i style="${stale?'background:var(--amber)':''}"></i>Your data · up to ${esc(dateOf(last).toLocaleDateString('en',{day:'numeric',month:'short'}))}</span>${stale?'<button class="pbtn alt" data-guide style="padding:6px 12px;min-height:36px;font-size:13px">Update</button>':''}</div>`}}
function renderToday(){const d=days[sel],mins=d.hr||[];renderBanner();
  const rr=has(d.ready)?d.ready:0,sc=has(d.score)?d.score:0,ld=has(d.acwr)?clamp(d.acwr/1.6*100,0,100):0;
  const rings=[{v:rr,r:64,c:'#121a05',w:12},{v:sc,r:47,c:'#f2482a',w:10},{v:ld,r:32,c:'#0f4a35',w:10}];
  $('#dial').innerHTML=rings.map(o=>{const C=2*Math.PI*o.r;return `<circle cx="75" cy="75" r="${o.r}" fill="none" stroke="${has(d.ready)?'#121a05':css('--ink')}" stroke-opacity=".12" stroke-width="${o.w}"/><circle cx="75" cy="75" r="${o.r}" fill="none" stroke="${o.c}" stroke-width="${o.w}" stroke-linecap="round" stroke-dasharray="${C*o.v/100} ${C}" transform="rotate(-90 75 75)" style="transition:stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)"/>`}).join('');
  $('#hero').style.background=heroBg(d.ready);$('#hero').style.color=has(d.ready)?'var(--hero-ink)':'var(--ink)';
  if(has(d.ready)){const from=shownReady,to=d.ready,t0=performance.now();shownReady=to;const step=t=>{const p=Math.min(1,(t-t0)/600),e=1-(1-p)**3;$('#rdy').textContent=Math.round(from+(to-from)*e);if(p<1)requestAnimationFrame(step)};requestAnimationFrame(step)}else{$('#rdy').textContent='—';shownReady=0}
  $('#rdyTxt').textContent=!has(d.ready)?(base(sel,'hrv').n<4&&base(sel,'rhr').n<4?'Learning your normal. Readiness appears after about 4 days of HRV or resting heart rate.':'No HRV or resting heart rate for this day yet.'):d.ready>=75?'Primed. Your body is well recovered, so it’s a good day to push.':d.ready>=55?'Steady. A moderate effort will do you good.':'Recovering. Keep it easy and get to bed early.';
  $('#legend').innerHTML=`<span><i style="background:#121a05"></i>Ready ${dash(d.ready)}</span><span><i style="background:#f2482a"></i>Sleep ${dash(d.score)}</span><span><i style="background:#0f4a35"></i>Load ${dash(d.acwr,v=>v.toFixed(2))}</span>`;
  // plan
  const wakes=nn(days.slice(Math.max(0,sel-6),sel+1).map(x=>x.sleep&&has(x.sleep.bed)&&has(x.sleep.dur)?x.sleep.bed+x.sleep.dur+(x.sleep.awake||0)-24:null)),wakeAvg=wakes.length?mean(wakes):7,bedT=wakeAvg+24-S.sleepGoal-Math.min(.5,(d.debt||0)/6)-.25;
  const train=!has(d.ready)?['Train by feel','Readiness needs a few days of data. Until then, go by how you feel.']:d.ready>=75?['Go hard','Intervals or a tempo run. Aim for 15–20 min in zones 4–5 (above '+Math.round(maxHR()*.8)+' bpm).']:d.ready>=55?['Keep it moderate','30–45 min in zone 2 ('+Math.round(maxHR()*.6)+'–'+Math.round(maxHR()*.7)+' bpm). You should be able to talk.']:['Recover','A gentle walk, stretching or a full rest day.'];
  const isToday=d.key===TODAY,wl=isToday?logFor(TODAY).water:0;
  $('#plan').innerHTML=[
    ['var(--lime)','<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',train[0],train[1],'ready'],
    ['#c9d7ff','<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>','Lights out by '+fmtH(bedT),wakes.length?`For ${S.sleepGoal} hours before your usual ${fmtH(wakeAvg)} wake-up${(d.debt||0)>.5?', plus a little extra for your sleep debt':''}.`:`For ${S.sleepGoal} hours of sleep before a 7:00 wake-up.`,'sleep'],
    ['#bfeee0','<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',`Drink ${(S.waterGoal/1000).toFixed(1)} L`,isToday?`${wl.toLocaleString()} ml logged so far. Tap to add more.`:'Your daily water target.','water']
  ].map(p=>`<div class="pl tap" data-plan="${p[4]}"><div class="ic" style="background:${p[0]}"><svg viewBox="0 0 24 24">${p[1]}</svg></div><div><b>${esc(p[2])}</b><span>${esc(p[3])}</span></div></div>`).join('');
  // chips
  const keys=['bb','stress','steps','rhr','hrv','sleep','spo2','resp'];
  $('#chips').innerHTML=keys.map(k=>{const m=M[k],w=days.slice(Math.max(0,sel-6),sel+1).map(x=>m.v(x)),val=w.at(-1),[c,t]=status(k,val,sel),f=m.fmt||(v=>v);
    const shown=k==='sleep'?(d.sleep&&has(d.sleep.dur)?fmtD(d.sleep.dur):'—'):dash(val,f),unit=k==='sleep'||!has(val)?'':m.u;
    const name=k==='sleep'?'Sleep':m.n;
    return `<button class="chip" data-m="${k}"><small>${esc(name)}</small>${spark(w,css(c==='good'?'--green':c==='warn'?'--amber':c==='bad'?'--coral':'--mut'))}<div class="num">${shown} <i>${esc(unit)}</i></div><span class="d st ${c}">${k==='sleep'&&has(d.score)?'Score '+d.score:t}</span></button>`}).join('');
  // minute chart
  const avail=['hr','stress','bb'].filter(k=>(d[{hr:'hr',stress:'st',bb:'bb'}[k]]||[]).length);
  $$('#daySeg button').forEach(b=>b.hidden=!avail.includes(b.dataset.k));
  if(avail.length&&!avail.includes(dk))dk=avail[0];
  $('#dayFig').hidden=$('#dayRead').hidden=!avail.length;$('#dayEmpty').hidden=!!avail.length;
  $('#dayEmpty').textContent=isReal()?'No minute-by-minute data for this day. In Health Auto Export, export Heart Rate with the time grouping set to minutes or hours to see your day here.':'';
  if(avail.length){$$('#daySeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.k===dk));drawDay()}
  // insights
  const ins=[],bh=base(sel,'hrv');
  if(has(d.hrv)&&bh.n>=4){const z=(d.hrv-bh.m)/bh.s;ins.push([z>=0?'--green':'--coral',z>=.5?'HRV is above your normal':z>-1?'HRV is in your normal range':'HRV is below your normal',`${d.hrv} ms vs your usual ${Math.round(bh.m)} ms.${z<-1?' Something is taxing your recovery. Check the Log tab for clues.':' Your nervous system is recovering well.'}`,'hrv'])}
  if(d.wk&&d.wk.length){const w=d.wk.reduce((a,b)=>(b.min||0)>(a.min||0)?b:a),pk=w.max||(mins.length?Math.max(...mins.map(x=>x[1])):null);
    ins.push(['--coral',`${w.type}${w.min?', '+w.min+' min':''}`,[pk?`Peaked at ${pk} bpm`:null,w.avg?`averaged ${w.avg} bpm`:null,w.kcal?`${w.kcal} kcal`:null].filter(Boolean).join(', ').replace(/^\w/,c=>c.toUpperCase())+(pk&&pk>=maxHR()*.9?'. That’s near your max, so keep tomorrow easier.':'.'),'move'])}
  else if(has(d.steps))ins.push(['--blue','No workout recorded',`${Math.round(d.steps).toLocaleString()} steps. Rest days are when fitness actually builds.`,'move']);
  const st=(d.st||[]).filter(x=>x[1]>=0);if(st.length>30){let bw=0,bs=0;for(let j=0;j+18<st.length;j++){const s=mean(st.slice(j,j+18).map(x=>x[1]));if(s>bs){bs=s;bw=j}}
    ins.push(['--violet','Most stressed '+fmtH(st[bw][0]/60)+'–'+fmtH(st[bw][0]/60+1.5),`Average stress ${Math.round(bs)} in that window. A short walk or breathing break there could help.`,'stress'])}
  else if(has(d.stress))ins.push(['--violet',`Average stress ${d.stress}`,d.stress<=25?'Mostly resting. Nicely calm day.':d.stress<=50?'Low stress overall.':'A fairly stressful day. Protect your evening wind-down.','stress']);
  if(has(d.debt))ins.push([d.debt>2?'--coral':'--blue','Sleep debt: '+fmtD(d.debt),`Across the last 7 nights against your ${S.sleepGoal}-hour goal.${d.debt>1?' An early night tonight would clear a good part of it.':' You’re well rested.'}`,'sleep']);
  if(has(d.rhr)&&base(sel,'rhr').n>=4&&d.rhr-base(sel,'rhr').m>=4)ins.unshift(['--coral','Resting heart rate is raised',`${d.rhr} bpm, about ${Math.round(d.rhr-base(sel,'rhr').m)} above your normal. Common after alcohol, poor sleep or when you’re getting ill.`,'rhr']);
  $('#ins').innerHTML=ins.length?ins.map(i=>`<button class="in" data-go="${i[3]}"><span style="background:var(${i[0]})"></span><div><h3>${esc(i[1])}</h3><p>${esc(i[2])}</p></div><svg viewBox="0 0 16 16"><path d="M6 3l5 5-5 5"/></svg></button>`).join(''):`<p class="empty">No data for this day yet.</p>`;
}
const dkCfg={hr:{f:'hr',lo:40,hi:180,c:'--coral',u:'bpm',n:'heart rate'},stress:{f:'st',lo:0,hi:100,c:'--violet',u:'',n:'stress'},bb:{f:'bb',lo:0,hi:100,c:'--green',u:'',n:'Body Battery'}};
const drawDay=chart($('#dayFig'),(W,H)=>{const d=days[sel],cfg=dkCfg[dk],ser=d[cfg.f]||[];if(!ser.length)return '';const L=30,R=8,Tp=10,B=24,vs=ser.map(p=>p[1]).filter(v=>v>=0),lo=dk==='hr'?Math.min(40,Math.floor(Math.min(...vs)/10)*10):0,hi=dk==='hr'?Math.max(160,Math.ceil(Math.max(...vs)/10)*10):100,x=m=>L+(W-L-R)*m/1440,y=v=>Tp+(H-Tp-B)*(1-(v-lo)/(hi-lo)),col=css(cfg.c);let o='';
  const sl=d.sleep;if(sl&&has(sl.bed)&&has(sl.dur)){const wake=(sl.bed+sl.dur+(sl.awake||0)-24)*60;if(wake>0)o+=`<rect x="${x(0)}" y="${Tp}" width="${x(wake)-x(0)}" height="${H-Tp-B}" rx="8" fill="${css('--blue')}" opacity=".08"/><text x="${x(wake/2)}" y="${Tp+16}" text-anchor="middle">asleep</text>`}
  [lo,(lo+hi)/2,hi].forEach(v=>o+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="${css('--line')}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${Math.round(v)}</text>`);
  for(let h=0;h<24;h+=W<520?6:3)o+=`<text x="${x(h*60)}" y="${H-6}" text-anchor="${h?'middle':'start'}">${h}:00</text>`;
  const gap=ser.length>1?Math.max(10,(ser[1][0]-ser[0][0])*3):60;
  if(dk==='stress'){const bw=Math.max(1,(W-L-R)/288-.5);o+=ser.filter(p=>p[1]>=0).map(p=>`<rect x="${x(p[0])}" y="${y(p[1])}" width="${bw}" height="${y(0)-y(p[1])}" fill="${col}"/>`).join('')}
  else{const pts=[];ser.forEach((p,i)=>{if(i&&p[0]-ser[i-1][0]>gap)pts.push(null);pts.push([x(p[0]),y(p[1])])});o+=`<path d="${path(pts)}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/>`}
  if(hover!=null&&ser[hover]){const p=ser[hover];o+=`<line x1="${x(p[0])}" x2="${x(p[0])}" y1="${Tp}" y2="${H-B}" stroke="${css('--ink')}"/><circle cx="${x(p[0])}" cy="${y(Math.max(0,p[1]))}" r="6" fill="${col}" stroke="${css('--card')}" stroke-width="2.5"/>`}
  return o});
function setDay(k){dk=k;hover=null;$('#dayRead').textContent='Slide your finger along the chart';$$('#daySeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.k===k));drawDay()}
$('#daySeg').onclick=e=>{const b=e.target.closest('button');if(b)setDay(b.dataset.k)};
{const f=$('#dayFig'),scrub=e=>{const ser=days[sel][dkCfg[dk].f]||[];if(!ser.length)return;const r=f.getBoundingClientRect(),m=clamp((e.clientX-r.left-30)/(r.width-38)*1440,0,1440);let bi=0;ser.forEach((p,i)=>{if(Math.abs(p[0]-m)<Math.abs(ser[bi][0]-m))bi=i});hover=bi;const p=ser[bi],c=dkCfg[dk];
  $('#dayRead').innerHTML=`${fmtH(p[0]/60)} · ${p[1]<0?'active, not measured':`<b>${p[1]}</b> ${c.u} ${c.n}`}`;drawDay()};
 f.addEventListener('pointermove',scrub);f.addEventListener('pointerdown',scrub)}
$('#hero').onclick=()=>metricSheet('ready');

/* ================= sleep ================= */
const stCol={awake:'--coral',rem:'--violet',light:'--blue',deep:'--green'},stY={awake:0,rem:1,light:2,deep:3};
function renderSleep(){const d=days[sel],sl=d.sleep;
  $('#slpTtl').textContent=d.key===TODAY?'Last night':'Night before '+wd(d.d);
  const ok=sl&&has(sl.dur);$('#slpSum').textContent=ok?(has(sl.bed)?`${fmtH(sl.bed)} – ${fmtH(sl.bed+sl.dur+(sl.awake||0))} · `:'')+fmtD(sl.dur):'';
  $('#hypFig').hidden=!(ok&&sl.segs&&sl.segs.length);
  const stg=ok&&['deep','rem','light'].some(s=>has(sl[s]));
  $('#stageBars').innerHTML=!ok?`<p class="empty">No sleep recorded for this night.</p>`:stg?['deep','rem','light','awake'].map(s=>`<div class="bar"><span>${s==='rem'?'REM':s[0].toUpperCase()+s.slice(1)}</span><div class="t"><div style="width:${has(sl[s])?Math.min(100,sl[s]/sl.dur*160):0}%;background:var(${stCol[s]})"></div></div><b>${fmtD(sl[s])}</b></div>`).join('')+`<p class="note">Healthy ranges: deep 13–23%, REM 20–25% of the night.</p>`:`<p class="note">Your data has total sleep but not sleep stages.</p>`;
  const sb=ok?[['Duration',Math.round(clamp(sl.dur/S.sleepGoal*100,0,100))],has(sl.deep)?['Deep sleep',Math.round(clamp(sl.deep/sl.dur/.2*90,0,100))]:null,has(sl.rem)?['REM',Math.round(clamp(sl.rem/sl.dur/.24*90,0,100))]:null,has(sl.awake)?['Restfulness',Math.round(clamp(100-sl.awake*60/1.2,0,100))]:null,has(sl.bed)?['Timing',Math.round(clamp(100-Math.abs(((sl.bed+1)%24)-0)*25,0,100))]:null,has(d.hrv)&&base(sel,'hrv').n>=4?['Recovery (HRV)',Math.round(clamp(70+(d.hrv-base(sel,'hrv').m)/base(sel,'hrv').s*12,0,100))]:null].filter(Boolean):[];
  $('#scoreBars').innerHTML=sb.length?sb.map(s=>`<div class="bar"><span style="grid-column:1/3">${s[0]}</span><b class="${lvl(s[1])}">${s[1]}</b><div class="t" style="grid-column:1/-1"><div style="width:${s[1]}%;background:var(--ink)"></div></div></div>`).join(''):`<p class="empty">Nothing to score for this night.</p>`;
  const beds=nn(days.slice(Math.max(0,sel-13),sel+1).map(x=>x.sleep&&x.sleep.bed)),bedSd=beds.length>2?sd(beds)*60:null;
  const mids=nn(days.slice(Math.max(0,sel-13),sel+1).map(x=>x.sleep&&has(x.sleep.bed)?x.sleep.bed+x.sleep.dur/2-24:null)),mid=mids.length>2?mean(mids):null;
  $('#slpKv').innerHTML=[['Sleep score',dash(d.score),'sleep'],['Sleep debt (7d)',fmtD(d.debt)],['Bedtime spread',has(bedSd)?`±${Math.round(bedSd)} min`:'—'],['Blood oxygen',dash(d.spo2,v=>v+'%'),'spo2'],['Breathing',dash(d.resp,v=>v+'/min'),'resp'],['Chronotype',!has(mid)?'—':mid<3?'Early bird':mid<4.5?'In between':'Night owl']].map(k=>`<button ${k[2]?`data-m="${k[2]}"`:'class="ro"'}>${k[0]}<b>${k[1]}</b></button>`).join('');
  requestAnimationFrame(redraw)}
chart($('#hypFig'),(W,H)=>{const sl=days[sel].sleep;if(!sl||!sl.segs||!sl.segs.length)return '';const a0=sl.segs[0].a,a1=sl.segs.at(-1).b,L=54,B=22,x=t=>L+(W-L-6)*(t-a0)/(a1-a0),rh=(H-B)/4;let o='';
  Object.keys(stY).forEach(s=>o+=`<text x="0" y="${stY[s]*rh+rh/2+4}">${s==='rem'?'REM':s[0].toUpperCase()+s.slice(1)}</text>`);
  o+=sl.segs.map(h=>`<rect x="${x(h.a)}" y="${stY[h.s]*rh+4}" width="${Math.max(1.5,x(h.b)-x(h.a))}" height="${rh-8}" rx="4" fill="${css(stCol[h.s])}"/>`).join('');
  for(let t=Math.ceil(a0);t<a1;t+=W<520?2:1)o+=`<text x="${x(t)}" y="${H-4}" text-anchor="middle">${fmtH(t)}</text>`;return o});
chart($('#consFig'),(W,H)=>{const s0=Math.max(0,sel-13),d14=days.slice(s0,sel+1),L=40,B=22,ns=d14.filter(d=>d.sleep&&has(d.sleep.bed));if(!ns.length)return `<text x="${W/2}" y="${H/2}" text-anchor="middle">No bedtimes in your data yet</text>`;
  const lo=Math.min(21.5,Math.floor(Math.min(...ns.map(d=>d.sleep.bed)))),hi=Math.max(31,Math.ceil(Math.max(...ns.map(d=>d.sleep.bed+d.sleep.dur)))),yv=h=>10+(H-10-B)*(h-lo)/(hi-lo),bw=(W-L)/d14.length;let o='';
  for(let h=Math.ceil(lo/2)*2;h<=hi;h+=2)o+=`<line x1="${L}" x2="${W}" y1="${yv(h)}" y2="${yv(h)}" stroke="${css('--line')}"/><text x="${L-6}" y="${yv(h)+4}" text-anchor="end">${fmtH(h)}</text>`;
  o+=d14.map((d,i)=>(d.sleep&&has(d.sleep.bed)?`<rect x="${L+i*bw+bw*.2}" y="${yv(d.sleep.bed)}" width="${bw*.6}" height="${yv(d.sleep.bed+d.sleep.dur)-yv(d.sleep.bed)}" rx="${Math.min(6,bw*.3)}" fill="${css(d.sleep.bed>24?'--coral':'--blue')}" opacity="${s0+i===sel?1:.75}"/>`:'')+(W>=520||i%2===(d14.length-1)%2?`<text x="${L+i*bw+bw/2}" y="${H-4}" text-anchor="middle">${wd(d.d).slice(0,2)}</text>`:'')).join('');return o});

/* ================= heart ================= */
const last30=()=>days.slice(-30);
chart($('#hrvFig'),(W,H)=>trendSvg(W,H,last30().map(d=>d.hrv),css('--violet'),M.hrv.band(N-1),{dates:last30().map(d=>d.d),marks:last30().map(d=>(d.tags||[]).includes('Alcohol'))}));
chart($('#rhrFig'),(W,H)=>trendSvg(W,H,last30().map(d=>d.rhr),css('--coral'),M.rhr.band(N-1),{dates:last30().map(d=>d.d),marks:last30().map(d=>(d.tags||[]).includes('Alcohol'))}));
const latest=f=>{for(let i=N-1;i>=0;i--)if(has(typeof f==='function'?f(days[i]):days[i][f]))return i;return -1};
function renderHeart(){
  const ih=latest('hrv'),ir=latest('rhr');
  $('#hrvRead').innerHTML=ih<0?'No HRV in your data yet. It comes from Garmin’s data export.':`<b>${days[ih].hrv} ms</b> ${days[ih].key===TODAY?'last night':'on '+days[ih].d.toLocaleDateString('en',{day:'numeric',month:'short'})} · red dots are nights after drinks`;
  $('#rhrRead').innerHTML=ir<0?'No resting heart rate in your data yet.':`<b>${days[ir].rhr} bpm</b> ${days[ir].key===TODAY?'today':'on '+days[ir].d.toLocaleDateString('en',{day:'numeric',month:'short'})}${base(N,'rhr').n?` · average ${base(N,'rhr').m.toFixed(1)}`:''}`;
  const iz=latest(d=>d.hr&&d.hr.length?1:null),mx=maxHR();
  if(iz<0){$('#zones').innerHTML='<p class="empty">Needs minute-by-minute heart rate. Export Heart Rate from Health Auto Export grouped by minutes.</p>';$('#zNote').textContent=''}
  else{const ser=days[iz].hr,step=ser.length>1?clamp(ser[1][0]-ser[0][0],1,60):5;const zs=[['Zone 1',.5,.6,'--blue'],['Zone 2',.6,.7,'--green'],['Zone 3',.7,.8,'--amber'],['Zone 4',.8,.9,'--coral'],['Zone 5',.9,1.3,'--violet']].map(z=>[...z,ser.filter(p=>p[1]>=z[1]*mx&&p[1]<z[2]*mx).length*step]);
    const zm=Math.max(1,...zs.map(z=>z[4]));$('#zones').innerHTML=zs.map(z=>`<div class="bar"><span>${z[0]}</span><div class="t"><div style="width:${z[4]/zm*100}%;background:var(${z[3]})"></div></div><b>${z[4]} min</b></div>`).join('');
    $('#zNote').textContent=`${days[iz].key===TODAY?'Today':longDate(days[iz].d)}. Based on max heart rate ${mx} bpm from your age (${S.age}).${step>10?' Your heart rate data is coarse, so these are estimates.':''}`}
  const d=days[N-1],br=base(N-1,'rhr'),bs=base(N-1,'resp'),bh=base(N-1,'hrv');
  const iv=[['Resting HR',has(d.rhr)&&br.n>=4?d.rhr-br.m:null,Math.max(3,1.5*br.s)],['Breathing',has(d.resp)&&bs.n>=4?d.resp-bs.m:null,.8],['HRV',has(d.hrv)&&bh.n>=4?bh.m-d.hrv:null,Math.max(6,1.2*bh.s)]];
  const flags=iv.filter(v=>has(v[1])&&v[1]/v[2]>.7).length,known=iv.filter(v=>has(v[1])).length;
  $('#ill').innerHTML=iv.map(v=>{if(!has(v[1]))return `<div class="bar"><span>${v[0]}</span><div class="t"></div><b class="mut">No data</b></div>`;const p=clamp(v[1]/v[2],0,1);return `<div class="bar"><span>${v[0]}</span><div class="t"><div style="width:${Math.max(4,p*100)}%;background:var(${p>.7?'--coral':'--green'})"></div></div><b class="${p>.7?'bad':'good'}">${p>.7?'Raised':'Normal'}</b></div>`}).join('')+
   `<div class="readout" style="margin-top:6px">${!known?'Not enough data for today yet':flags>=2?'<b class="bad">Watch out</b> · several signs are raised, so take it easy':flags===1?'<b>Mostly clear</b> · one sign is raised':'<b>All clear</b> · no warning signs'}</div>`}

/* ================= move ================= */
chart($('#stepFig'),(W,H)=>{const d14=days.slice(-14),L=36,B=22,g=S.stepGoal,mxs=Math.max(0,...nn(d14.map(d=>d.steps))),hi=Math.max(g*1.4,mxs*1.1),bw=(W-L)/d14.length,y=v=>8+(H-8-B)*(1-v/hi);let o=`<line x1="${L}" x2="${W}" y1="${y(g)}" y2="${y(g)}" stroke="${css('--ink')}" stroke-dasharray="4 4"/><text x="${L-6}" y="${y(g)+4}" text-anchor="end">${Math.round(g/1000)}k</text>`;
  o+=d14.map((d,i)=>(has(d.steps)?`<rect x="${L+i*bw+bw*.18}" y="${y(d.steps)}" width="${bw*.64}" height="${y(0)-y(d.steps)}" rx="${Math.min(5,bw*.25)}" fill="${css(d.steps>=g?'--green':'--line')}"/>`:'')+(W>=520||i%2===(d14.length-1)%2?`<text x="${L+i*bw+bw/2}" y="${H-4}" text-anchor="middle">${wd(d.d).slice(0,2)}</text>`:'')).join('');return o});
chart($('#loadFig'),(W,H)=>{const a=days[N-1].acwr,lo=.5,hi=1.8,x=v=>12+(W-24)*(v-lo)/(hi-lo),y=H/2-4;let o=`<rect x="${x(lo)}" y="${y-8}" width="${x(.8)-x(lo)}" height="16" rx="8" fill="${css('--blue')}" opacity=".35"/><rect x="${x(.8)}" y="${y-8}" width="${x(1.3)-x(.8)}" height="16" fill="${css('--green')}" opacity=".6"/><rect x="${x(1.3)}" y="${y-8}" width="${x(hi)-x(1.3)}" height="16" rx="8" fill="${css('--coral')}" opacity=".5"/>`;
  [['Too easy',.65],['Building',1.05],['Too much',1.55]].forEach(t=>o+=`<text x="${x(t[1])}" y="${y+30}" text-anchor="middle">${t[0]}</text>`);
  if(has(a))o+=`<path d="M${x(clamp(a,lo,hi))} ${y-11} l-7 -11 h14z" fill="${css('--ink')}"/>`;return o});
function renderMove(){const g=S.stepGoal,d14=days.slice(-14),st=nn(d14.map(d=>d.steps)),a=days[N-1].acwr;
  $('#stepRead').innerHTML=st.length?`<b>${Math.round(mean(st)).toLocaleString()}</b> a day · goal hit ${st.filter(v=>v>=g).length} of ${st.length} days`:'No steps in your data yet.';
  const l7=nn(days.slice(-7).map(d=>d.load)),l28=nn(days.slice(-28).map(d=>d.load));
  $('#loadKv').innerHTML=[['7-day load',l7.length?Math.round(mean(l7)*7):'—'],['4-week base',l28.length?Math.round(mean(l28)*7):'—'],['Ratio',dash(a,v=>v.toFixed(2))]].map(k=>`<button class="ro">${k[0]}<b>${k[1]}</b></button>`).join('');
  const t=days[N-1],wk7=days.slice(-7).flatMap(d=>d.wk||[]),im=wk7.reduce((s,w)=>s+(w.min||0)*(has(w.avg)&&w.avg>=maxHR()*.77?2:1),0);
  const vo2=isReal()?REAL.vo2&&REAL.vo2.v:47,fa=isReal()?REAL.fitAge&&REAL.fitAge.v:29;
  $('#fitKv').innerHTML=[['VO₂ max (est.)',dash(vo2)],['Fitness age',dash(fa)],['Active calories',dash(t.kcal,v=>Math.round(v).toLocaleString())],['Workouts (7 days)',wk7.length?wk7.length+' · '+wk7.reduce((s,w)=>s+(w.min||0),0)+' min':'—'],['Intensity min (7d)',wk7.length?`${im} / 150`:'—'],['Floors climbed',dash(t.floors)]].map(k=>`<button class="ro">${k[0]}<b>${k[1]}</b></button>`).join('')}

/* ================= log ================= */
let L0=logFor(TODAY);const saveL=()=>store('cirqa-log-'+TODAY,L0);
const TAGS=['Alcohol','Coffee after 2pm','Late meal','Late night','Screens in bed','Meditation','Sauna','Travel','Feeling sick','Period','Hard workout'];
const MOODS=[['Rough','M8 17c2-2.5 6-2.5 8 0'],['Low','M8.5 16.5c2-1.2 5-1.2 7 0'],['Okay','M8.5 15.5h7'],['Good','M8.5 14.5c2 1.5 5 1.5 7 0'],['Great','M7.5 13.5q4.5 5.5 9 0z']];
function renderLog(){const l=L0;
  $('#moods').innerHTML=MOODS.map((m,i)=>`<button data-mood="${i+1}" aria-label="${m[0]}" aria-pressed="${l.mood===i+1}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/><path d="${m[1]}"/></svg></button>`).join('');
  $('#mlbl').textContent=l.mood?'Feeling '+MOODS[l.mood-1][0].toLowerCase():'Tap a face';
  $('#tags').innerHTML=TAGS.map(t=>`<button class="tag" aria-pressed="${l.tags.includes(t)}">${esc(t)}</button>`).join('');
  const p=clamp(l.water/S.waterGoal,0,1),lvY=108-94*p;
  $('#glass').innerHTML=`<defs><clipPath id="gc"><path d="M10 8h66l-8 100H18z"/></clipPath></defs><path d="M10 8h66l-8 100H18z" fill="${css('--bg')}" stroke="${css('--line')}" stroke-width="3" stroke-linejoin="round"/><g clip-path="url(#gc)"><path d="M0 ${lvY} q 21 -6 43 0 t 43 0 V120 H0z" fill="${css('--blue')}" opacity=".85"/></g>`;
  $('#water').textContent=l.water.toLocaleString()+' ml';$('#wgoal').textContent=`${Math.round(p*100)}% of ${(S.waterGoal/1000).toFixed(1)} L goal`;renderCorr()}
$('#moods').onclick=e=>{const b=e.target.closest('button');if(b){L0.mood=+b.dataset.mood;saveL();renderLog()}};
$('#tags').onclick=e=>{const b=e.target.closest('.tag');if(!b)return;const t=b.textContent;L0.tags=L0.tags.includes(t)?L0.tags.filter(x=>x!==t):[...L0.tags,t];saveL();renderLog()};
$('#wPlus').onclick=()=>{L0.water+=250;saveL();renderLog();if(days[sel].key===TODAY)renderToday()};
$('#wMinus').onclick=()=>{L0.water=Math.max(0,L0.water-250);saveL();renderLog();if(days[sel].key===TODAY)renderToday()};
function renderCorr(){
  const sg=v=>(v>0?'+':'−')+(Math.abs(v)<10?Math.abs(v).toFixed(1):Math.round(Math.abs(v))),cl=v=>Math.abs(v)<.05?'mut':v<0?'bad':'good',fx=(v,u)=>!has(v)?'not enough data for '+u:Math.abs(v)<.05?'no change in '+u:sg(v)+' '+u;
  const eff=(t,f)=>{const a=nn(days.filter(d=>(d.tags||[]).includes(t)).map(f)),b=nn(days.filter(d=>!(d.tags||[]).includes(t)).map(f));return a.length>=3&&b.length>=3?mean(a)-mean(b):null};
  const used=TAGS.filter(t=>days.filter(d=>(d.tags||[]).includes(t)).length>=3);
  const rows=used.map(t=>[t,days.filter(d=>(d.tags||[]).includes(t)).length,eff(t,d=>d.hrv),eff(t,d=>d.score)])
    .filter(r=>has(r[2])||has(r[3])).sort((a,b)=>(a[2]??0)-(b[2]??0));
  $('#corr').innerHTML=rows.length?rows.map(c=>`<div class="in static"><span style="background:var(${(c[2]??c[3])<0?'--coral':'--green'})"></span><div><h3>${esc(c[0])} <small class="mut" style="font-weight:500">· ${c[1]} days</small></h3><p><b class="${cl(c[2])}">${fx(c[2],'ms HRV')}</b> · <b class="${cl(c[3])}">${fx(c[3],'sleep score')}</b></p></div></div>`).join(''):
    `<p class="empty">Tag your days here. Once a tag has been used on 3 or more days, Cirqa shows how it changes your HRV and sleep that night.</p>`}

/* ================= all metrics ================= */
const CAT=[
 ['Heart',[['Heart rate, 24/7','p1','Every second in workouts, every few minutes otherwise'],['Resting heart rate','p2','Lowest steady value of the day','rhr'],['Heart rate variability','p2','Overnight average, the best recovery signal','hrv'],['Heart rate zones','p3','Personal zones from your age'],['Cardiac drift','p3','Heart rate creep at steady effort — coming soon'],['High and low alerts','p2','Unusual readings at rest']]],
 ['Recovery and stress',[['Readiness','p3','HRV + resting HR + sleep + load in one number','ready'],['Stress (0–100)','p2','From HRV, every few minutes','stress'],['Body Battery','p2','Energy reserve, charges in sleep','bb'],['Illness early warning','p3','Resting HR, breathing and HRV moving together'],['Stress patterns','p3','Your most stressful hours'],['Breathing rate','p2','Overnight breaths per minute','resp']]],
 ['Sleep',[['Sleep stages','p2','Deep, light, REM, awake'],['Sleep score','p2','Garmin’s, or worked out by Cirqa','sleep'],['Sleep debt','p3','Running deficit against your goal'],['Bedtime consistency','p3','Spread of your sleep times'],['Chronotype','p3','Early bird or night owl'],['Blood oxygen (SpO₂)','p1','Pulse ox sensor','spo2']]],
 ['Movement',[['Steps, distance, floors','p1','Floors need a barometer','steps'],['Calories','p2','Active calories'],['Intensity minutes','p3','Vigorous minutes count double'],['Workouts','p2','Type, duration, heart rate']]],
 ['Fitness and training',[['VO₂ max','p2','Aerobic fitness estimate'],['Fitness age','p2','From VO₂ max, resting HR and activity'],['Training load balance','p3','Are you ramping up too fast?','load'],['Weekly report','p3','What improved, what slipped — coming soon']]],
 ['Your logs',[['Mood','p4','One tap a day'],['Habits and tags','p4','Alcohol, caffeine, meals, screens'],['Water','p4','Against your daily goal'],['What affects you','p3','Each habit vs your HRV and sleep'],['AI coach','p3','Ask about your own data — coming soon']]],
];
const allHtml=q=>CAT.map(g=>{const it=g[1].filter(i=>!q||(i[0]+' '+i[2]).toLowerCase().includes(q));return it.length?`<h3>${esc(g[0])}</h3><ul>${it.map(i=>`<li ${i[3]?`class="tap" data-m="${i[3]}"`:''}>${esc(i[0])}<span class="pill ${i[1]}">${({p1:'Sensor',p2:'Garmin',p3:'New',p4:'You'})[i[1]]}</span>${i[3]?' <span class="mut">›</span>':''}<small>${esc(i[2])}</small></li>`).join('')}</ul>`:''}).join('')||'<p class="mut">Nothing matches.</p>';
$('#openAll').onclick=()=>{openSheet(`<div class="shead"><h2 style="font-size:26px;margin:0">Everything we track</h2>${xBtn}</div><input class="search" id="q" type="search" placeholder="Search metrics" aria-label="Search metrics"><p class="note"><span class="pill p1" style="margin:0">Sensor</span> measured · <span class="pill p2" style="margin:0">Garmin</span> computed · <span class="pill p3" style="margin:0">New</span> ours · <span class="pill p4" style="margin:0">You</span> logged</p><div class="cat" id="catL">${allHtml('')}</div>`);
  $('#q').oninput=e=>$('#catL').innerHTML=allHtml(e.target.value.trim().toLowerCase())};

/* ================= connect your data ================= */
const FIELDS=[['steps','Steps'],['sleep','Sleep'],['rhr','Resting heart rate'],['hrv','HRV'],['hr','Minute-by-minute heart rate'],['spo2','Blood oxygen'],['resp','Breathing'],['stress','Stress'],['bbHi','Body Battery'],['kcal','Active calories'],['floors','Floors'],['wk','Workouts']];
function dataStatus(){if(!isReal())return `<p class="note" style="margin-top:4px">None yet. The app is showing sample data.</p>`;const ks=Object.keys(REAL.days).sort();
  const c=f=>ks.filter(k=>{const v=REAL.days[k][f];return Array.isArray(v)?v.length:has(v)||(f==='sleep'&&v)}).length;
  return `<p class="note" style="margin-top:4px">${ks.length} days, ${esc(dateOf(ks[0]).toLocaleDateString('en',{day:'numeric',month:'short'}))} – ${esc(dateOf(ks.at(-1)).toLocaleDateString('en',{day:'numeric',month:'short',year:'numeric'}))}</p><div class="bars" style="margin-top:10px">${FIELDS.map(([f,n])=>{const x=c(f);return `<div class="bar" style="grid-template-columns:minmax(0,1fr) auto"><span>${n}</span><b class="${x?'good':'mut'}">${x?x+' days':'—'}</b></div>`}).join('')}</div>`}
function fileBtn(label,alt){return `<label class="pbtn filebtn${alt?' alt':''}" style="margin-top:12px">${label}<input type="file" class="imp" accept=".json,.zip,application/json,application/zip" multiple></label>`}
function guide(){openSheet(`<div class="shead"><h2 style="font-size:26px;margin:0">Connect your Garmin</h2>${xBtn}</div>
  <p class="mut" style="margin:0">Garmin doesn’t let personal apps connect directly, so Cirqa reads files you export. They are read on this phone only and never uploaded.</p>
  <div class="box"><h3>Option 1 · Apple Health <span class="pill p2">Easiest</span></h3>
   <p class="note" style="margin-top:4px">Steps, heart rate, resting heart rate, sleep, blood oxygen, breathing and workouts.</p>
   <ol class="steps"><li>In <b>Garmin Connect</b>, open settings, find <b>Connected Apps → Apple Health</b>, and turn everything on. Menu names can vary a little between app versions.</li>
   <li>Install <b>Health Auto Export – JSON+CSV</b> from the App Store. Some options may need its paid upgrade.</li>
   <li>In it, choose <b>Manual Export</b>, format <b>JSON</b>, a date range such as the last 30 days, and select: Steps, Heart Rate, Resting Heart Rate, Heart Rate Variability, Sleep Analysis, Respiratory Rate, Blood Oxygen, Active Energy, Flights Climbed and Workouts.</li>
   <li>Set the time grouping to <b>minutes</b> or <b>hours</b> if you can, so your day chart fills in.</li>
   <li>Save the file to <b>Files</b>, then import it below.</li></ol></div>
  <div class="box"><h3>Option 2 · Garmin’s full export <span class="pill p3">Most complete</span></h3>
   <p class="note" style="margin-top:4px">Adds Garmin-only numbers: Body Battery, stress, Garmin’s sleep score, HRV and VO₂ max.</p>
   <ol class="steps"><li>In Safari, sign in at <b>garmin.com</b> and open <b>Account → Data Management → Export Your Data</b>, then tap <b>Request Data Export</b>.</li>
   <li>Garmin emails you a download link. It can take from a few hours to a few days.</li>
   <li>Download the ZIP to <b>Files</b> and import it below. If it is very large and fails, unzip it in Files and import the .json files from the <b>DI_CONNECT</b> folder instead.</li></ol></div>
  <p class="note" style="margin-top:12px">You can import both. Cirqa merges them by date, and newer imports update older ones.</p>
  ${fileBtn('Import a file')}<div id="impMsg" class="note" style="margin-top:10px" aria-live="polite"></div>`)}
document.addEventListener('click',e=>{if(e.target.closest('[data-guide]'))swapSheet(guide)});
document.addEventListener('change',async e=>{const inp=e.target.closest('.imp');if(!inp||!inp.files.length)return;const msg=$('#impMsg');const say=t=>{if(msg)msg.textContent=t};
  inp.disabled=true;try{const{acc,srcs,nfiles}=await importFiles([...inp.files],say);const nd=Object.keys(acc.days).length;
    if(!nd){say(nfiles?'That file didn’t contain any health data Cirqa recognises. Check it’s a Health Auto Export JSON file or Garmin’s export.':'No readable .json files were found in that file.');inp.disabled=false;inp.value='';return}
    mergeAcc(acc);const saved=saveReal();build();renderAll();go('today');
    const got=FIELDS.filter(([f])=>acc.count[f]).map(([f,n])=>`<div class="bar" style="grid-template-columns:minmax(0,1fr) auto"><span>${n}</span><b class="good">${acc.count[f].size} days</b></div>`).join('');
    const miss=FIELDS.filter(([f])=>!acc.count[f]).map(x=>x[1]);
    openSheet(`<div class="shead"><h2 style="font-size:26px;margin:0">Imported</h2>${xBtn}</div><p class="mut" style="margin:0">${nd} days from ${esc(srcs.join(' and '))}. Cirqa is now showing your real data.</p>
      <div class="box"><h3>Found</h3><div class="bars" style="margin-top:8px">${got}</div></div>
      ${miss.length?`<div class="box"><h3>Not in this file</h3><p class="note" style="margin-top:4px">${esc(miss.join(', '))}. These show “—” until you import a file that has them${miss.some(m=>['Stress','Body Battery','HRV'].includes(m))?'. Stress, Body Battery and HRV come from Garmin’s full export':''}.</p></div>`:''}
      ${saved?'':'<div class="box"><b class="bad">Couldn’t save on this phone</b><p class="note">Storage is full or blocked, so the data will be gone when you close the app. Try importing a shorter date range.</p></div>'}
      <button class="pbtn" data-close style="width:100%;margin-top:16px">See my data</button>`)}
  catch(err){say('Import failed: '+(err&&err.message||err));inp.disabled=false;inp.value=''}});

/* ================= settings ================= */
$('#openSet').onclick=()=>{const th=['auto','light','dark'];openSheet(`<div class="shead"><h2 style="font-size:26px;margin:0">Settings</h2>${xBtn}</div>
  <div class="box" style="margin-top:4px"><h3>Your data</h3>${dataStatus()}
   ${fileBtn(isReal()?'Import more data':'Import a file')}<button type="button" class="pbtn alt" data-guide style="width:100%;margin-top:10px">How to get your data</button>
   ${isReal()?'<button type="button" class="pbtn alt" id="wipe" style="width:100%;margin-top:10px;color:var(--coral)">Remove my data</button>':''}<div id="impMsg" class="note" style="margin-top:10px" aria-live="polite"></div></div>
  <form id="setF"><div class="field"><label for="sName">Your first name</label><input id="sName" maxlength="20" autocomplete="given-name" value="${esc(S.name)}" placeholder="For your greeting"></div>
  <div class="field"><label for="sAge">Age</label><input id="sAge" type="number" inputmode="numeric" min="12" max="99" value="${S.age}"><span class="note">Sets your max heart rate (about <span id="mhr">${maxHR()}</span> bpm) and zones.</span></div>
  <div class="field"><label for="sSteps">Daily step goal</label><input id="sSteps" type="number" inputmode="numeric" min="1000" step="500" value="${S.stepGoal}"></div>
  <div class="field"><label for="sSleep">Sleep goal (hours)</label><input id="sSleep" type="number" inputmode="decimal" min="5" max="11" step=".5" value="${S.sleepGoal}"></div>
  <div class="field"><label for="sWater">Water goal (ml)</label><input id="sWater" type="number" inputmode="numeric" min="500" step="250" value="${S.waterGoal}"></div>
  <div class="field"><label>Appearance</label><div class="seg" id="sTheme" style="background:var(--card)">${th.map(t=>`<button type="button" data-t="${t}" aria-pressed="${S.theme===t}">${t==='auto'?'Automatic':t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div></div>
  <button class="pbtn" style="width:100%;margin-top:22px">Save</button>
  <button type="button" class="pbtn alt" id="replay" style="width:100%;margin-top:10px">Show the welcome tour again</button></form>
  <p class="note" style="margin-top:14px">Everything is stored only on this phone.</p>`);
  const w=$('#wipe');if(w)w.onclick=()=>{if(w.dataset.sure){REAL={days:{},vo2:null,fitAge:null,imports:[]};try{localStorage.removeItem('cirqa-data')}catch(e){}closeSheet();build();renderAll();go('today')}else{w.dataset.sure=1;w.textContent='Tap again to remove all imported data'}};
  $('#sAge').oninput=e=>{const a=+e.target.value;if(a>=12&&a<=99)$('#mhr').textContent=Math.round(208-.7*a)};
  $('#sTheme').onclick=e=>{const b=e.target.closest('button');if(!b)return;S.theme=b.dataset.t;applyTheme();saveS();$$('#sTheme button').forEach(x=>x.setAttribute('aria-pressed',x===b));setTimeout(()=>{renderAll();redraw()},30)};
  $('#replay').onclick=()=>swapSheet(onboard);
  $('#setF').onsubmit=e=>{e.preventDefault();const num=(id,lo,hi,dflt)=>{const v=+$(id).value;return v>=lo&&v<=hi?v:dflt};
    S.name=$('#sName').value.trim().slice(0,20);S.age=num('#sAge',12,99,S.age);S.stepGoal=num('#sSteps',1000,50000,S.stepGoal);S.sleepGoal=num('#sSleep',5,11,S.sleepGoal);S.waterGoal=num('#sWater',500,6000,S.waterGoal);
    saveS();derive();closeSheet();renderAll();go(view)}};

/* ================= onboarding ================= */
const OB=[['Welcome to Cirqa','Everything your Garmin band measures, explained in plain words and turned into a plan for your day.','<circle cx="80" cy="60" r="46" fill="none" stroke="var(--line)" stroke-width="12"/><circle cx="80" cy="60" r="46" fill="none" stroke="var(--lime)" stroke-width="12" stroke-linecap="round" stroke-dasharray="230 300" transform="rotate(-90 80 60)"/><circle cx="80" cy="60" r="28" fill="none" stroke="var(--coral)" stroke-width="10" stroke-linecap="round" stroke-dasharray="120 200" transform="rotate(-90 80 60)"/>'],
 ['Tap anything','Every number opens a card: your trend, your normal range, what changes it and what to try.','<rect x="30" y="18" width="100" height="70" rx="16" fill="var(--card)"/><rect x="44" y="34" width="40" height="8" rx="4" fill="var(--line)"/><rect x="44" y="50" width="56" height="18" rx="5" fill="var(--ink)"/><circle cx="112" cy="92" r="16" fill="var(--lime)" opacity=".5"/><circle cx="112" cy="92" r="7" fill="var(--ink)"/>'],
 ['Bring in your real data','Import from Apple Health or Garmin’s export in Settings. Until then you’ll see sample data.','<rect x="52" y="14" width="56" height="92" rx="12" fill="var(--card)" stroke="var(--line)" stroke-width="3"/><path d="M80 40v34M66 60l14 14 14-14" fill="none" stroke="var(--ink)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>']];
function onboard(){let k=0;const r=()=>{openSheet(`<div class="ob"><svg viewBox="0 0 160 120" aria-hidden="true">${OB[k][2]}</svg><h2 style="font-size:28px;margin-top:10px">${OB[k][0]}</h2><p>${OB[k][1]}</p><div class="dots">${OB.map((_,j)=>`<i class="${j===k?'on':''}"></i>`).join('')}</div><button class="pbtn" id="obNext" style="width:100%">${k<OB.length-1?'Next':isReal()?'Get started':'Connect my data'}</button>${k<OB.length-1?'<button class="pbtn alt" id="obSkip" style="width:100%;margin-top:10px;border:0">Skip</button>':isReal()?'':'<button class="pbtn alt" id="obSkip" style="width:100%;margin-top:10px;border:0">Look around first</button>'}</div>`,()=>{S.seen=true;saveS()});
  $('#obNext').onclick=()=>{if(k<OB.length-1){k++;r()}else if(isReal())closeSheet();else swapSheet(guide)};const sk=$('#obSkip');if(sk)sk.onclick=closeSheet};r()}

/* ================= global taps ================= */
document.addEventListener('click',e=>{const m=e.target.closest('[data-m]');if(m&&M[m.dataset.m]){e.preventDefault();swapSheet(()=>metricSheet(m.dataset.m));return}
  const g=e.target.closest('[data-go]');if(g){const k=g.dataset.go;if(k==='stress'&&(days[sel].st||[]).length){setDay('stress');$('#dayFig').scrollIntoView({behavior:'smooth',block:'center'})}else if(M[k])metricSheet(k);else go(k);return}
  const p=e.target.closest('[data-plan]');if(p){const k=p.dataset.plan;if(k==='water')go('log');else if(k==='sleep')go('sleep');else metricSheet('ready')}});

function renderAll(){renderDays();renderToday();renderSleep();renderHeart();renderMove();renderLog()}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{renderAll();redraw()});
window.__cirqa={importFiles,mergeAcc,REAL:()=>REAL,days:()=>days};
build();renderAll();go(location.hash.slice(1)||'today');
if(!S.seen)setTimeout(onboard,500);
}
