
/* ============ ثوابت ============ */
const APP_URL = /^https?:$/.test(location.protocol) ? location.origin + location.pathname : ""; // رابط النموذج المنشور؛ يُستخدم داخل رمز QR
const EMERGENCY_NO = "997";
const MEDIC_CODE = "2026";
const STATUS = [
  ["open","في موقع الإصابة"],["medic","استلمها المسعف"],["transport","في النقل الإسعافي"],["facility","في المنشأة الطبية"],["closed","مغلقة"]
];
const statusName = s => (STATUS.find(x=>x[0]===s)||[,s])[1];
const ANS = {yes:"نعم", no:"لا", unknown:"غير متأكد"};
const FIELDS = [
  ["responsive","هل يستجيب المصاب؟"],["breathing","هل يتنفس طبيعيًا؟"],["bleeding","نزيف شديد ظاهر؟"],["emergencyCalled","تم طلب الإسعاف؟"]
];

/* ============ أدوات ============ */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const now = () => Date.now();
const hms = t => t ? new Date(t).toLocaleTimeString("en-GB",{hour12:false}) : "—";
const dmy = t => t ? new Date(t).toLocaleDateString("en-GB") : "—";
const dur = ms => { if(ms==null||isNaN(ms)||ms<0) return "—"; const s=Math.round(ms/1000); return s<60? s+" ث" : Math.floor(s/60)+" د "+(s%60)+" ث"; };
function rid(n=10){ const a="abcdefghjkmnpqrstuvwxyz23456789"; const b=new Uint32Array(n); crypto.getRandomValues(b); return [...b].map(x=>a[x%a.length]).join(""); }
const ls = {
  get(k,d){ try{ const v=localStorage.getItem("athar:"+k); return v==null?d:JSON.parse(v);}catch(e){return d;} },
  set(k,v){ try{ localStorage.setItem("athar:"+k, JSON.stringify(v)); }catch(e){} }
};
const ss = {
  get(k){ try{return sessionStorage.getItem("athar:"+k);}catch(e){return null;} },
  set(k,v){ try{sessionStorage.setItem("athar:"+k,v);}catch(e){} }
};
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2600); }
function deepMerge(a,b){ const o={...(a||{})}; for(const k in b){ const v=b[k]; o[k]=(v&&typeof v==="object"&&!Array.isArray(v)&&o[k]&&typeof o[k]==="object"&&!Array.isArray(o[k]))?deepMerge(o[k],v):v; } return o; }
function speak(text){
  try{ if(!("speechSynthesis" in window)){toast("الإرشاد الصوتي غير متاح في هذا المتصفح");return;}
    speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang="ar-SA"; u.rate=.95;
    const v=speechSynthesis.getVoices().find(v=>v.lang&&v.lang.startsWith("ar")); if(v)u.voice=v;
    speechSynthesis.speak(u);
  }catch(e){ toast("الإرشاد الصوتي غير متاح في هذا المتصفح"); }
}

/* ============ الحالة والتخزين ============ */
const S = {
  mode:"local", db:null, sample:null, loaded:false, loadNote:"",
  soldiers:{}, incidents:{}, base:{soldiers:{},incidents:{}},
  outbox: ls.get("outbox",[]), simOffline: ls.get("simOffline",false), lastSync:null, flushing:false,
  medic: ss.get("medic")==="1", flow:null, viewOpened:{}
};
const offline = () => S.simOffline || !navigator.onLine;

function rebuild(){
  S.soldiers = JSON.parse(JSON.stringify(S.base.soldiers));
  S.incidents = JSON.parse(JSON.stringify(S.base.incidents));
  for(const op of S.outbox) applyOp(S, op);
}
function applyOp(target, op){
  const [col,id]=op.path.split("/"); const bag = col==="soldiers"?target.soldiers:target.incidents;
  bag[id] = op.kind==="set" ? JSON.parse(JSON.stringify(op.data)) : deepMerge(bag[id], op.data);
}
function write(kind, path, data){
  S.outbox.push({kind,path,data,at:now()}); ls.set("outbox",S.outbox);
  applyOp(S,{kind,path,data});
  render(); flush();
}
async function flush(){
  if(S.flushing || offline() || !S.outbox.length) return;
  S.flushing=true;
  while(S.outbox.length && !offline()){
    const op=S.outbox[0];
    try{
      if(S.mode==="db"){ const ref=S.db.doc(op.path); op.kind==="set" ? await ref.set(op.data) : await ref.update(op.data); }
      applyOp(S.base, op);
      S.outbox.shift(); ls.set("outbox",S.outbox); S.lastSync=now();
      if(S.mode==="local") saveLocal();
    }catch(e){
      if(e && (e.code==="invalid_argument"||e.code==="transform_error")){ S.outbox.shift(); ls.set("outbox",S.outbox); toast("تعذّر حفظ تحديث واحد وتم تجاوزه"); }
      else if(e && e.code==="unavailable"){ await new Promise(r=>setTimeout(r,800+Math.random()*800)); }
      else { toast("تعذّر الحفظ الآن، سيُعاد المحاولة لاحقًا"); break; }
    }
  }
  S.flushing=false; rebuild(); render();
}
function saveLocal(){ ls.set("data", S.base); }
function seedLocal(){
  const t=now();
  const mk=(name,unit,blood,allergies,chronic,meds)=>({name,unit,blood,allergies,chronic,meds,createdAt:t,demo:true});
  return { soldiers:{
      "k7mq2xp9vd":mk("فيصل العتيبي (افتراضي)","الكتيبة التدريبية ٣","O+","البنسلين","لا يوجد","لا يوجد"),
      "r4hz8wn3tc":mk("سلطان الحربي (افتراضي)","سرية الإسناد","A−","لا يوجد","ربو خفيف","بخاخ سالبيوتامول عند الحاجة"),
      "b9fs5jy6qe":mk("نايف الشهري (افتراضي)","وحدة الاتصالات","B+","حساسية من الأسبرين","لا يوجد","لا يوجد")
    }, incidents:{} };
}
async function initStore(){
  // ابدأ من البيانات المحلية لتظهر الصفحة فورًا
  S.base = ls.get("data", null) || seedLocal(); saveLocal(); rebuild(); S.loaded=true; render();
  const c = window.claude;
  let db=null, sample=null;
  try{ db = c && c.use ? await c.use("db") : null; }catch(e){ db=null; }
  try{ sample = c && c.use ? await c.use("sample") : null; }catch(e){ sample=null; }
  S.sample = sample;
  if(!db){ render(); flush(); return; }
  S.db=db; S.mode="db"; S.loaded=false; S.base={soldiers:{},incidents:{}}; rebuild(); render();
  const timer=setTimeout(()=>{ S.loadNote="تعذّر الوصول إلى قاعدة البيانات المشتركة حتى الآن؛ قد تكون البيانات غير محدثة."; render(); },10000);
  const done=()=>{ clearTimeout(timer); S.loadNote=""; S.loaded=true; };
  db.collection("soldiers").onSnapshot(snap=>{
    const o={}; snap.docs.forEach(d=>o[d.id]=d.data()); S.base.soldiers=o;
    if(!snap.metadata.fromCache) done(); rebuild(); render();
  }, e=>{ done(); S.loadNote="انقطع الاتصال بقاعدة البيانات."; render(); });
  db.collection("incidents").onSnapshot(snap=>{
    const o={}; snap.docs.forEach(d=>o[d.id]=d.data()); S.base.incidents=o;
    if(!snap.metadata.fromCache) done(); rebuild(); render();
  }, e=>{ done(); S.loadNote="انقطع الاتصال بقاعدة البيانات."; render(); });
  flush();
}
window.addEventListener("online", ()=>{ render(); flush(); });
window.addEventListener("offline", ()=>render());

/* ============ مؤشرات ============ */
function completeness(inc){
  const a=inc.answers||{}; let n=0, tot=FIELDS.length+1;
  FIELDS.forEach(([k])=>{ if(a[k]&&a[k]!=="unknown") n++; });
  if((inc.description||"").trim()) n++;
  return Math.round(n/tot*100);
}
function metrics(inc){
  const m=inc.medic||{};
  const respEvents=(inc.events||[]).length;
  return {
    toStart: inc.startedAt&&inc.scannedAt ? inc.startedAt-inc.scannedAt : null,
    complete: completeness(inc),
    toMedic: m.openedAt&&inc.startedAt ? m.openedAt-inc.startedAt : null,
    access: m.loginAt&&m.openedAt ? m.openedAt-m.loginAt : null,
    transfer: m.seenEvents!=null && respEvents ? Math.min(100,Math.round(m.seenEvents/respEvents*100)) : null,
    ease: inc.feedback?.ease ?? null, clarity: inc.feedback?.clarity ?? null
  };
}

/* ============ التوجيه ============ */
function route(){ const h=(location.hash||"").slice(1); if(h.startsWith("u-")) return {name:"scan", sid:h.slice(2)}; if(["register","medic","metrics"].includes(h)) return {name:h}; if(h.startsWith("i-")) return {name:"incident", iid:h.slice(2)}; return {name:"home"}; }
window.addEventListener("hashchange", ()=>{ S.flow=null; render(); window.scrollTo(0,0); });

/* ============ الإطار ============ */
function topbar(r){
  const pend=S.outbox.length;
  const netCls = offline()? "off" : pend? "pend":"";
  const netTxt = offline()? "دون اتصال" + (pend?` · ${pend} بانتظار المزامنة`:"") : pend? `جارٍ مزامنة ${pend}` : (S.mode==="db"?"متصل · سجل مشترك":"متصل · حفظ على هذا الجهاز");
  const nav = r.name==="scan" ? "" : `<nav class="nav" aria-label="التنقل">
    ${[["home","الرئيسية"],["register","التسجيل وQR"],["medic","الفريق الطبي"],["metrics","مؤشرات التجربة"]].map(([h,t])=>`<a href="#${h}" ${r.name===h||(h==="medic"&&r.name==="incident")?'aria-current="page"':""}>${t}</a>`).join("")}</nav>`;
  return `<header class="top"><div class="top-in">
    <a class="brand" href="#home"><svg class="brand-mark" viewBox="0 0 100 100" aria-hidden="true"><g class="logo-n"><rect x="4" y="4" width="40" height="40" rx="9"/><rect x="56" y="4" width="40" height="40" rx="9"/><rect x="4" y="56" width="40" height="40" rx="9"/></g><g class="logo-b"><rect x="11" y="11" width="26" height="26" rx="5"/><rect x="63" y="11" width="26" height="26" rx="5"/><rect x="11" y="63" width="26" height="26" rx="5"/></g><g class="logo-n"><rect x="17" y="17" width="14" height="14" rx="3"/><rect x="69" y="17" width="14" height="14" rx="3"/><rect x="17" y="69" width="14" height="14" rx="3"/></g><rect class="logo-r" x="56" y="56" width="40" height="40" rx="9"/><g fill="#fff"><rect x="71" y="63" width="10" height="26" rx="2"/><rect x="63" y="71" width="26" height="10" rx="2"/></g></svg><b>عَون</b><span class="muted small stencil">AWN</span></a>
    ${nav}
    <div class="net"><span class="dot ${netCls}"></span><span>${netTxt}</span>
      <button class="switch" data-act="toggleOffline" aria-pressed="${S.simOffline}">${S.simOffline?"إعادة الاتصال":"محاكاة انقطاع"}</button></div>
  </div></header>`;
}
function render(){
  const r=route(); let body="";
  if(r.name==="home") body=viewHome();
  else if(r.name==="register") body=viewRegister();
  else if(r.name==="medic") body=viewMedic();
  else if(r.name==="metrics") body=viewMetrics();
  else if(r.name==="incident") body=viewIncident(r.iid);
  else if(r.name==="scan") body=viewScan(r.sid);
  const keep = document.activeElement && document.activeElement.id ? {id:document.activeElement.id, v:document.activeElement.value, s:document.activeElement.selectionStart} : null;
  // لا نعيد الرسم أثناء الكتابة في حقل نصي حتى لا يضيع ما يكتبه المستخدم
  if(keep && /^(desc|loc|note|assess|interv|v-|s-|code)/.test(keep.id) && render._last===r.name+(r.sid||r.iid||"")+(S.flow?.node||"")){ render._pending=true; return; }
  render._last=r.name+(r.sid||r.iid||"")+(S.flow?.node||"");
  $("#app").innerHTML = topbar(r) + (S.loadNote?`<p class="note mb12">${esc(S.loadNote)}</p>`:"") + body + footer();
  afterRender(r);
}
document.addEventListener("focusout", ()=>{ if(render._pending){ render._pending=false; setTimeout(render,0);} });
function footer(){ return `<footer>نموذج أولي للهاكاثون · مسار الجاهزية الطبية العسكرية · جميع البيانات افتراضية. الإرشادات المعروضة نص تجريبي يلزم مراجعته واعتماده من مختصين قبل أي استخدام، والمنصة لا تغني عن الاتصال بالطوارئ أو التدخل الطبي المتخصص.</footer>`; }

/* ============ الرئيسية ============ */
function viewHome(){
  const incs=Object.values(S.incidents), open=incs.filter(i=>i.status!=="closed").length;
  return `
  <section class="hero">
    <div class="stack">
      <span class="eyebrow">منصة الاستجابة الإسعافية الذكية</span>
      <h1><svg class="brand-mark hero-mark" viewBox="0 0 100 100" aria-hidden="true"><g class="logo-n"><rect x="4" y="4" width="40" height="40" rx="9"/><rect x="56" y="4" width="40" height="40" rx="9"/><rect x="4" y="56" width="40" height="40" rx="9"/></g><g class="logo-b"><rect x="11" y="11" width="26" height="26" rx="5"/><rect x="63" y="11" width="26" height="26" rx="5"/><rect x="11" y="63" width="26" height="26" rx="5"/></g><g class="logo-n"><rect x="17" y="17" width="14" height="14" rx="3"/><rect x="69" y="17" width="14" height="14" rx="3"/><rect x="17" y="69" width="14" height="14" rx="3"/></g><rect class="logo-r" x="56" y="56" width="40" height="40" rx="9"/><g fill="#fff"><rect x="71" y="63" width="10" height="26" rx="2"/><rect x="63" y="71" width="26" height="10" rx="2"/></g></svg>عَون <span class="stencil">AWN</span></h1>
      <p class="slogan">لأن كل ثانية تصنع فرقًا، وكل معلومة قد تنقذ حياة.</p>
      <p class="muted">رمز QR ثابت على الزي يبدأ بلاغًا إسعافيًا. المستجيب الأول يتبع إرشادات مبسطة ويوثّق ما رآه وما نفّذه. المسعف يمسح الرمز نفسه، فيجد السجل جاهزًا ويكمله حتى التسليم.</p>
      <div class="row"><a class="btn primary" href="#register">ابدأ التجربة من التسجيل</a><a class="btn" href="#medic">لوحة الفريق الطبي</a></div>
    </div>
    <div class="chain" aria-label="مراحل الرحلة">
      <div><span class="k">01</span><span><b>التسجيل المسبق</b><br><span class="muted small">معرّف عشوائي ورمز QR لكل عسكري، دون بيانات داخل الرمز.</span></span></div>
      <div><span class="k">02</span><span><b>مسح الرمز وبدء البلاغ</b><br><span class="muted small">أي شخص يصل أولًا يمسح الرمز بكاميرا الهاتف.</span></span></div>
      <div><span class="k">03</span><span><b>إرشاد وتوثيق</b><br><span class="muted small">أسئلة قصيرة، خطوة واحدة في كل شاشة، وتأكيد ما نُفّذ فعلًا.</span></span></div>
      <div><span class="k">04</span><span><b>استلام المسعف</b><br><span class="muted small">دخول بحساب مخوّل، مراجعة المعلومات وتأكيدها أو تصحيحها.</span></span></div>
      <div><span class="k">05</span><span><b>استمرارية الرعاية</b><br><span class="muted small">السجل نفسه يرافق المصاب حتى المنشأة الطبية.</span></span></div>
    </div>
  </section>
  <section class="sec">
    <h2>الحالة الآن</h2>
    <div class="grid3">
      <div class="card stat"><span class="muted small">عسكريون مسجلون</span><b>${Object.keys(S.soldiers).length}</b></div>
      <div class="card stat"><span class="muted small">بلاغات مفتوحة</span><b>${open}</b></div>
      <div class="card stat"><span class="muted small">إجمالي البلاغات</span><b>${incs.length}</b></div>
    </div>
  </section>
  <section class="sec">
    <h2>طريقة تجربة النموذج</h2>
    <div class="grid2">
      <div class="card stack"><h3>على جهاز واحد</h3>
        <p class="muted">من «التسجيل وQR» اضغط «محاكاة المسح» على أي عسكري، وأكمل البلاغ كمستجيب. بعد ذلك افتح «الفريق الطبي»، وادخل بالرمز التجريبي <span class="mono">${MEDIC_CODE}</span>، واستلم الحالة.</p></div>
      <div class="card stack"><h3>على جهازين</h3>
        <p class="muted">${S.mode==="db"?"امسح رمز QR بكاميرا هاتف مسجّل الدخول، وابدأ البلاغ منه، ثم افتح لوحة الفريق الطبي على جهاز آخر. السجل مشترك ويتحدّث مباشرة.":"امسح رمز أحد العسكريين الثلاثة بكاميرا الجوال لتفتح صفحة البلاغ مباشرة. في هذه النسخة تُحفظ البيانات على كل جهاز وحده، فأكمل البلاغ ولوحة المسعف على الجهاز نفسه."}</p></div>
      <div class="card stack"><h3>اختبار انقطاع الاتصال</h3>
        <p class="muted">اضغط «محاكاة انقطاع» في الشريط العلوي، وتابع البلاغ. تُحفظ التحديثات على الجهاز وتُرسل تلقائيًا عند «إعادة الاتصال».</p></div>
      <div class="card stack"><h3>المساعد الذكي</h3>
        <p class="muted">${S.sample?"يفهم وصف المستجيب بالعربية ويقترح الإجابات، والمستجيب يؤكدها بنفسه. لا يصدر تشخيصًا ولا يغيّر الإرشادات المعتمدة.":"هنا يعمل المساعد بمطابقة الكلمات المفتاحية. يفهم مثلًا «طاح» و«ما يرد» و«ينزف»، ويقترح الإجابات، والمستجيب يؤكدها بنفسه."}</p></div>
    </div>
  </section>`;
}

/* ============ التسجيل ============ */
function qrSvg(text){
  try{ const q=qrcode(0,"M"); q.addData(text); q.make(); return q.createSvgTag({cellSize:4,margin:2,scalable:true}); }
  catch(e){ return `<span class="small muted">تعذّر توليد الرمز</span>`; }
}
const scanUrl = sid => (APP_URL||"https://awn.example/scan") + "#u-" + sid;
function viewRegister(){
  const list=Object.entries(S.soldiers).sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0));
  return `
  <section class="stack">
    <span class="eyebrow">المرحلة الأولى · التسجيل المسبق</span>
    <h2>تسجيل العسكريين وتوليد رموز QR</h2>
    <p class="muted">لا يحمل الرمز أي اسم أو معلومة طبية، بل رابطًا فيه معرّف عشوائي يصعب تخمينه. الاسم والبيانات الطبية لا تظهر لمن يمسح الرمز، ولا يراها إلا حساب طبي مخوّل.</p>
  </section>
  <section class="sec">
    <div class="grid2">
    ${list.map(([sid,s])=>{ const n=Object.values(S.incidents).filter(i=>i.sid===sid).length; return `
      <article class="card soldier">
        <div class="qr" aria-label="رمز QR">${qrSvg(scanUrl(sid))}</div>
        <div class="stack u-g6">
          <h3>${esc(s.name)}</h3>
          <span class="muted small">${esc(s.unit)}</span>
          <span class="small">المعرّف: <span class="mono">${esc(sid)}</span></span>
          <span class="small muted">${n} ${n===1?"حادث مسجل":"حوادث مسجلة"} على الرمز نفسه</span>
          <div class="row"><a class="btn primary" href="#u-${esc(sid)}">محاكاة المسح</a></div>
        </div>
      </article>`;}).join("") || `<p class="muted">لا يوجد عسكريون مسجلون بعد. أضف أول ملف افتراضي من النموذج أدناه.</p>`}
    </div>
  </section>
  <section class="sec">
    <h2>إضافة ملف افتراضي</h2>
    <form class="card stack" id="addForm">
      <div class="grid2">
        <label class="f">الاسم (افتراضي)<input type="text" id="s-name" required></label>
        <label class="f">الوحدة<input type="text" id="s-unit"></label>
        <label class="f">فصيلة الدم<select id="s-blood">${["O+","O−","A+","A−","B+","B−","AB+","AB−","غير معروفة"].map(x=>`<option>${x}</option>`).join("")}</select></label>
        <label class="f">الحساسية<input type="text" id="s-all" placeholder="لا يوجد"></label>
        <label class="f">أمراض مزمنة<input type="text" id="s-chr" placeholder="لا يوجد"></label>
        <label class="f">أدوية حالية<input type="text" id="s-med" placeholder="لا يوجد"></label>
      </div>
      <div class="row"><button class="btn primary" type="submit">تسجيل وتوليد الرمز</button><button class="btn ghost" type="button" data-act="fillRandom">تعبئة ببيانات عشوائية</button></div>
    </form>
  </section>`;
}

/* ============ صفحة المسح (المستجيب) ============ */
const PROTO = {
  safe:{type:"do", title:"تأكد أن المكان آمن", body:"قبل الاقتراب، تأكد من عدم وجود خطر عليك أو على المصاب، مثل حركة مركبات أو نار أو أسلاك. لا تعرّض نفسك للخطر.", next:()=> "resp"},
  resp:{type:"ask", key:"responsive", title:"هل يستجيب المصاب؟", body:"ربّت على كتفيه بقوة، وناده بصوت عالٍ: «تسمعني؟»", next:()=> "call"},
  call:{type:"call", next:()=> "bleed"},
  bleed:{type:"ask", key:"bleeding", title:"هل يوجد نزيف شديد ظاهر؟", body:"انظر بسرعة إلى الجسم كله: دم يتدفق أو يبلل الملابس بسرعة.", next:f=> f.answers.bleeding==="yes" ? "press" : (f.answers.responsive==="yes" ? "conscious" : "breath")},
  press:{type:"do", title:"اضغط بقوة على مكان النزيف", body:"استخدم قطعة قماش نظيفة أو ضمادة، واضغط مباشرة وباستمرار على الجرح. إذا تشبّعت فضع فوقها قطعة أخرى ولا ترفع الأولى.", next:f=> f.answers.responsive==="yes" ? "conscious" : "breath"},
  breath:{type:"ask", key:"breathing", title:"هل يتنفس بشكل طبيعي؟", body:"أمِل رأسه للخلف برفق وارفع ذقنه، ثم انظر إلى صدره واستمع لمدة لا تزيد عن ١٠ ثوانٍ. الشهقات المتقطعة لا تُعد تنفسًا طبيعيًا.", next:f=> f.answers.breathing==="yes" ? "side" : "cpr"},
  cpr:{type:"cpr", next:()=> "wait"},
  side:{type:"do", title:"ضعه على جانبه وراقب تنفسه", body:"ضعه على جانبه ليبقى مجرى الهواء مفتوحًا، إلا إذا اشتبهت بإصابة في الرقبة أو الظهر، فأبقِه ثابتًا وراقب تنفسه. لا تتركه وحده.", next:()=> "wait"},
  conscious:{type:"do", title:"أبقِه ثابتًا وطمئنه", body:"لا تحرّكه إلا إذا كان في خطر. اسأله عن مكان الألم وما حدث، ولا تعطه طعامًا أو شرابًا.", next:()=> "wait"},
  wait:{type:"wait"}, feedback:{type:"feedback"}, done:{type:"done"}
};
const ORDER=["describe","safe","resp","call","bleed","press","breath","cpr","side","conscious","wait","feedback","done"];

function latestIncidentId(sid){ return Object.keys(S.incidents).filter(k=>S.incidents[k].sid===sid).sort((a,b)=>(S.incidents[b].startedAt||0)-(S.incidents[a].startedAt||0))[0]; }
function latestIncident(sid){ const k=latestIncidentId(sid); return k?S.incidents[k]:undefined; }
function viewScan(sid){
  const s=S.soldiers[sid];
  if(!s){ return S.loaded ? `<div class="resp"><div class="step"><h2>الرمز غير معروف</h2><p class="muted">هذا الرمز غير مسجل في المنصة. إذا كانت هناك حالة طارئة فاتصل بالإسعاف مباشرة.</p>${sosBar(false)}</div></div>` : `<div class="resp"><p class="muted">جارٍ التحقق من الرمز…</p></div>`; }
  if(!S.flow || S.flow.sid!==sid){
    S.flow={sid, node:"landing", scannedAt:now(), iid:null, answers:{}, ai:null, history:[]};
  }
  const f=S.flow;
  if(f.node==="landing"){
    const open=latestIncident(sid); const hasOpen=open&&open.status!=="closed";
    return `<div class="resp">
      ${sosBar(false)}
      <div class="step">
        <span class="eyebrow">رمز عَون · <span class="mono">${esc(sid.slice(0,4))}••••</span></span>
        <h2>هل أمامك شخص مصاب أو في حالة طارئة؟</h2>
        <p class="body muted">سنرشدك خطوة بخطوة ونوثّق ما تقوم به حتى يصل الفريق الطبي. اتصل بالإسعاف أولًا إن استطعت.</p>
        <button class="btn danger big" data-act="startReport">بدء بلاغ إسعافي</button>
        ${hasOpen?`<p class="small muted">يوجد بلاغ مفتوح على هذا الرمز منذ <span class="mono">${hms(open.startedAt)}</span>. البلاغ الجديد يُنشئ سجلًا مستقلًا.</p>`:""}
      </div>
      <div class="card row between">
        <span class="small muted">من الفريق الطبي المخوّل؟</span>
        <button class="btn" data-act="medicFromScan">دخول الفريق الطبي</button>
      </div>
      <p class="small muted">لا تُعرض هوية العسكري ولا ملفه الطبي لمن يمسح الرمز.</p>
    </div>`;
  }
  if(f.node==="medicLogin") return `<div class="resp">${loginCard("بعد التحقق من صلاحيتك يظهر لك سجل البلاغ المرتبط بهذا الرمز.")}</div>`;
  const inc=S.incidents[f.iid]||{};
  const idx=Math.max(0,ORDER.indexOf(f.node)), pct=Math.round(idx/(ORDER.length-1)*100);
  let card="";
  if(f.node==="describe") card=`
      <span class="eyebrow">صف ما تراه</span>
      <h2>ماذا حدث؟</h2>
      <p class="muted">اكتب بكلماتك وباختصار. يمكنك التخطي والانتقال مباشرة إلى الإرشادات.</p>
      <textarea id="desc" placeholder="مثال: زميلي طاح وما يرد علي">${esc(f.draft||"")}</textarea>
      <div class="row">${["زميلي طاح وما يرد علي","فيه شخص مصاب وما يقدر يتحرك","ينزف من رجله بقوة","سقط ويتنفس بصعوبة"].map(x=>`<button class="chip" data-act="chip" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div>
      <label class="f">وصف الموقع (اختياري)<input type="text" id="loc" placeholder="مثال: ميدان الرماية الشمالي، قرب البوابة ٢" value="${esc(f.loc||"")}"></label>
      <div class="row"><button class="btn primary big" data-act="submitDesc" ${f.busy?"disabled":""}>${f.busy?"جارٍ الفهم…":"متابعة"}</button></div>
      <button class="btn ghost" data-act="skipDesc">تخطي الوصف</button>`;
  else if(PROTO[f.node]){
    const n=PROTO[f.node];
    if(n.type==="do") card=`
      <h2>${n.title}</h2><p class="body">${n.body}</p>
      <button class="btn ghost" data-act="speak">استمع للتعليمات</button>
      <button class="btn primary big" data-act="did">نفّذتُ هذا</button>
      <button class="btn" data-act="couldnt">لم أستطع</button>`;
    else if(n.type==="ask"){
      const sug=f.ai&&f.ai[n.key]&&f.ai[n.key]!=="unknown"?f.ai[n.key]:null;
      card=`
      <h2>${n.title}</h2><p class="body">${n.body}</p>
      ${sug?`<p class="ai">فهمتُ من وصفك: <b>${ANS[sug]}</b>. أكّد الإجابة بنفسك.</p>`:""}
      <button class="btn ghost" data-act="speak">استمع للتعليمات</button>
      <div class="yn"><button class="btn ${sug==="yes"?"sug":""}" data-act="ans" data-v="yes">نعم</button><button class="btn ${sug==="no"?"sug":""}" data-act="ans" data-v="no">لا</button></div>
      <button class="btn ghost" data-act="ans" data-v="unknown">غير متأكد</button>`;
    }
    else if(n.type==="call") card=`
      <h2>اطلب الإسعاف الآن</h2>
      <p class="body">اتصل على <b class="mono">${EMERGENCY_NO}</b> أو اطلب من شخص قريب أن يتصل، وأخبرهم بالموقع وبما تراه. ابقَ مع المصاب.</p>
      <p class="small muted">في هذا النموذج لا يُجرى أي اتصال فعلي. الرقم للتوضيح فقط، ويُعتمد رقم الطوارئ لدى الجهة.</p>
      <button class="btn danger big" data-act="called" data-v="me">اتصلتُ بالإسعاف</button>
      <button class="btn" data-act="called" data-v="other">شخص آخر يتصل الآن</button>
      <button class="btn ghost" data-act="called" data-v="no">لا أستطيع الاتصال الآن</button>`;
    else if(n.type==="cpr") card=`
      <h2>ابدأ الضغطات على الصدر</h2>
      <p class="body">ضع كعب يدك في منتصف الصدر، والأخرى فوقها، واضغط بقوة وبسرعة حتى يهبط الصدر ٥ إلى ٦ سم، بمعدل ١٠٠ إلى ١٢٠ ضغطة في الدقيقة. لا تتوقف حتى يصل المسعف أو يتوفر جهاز صدمات (AED).</p>
      <div class="beat" aria-hidden="true">١١٠/د</div>
      <p class="small muted tc">اضغط مع إيقاع الدائرة.</p>
      <button class="btn ghost" data-act="metro">${S.metro?"إيقاف صوت الإيقاع":"تشغيل صوت الإيقاع"}</button>
      <button class="btn primary big" data-act="cprStart">بدأتُ الضغطات</button>
      <button class="btn" data-act="couldnt">لم أستطع</button>`;
    else if(n.type==="wait") card=`
      <span class="eyebrow">ابقَ مع المصاب</span>
      <h2>استمر حتى يصل الفريق الطبي</h2>
      <p class="body">راقب تنفسه باستمرار. السجل محفوظ ومرتبط بالرمز، وسيجده المسعف عند مسح الرمز نفسه.</p>
      ${recordSummary(inc)}
      <label class="f">إضافة ملاحظة (اختياري)<input type="text" id="note" placeholder="مثال: فتح عينيه للحظة"></label>
      <button class="btn" data-act="respNote">حفظ الملاحظة</button>
      <button class="btn danger" data-act="goCpr">توقف عن التنفس</button>
      <button class="btn primary big" data-act="arrived">وصل الفريق الطبي</button>`;
    else if(n.type==="feedback") card=`
      <h2>شكرًا لك. سؤالان قصيران</h2>
      <p class="muted">إجاباتك تساعد في تقييم النموذج.</p>
      <div class="stack"><span>ما مدى سهولة استخدام المنصة؟</span>${rating("ease",f.ease)}</div>
      <div class="stack"><span>ما مدى وضوح الإرشادات؟</span>${rating("clarity",f.clarity)}</div>
      <button class="btn primary big" data-act="finish">إنهاء</button>`;
    else if(n.type==="done") card=`
      <h2>تم تسليم البلاغ</h2>
      <p class="body">السجل محفوظ برقم <span class="mono">${esc(f.iid)}</span>، ويمكن للفريق الطبي مراجعته وإكماله.</p>
      ${recordSummary(inc)}
      <a class="btn" href="#home">العودة للرئيسية</a>`;
  }
  return `<div class="resp">
    ${f.node!=="done"?sosBar(true):""}
    <div class="progress" aria-hidden="true"><i data-pct="${pct}"></i></div>
    <div class="step">${card}</div>
    ${f.history.length && !["done","feedback"].includes(f.node)?`<button class="btn ghost" data-act="back">رجوع خطوة</button>`:""}
  </div>`;
}
function sosBar(withLog){
  return `<div class="sos"><span>طوارئ <b>${EMERGENCY_NO}</b></span>${withLog&&S.flow?.answers?.emergencyCalled!=="yes"?`<button data-act="called" data-v="me" data-stay="1">سجّل أنني اتصلت</button>`:withLog?`<span class="small">تم تسجيل طلب الإسعاف</span>`:""}</div>`;
}
function rating(key,val){ return `<div class="rating" role="group">${[1,2,3,4,5].map(n=>`<button data-act="rate" data-k="${key}" data-v="${n}" aria-pressed="${val===n}">${n}</button>`).join("")}</div>`; }
function recordSummary(inc){
  const a=inc.answers||{};
  return `<dl class="kv card p12">
    <dt>بدء البلاغ</dt><dd class="mono">${hms(inc.startedAt)}</dd>
    ${FIELDS.map(([k,l])=>`<dt>${l}</dt><dd>${a[k]?ANS[a[k]]:"—"}</dd>`).join("")}
    <dt>الإجراءات المؤكدة</dt><dd>${(inc.events||[]).filter(e=>e.kind==="action").length}</dd>
  </dl>`;
}

/* ============ أفعال المستجيب ============ */
function respEvent(kind,text){
  const f=S.flow, inc=S.incidents[f.iid]; if(!inc) return;
  const events=[...(inc.events||[]), {t:now(), kind, text, by:"responder"}];
  write("update","incidents/"+f.iid,{events});
}
function respPatch(patch){ write("update","incidents/"+S.flow.iid,patch); }
function go(node){
  const f=S.flow; f.history.push(f.node); f.node=node;
  const n=PROTO[node];
  if(n && (n.type==="do"||n.type==="ask")) respEvent("shown", "عُرض: "+n.title);
  render(); window.scrollTo(0,0);
}
function keywordParse(t){
  t=t||""; const has=(...w)=>w.some(x=>t.includes(x));
  const r={responsive:"unknown",breathing:"unknown",bleeding:"unknown"};
  if(has("ما يرد","مايرد","لا يستجيب","ما يستجيب","مغمى","فاقد الوعي","طايح وما","ما يتكلم","لا يرد")) r.responsive="no";
  else if(has("يتكلم","يرد","واعي","يصيح","يقدر يتكلم","ما يقدر يتحرك")) r.responsive="yes";
  if(has("ما يتنفس","لا يتنفس","مايتنفس","وقف نفسه")) r.breathing="no";
  else if(has("يتنفس")) r.breathing="yes";
  if(has("نزيف","ينزف","دم","يدمي")) r.bleeding="yes";
  return r;
}
async function understand(text){
  if(S.sample && !offline()){
    try{
      const prompt=`أنت جزء من منصة إرشاد إسعافي. استخرج من وصف المستجيب التالي ثلاث ملاحظات فقط، ولا تشخّص.
أعد JSON فقط بهذا الشكل: {"responsive":"yes|no|unknown","breathing":"yes|no|unknown","bleeding":"yes|no|unknown","summary":"جملة عربية قصيرة تصف ما أبلغ عنه المستجيب"}
responsive: هل المصاب يستجيب/يتكلم. breathing: هل ذُكر أنه يتنفس. bleeding: هل ذُكر نزيف شديد. استخدم unknown إن لم يُذكر.
الوصف: """${text.slice(0,600)}"""`;
      const r=await S.sample.json(prompt,{modelTier:"quick"});
      const ok=v=>["yes","no","unknown"].includes(v)?v:"unknown";
      return {responsive:ok(r.responsive),breathing:ok(r.breathing),bleeding:ok(r.bleeding),summary:String(r.summary||"").slice(0,200),engine:"ai"};
    }catch(e){ if(e&&e.code==="not_granted") S.sample=null; }
  }
  return {...keywordParse(text), engine:"keywords"};
}

/* ============ الفريق الطبي ============ */
function loginCard(msg){
  return `<form class="card stack" id="loginForm" class="mw420">
    <h2>دخول الفريق الطبي</h2><p class="muted">${msg}</p>
    <label class="f">رمز الدخول<input type="password" id="code" autocomplete="off" inputmode="numeric"></label>
    <p class="small muted">رمز تجريبي: <span class="mono">${MEDIC_CODE}</span>. في النظام الفعلي يكون الدخول بحساب رسمي وتحقق متعدد العوامل.</p>
    <button class="btn primary" type="submit">دخول</button>
  </form>`;
}
function viewMedic(){
  if(!S.medic) return loginCard("لوحة البلاغات متاحة للحسابات الطبية المخوّلة فقط.");
  const list=Object.entries(S.incidents).sort((a,b)=>{ const o=x=>x.status==="closed"?1:0; return o(a[1])-o(b[1]) || (b[1].startedAt||0)-(a[1].startedAt||0); });
  return `<section class="stack">
    <div class="row between"><h2>البلاغات</h2><button class="btn ghost" data-act="logout">تسجيل الخروج</button></div>
    <p class="muted">اختر بلاغًا لمراجعته. في الميدان يصل المسعف إلى السجل نفسه بمسح الرمز على الزي.</p>
    ${list.length?`<div class="tw"><table><thead><tr><th>البلاغ</th><th>العسكري</th><th>البدء</th><th>الحالة</th><th>اكتمال التقرير</th><th>آخر تحديث</th></tr></thead><tbody>
    ${list.map(([id,i])=>{ const s=S.soldiers[i.sid]||{}; const last=Math.max(i.startedAt||0,...(i.events||[]).map(e=>e.t),...(i.medicEvents||[]).map(e=>e.t)); return `<tr class="click" data-href="#i-${esc(id)}"><td class="num">${esc(id.slice(0,6))}</td><td>${esc(s.name||"غير معروف")}</td><td class="num">${dmy(i.startedAt)} ${hms(i.startedAt)}</td><td><span class="pill ${i.status==="open"?"alert":i.status==="closed"?"":"brand"}">${statusName(i.status)}</span></td><td class="num">${completeness(i)}%</td><td class="num">${hms(last)}</td></tr>`;}).join("")}
    </tbody></table></div>`:`<div class="card"><p class="muted">لا توجد بلاغات بعد. ابدأ بلاغًا من «التسجيل وQR» عبر «محاكاة المسح».</p></div>`}
  </section>`;
}
function viewIncident(iid){
  if(!S.medic) return loginCard("السجل الإسعافي متاح للحسابات الطبية المخوّلة فقط.");
  const i=S.incidents[iid];
  if(!i) return `<div class="card"><p class="muted">${S.loaded?"البلاغ غير موجود.":"جارٍ التحميل…"}</p><a class="btn" href="#medic">العودة للبلاغات</a></div>`;
  const s=S.soldiers[i.sid]||{}, m=i.medic||{}, a=i.answers||{}, v=m.verify||{}, vt=m.vitals||{};
  const si=STATUS.findIndex(x=>x[0]===i.status);
  const nextS=STATUS[si+1];
  const evs=[...(i.events||[]).map(e=>({...e})), ...(i.medicEvents||[]).map(e=>({...e,kind:"medic"}))].sort((x,y)=>x.t-y.t);
  const tagName={shown:"عُرض",action:"نُفّذ",answer:"إجابة",report:"وصف",call:"إسعاف",note:"ملاحظة",fail:"تعذّر",medic:"المسعف",ai:"المساعد"};
  const mt=metrics(i);
  return `
  <section class="stack">
    <a href="#medic" class="small">← كل البلاغات</a>
    <div class="row between">
      <div><span class="eyebrow">سجل الحادث <span class="mono">${esc(iid)}</span></span><h2>${esc(s.name||"عسكري غير معروف")}</h2></div>
      <span class="pill ${i.status==="open"?"alert":"brand"}">${statusName(i.status)}</span>
    </div>
    <div class="stepper">${STATUS.map((x,k)=>`<span class="${k<si?"done":k===si?"on":""}">${x[1]}</span>`).join("")}</div>
    ${nextS?`<div class="row"><button class="btn primary" data-act="handoff" data-v="${nextS[0]}">${i.status==="open"?"استلام الحالة":"تسليم: "+nextS[1]}</button><span class="small muted">يُسجَّل وقت كل تسليم في السجل نفسه.</span></div>`:""}
  </section>
  <section class="sec grid2">
    <div class="card stack">
      <h3>الهوية والمعلومات الطبية</h3>
      <dl class="kv">
        <dt>الوحدة</dt><dd>${esc(s.unit||"—")}</dd>
        <dt>فصيلة الدم</dt><dd class="mono">${esc(s.blood||"—")}</dd>
        <dt>الحساسية</dt><dd>${s.allergies&&!/^لا يوجد/.test(s.allergies)?`<span class="pill alert">${esc(s.allergies)}</span>`:esc(s.allergies||"—")}</dd>
        <dt>أمراض مزمنة</dt><dd>${esc(s.chronic||"—")}</dd>
        <dt>أدوية</dt><dd>${esc(s.meds||"—")}</dd>
      </dl>
      <label class="row small"><input type="checkbox" data-act="idVerify" ${m.idVerified?"checked":""}> تحققتُ من هوية المصاب بوسيلة أخرى (البطاقة أو الوحدة)</label>
      ${m.idVerified?"":`<p class="note">رمز QR وحده لا يثبت الهوية وقد يُنسخ. تحقق قبل الاعتماد على المعلومات الطبية.</p>`}
      <p class="small muted">بيانات افتراضية. يتطلب الربط بالملفات الطبية الرسمية تكاملًا معتمدًا.</p>
    </div>
    <div class="card stack">
      <h3>تقرير المستجيب الأول</h3>
      <p class="small muted">كل معلومة هنا مصدرها المستجيب، ولا تُعد موثوقة طبيًا حتى يؤكدها المسعف.</p>
      ${i.description?`<p>«${esc(i.description)}»</p>`:`<p class="muted small">لم يكتب المستجيب وصفًا.</p>`}
      ${i.ai?.summary?`<p class="ai small">ملخص المساعد: ${esc(i.ai.summary)}</p>`:""}
      ${i.location?`<p class="small">الموقع: ${esc(i.location)}</p>`:""}
      <div>${FIELDS.map(([k,l])=>`<div class="vrow"><span>${l} <b>${a[k]?ANS[a[k]]:"—"}</b></span>
        <span class="row">${v[k]==="confirmed"?`<span class="pill ok">أكده المسعف</span>`:v[k]==="corrected"?`<span class="pill warn">صححه المسعف</span>`:`<span class="pill">غير متحقق</span>`}
        <button class="btn ghost small" data-act="verify" data-k="${k}" data-v="confirmed">تأكيد</button><button class="btn ghost small" data-act="verify" data-k="${k}" data-v="corrected">تصحيح</button></span></div>`).join("")}</div>
    </div>
  </section>
  <section class="sec grid2">
    <div class="card stack">
      <h3>التسلسل الزمني</h3>
      <p class="small muted">يفرّق السجل بين التعليمات التي عُرضت والإجراءات التي أكد المستجيب تنفيذها.</p>
      <ol class="tl">${evs.map(e=>`<li><span class="t mono">${hms(e.t)}<br>+${dur(e.t-i.startedAt)}</span><span><span class="tag ${e.kind}">${tagName[e.kind]||e.kind}</span>${esc(e.text)}</span></li>`).join("")||`<li><span></span><span class="muted">لا توجد أحداث بعد.</span></li>`}</ol>
    </div>
    <div class="stack">
      <form class="card stack" id="assessForm">
        <h3>التقييم الطبي</h3>
        <div class="grid3 vit">
          <label class="f">النبض /د<input type="number" id="v-hr" value="${esc(vt.hr??"")}"></label>
          <label class="f">الضغط<input type="text" id="v-bp" placeholder="120/80" value="${esc(vt.bp??"")}"></label>
          <label class="f">SpO₂ %<input type="number" id="v-spo2" value="${esc(vt.spo2??"")}"></label>
          <label class="f">التنفس /د<input type="number" id="v-rr" value="${esc(vt.rr??"")}"></label>
          <label class="f">GCS<input type="number" id="v-gcs" min="3" max="15" value="${esc(vt.gcs??"")}"></label>
        </div>
        <label class="f">التقييم<textarea id="assess">${esc(m.assessment||"")}</textarea></label>
        <label class="f">الإجراءات الطبية المنفذة<textarea id="interv">${esc(m.interventions||"")}</textarea></label>
        <button class="btn primary" type="submit">حفظ التقييم</button>
      </form>
      <div class="card stack">
        <h3>مؤشرات هذا البلاغ</h3>
        <dl class="kv">
          <dt>من المسح إلى بدء البلاغ</dt><dd class="mono">${dur(mt.toStart)}</dd>
          <dt>اكتمال التقرير الأولي</dt><dd class="mono">${mt.complete}%</dd>
          <dt>من البلاغ إلى فتح المسعف للسجل</dt><dd class="mono">${dur(mt.toMedic)}</dd>
          <dt>وصول المسعف إلى المعلومات</dt><dd class="mono">${dur(mt.access)}</dd>
          <dt>انتقال أحداث المستجيب</dt><dd class="mono">${mt.transfer==null?"—":mt.transfer+"%"}</dd>
        </dl>
      </div>
      <div class="card stack">
        <h3>سجل الوصول</h3>
        <ol class="tl">${(i.access||[]).slice(-6).reverse().map(x=>`<li><span class="t mono">${hms(x.t)}</span><span>${esc(x.who)} · ${x.action==="view"?"اطلاع":"تعديل"}</span></li>`).join("")||`<li><span></span><span class="muted">—</span></li>`}</ol>
      </div>
    </div>
  </section>`;
}
function medicPatch(iid, patch, logText){
  const i=S.incidents[iid]; const access=[...(i.access||[]),{t:now(),who:"حساب طبي تجريبي",action:"edit"}];
  const p={...patch, access};
  if(logText) p.medicEvents=[...(i.medicEvents||[]),{t:now(),text:logText,by:"medic"}];
  write("update","incidents/"+iid,p);
}

/* ============ المؤشرات ============ */
function viewMetrics(){
  const list=Object.entries(S.incidents).sort((a,b)=>(a[1].startedAt||0)-(b[1].startedAt||0));
  const ms=list.map(([id,i])=>({id,i,m:metrics(i)}));
  const avg=k=>{ const v=ms.map(x=>x.m[k]).filter(x=>x!=null); return v.length? v.reduce((a,b)=>a+b,0)/v.length : null; };
  const a={toStart:avg("toStart"),complete:avg("complete"),toMedic:avg("toMedic"),access:avg("access"),transfer:avg("transfer"),ease:avg("ease"),clarity:avg("clarity")};
  const f1=x=>x==null?"—":x.toFixed(1);
  return `<section class="stack">
    <span class="eyebrow">الحادي عشر · قياس النجاح</span>
    <h2>مؤشرات تجارب المحاكاة</h2>
    <p class="muted">تُحسب تلقائيًا من كل بلاغ تجريبي، ولا تُستخدم فيها حالات طبية حقيقية. انسخ الجدول لتحليله أو مقارنته بالتسليم التقليدي.</p>
  </section>
  <section class="sec grid3">
    <div class="card stat"><span class="muted small">متوسط الوقت من المسح إلى بدء البلاغ</span><b>${dur(a.toStart)}</b></div>
    <div class="card stat"><span class="muted small">متوسط اكتمال التقرير الأولي</span><b>${a.complete==null?"—":Math.round(a.complete)+"%"}</b></div>
    <div class="card stat"><span class="muted small">متوسط وصول المسعف إلى المعلومات</span><b>${dur(a.access)}</b></div>
    <div class="card stat"><span class="muted small">نجاح انتقال المعلومات</span><b>${a.transfer==null?"—":Math.round(a.transfer)+"%"}</b></div>
    <div class="card stat"><span class="muted small">سهولة الاستخدام (من ٥)</span><b>${f1(a.ease)}</b></div>
    <div class="card stat"><span class="muted small">وضوح الإرشادات (من ٥)</span><b>${f1(a.clarity)}</b></div>
  </section>
  <section class="sec">
    <div class="row between"><h3>تفاصيل كل تجربة</h3><button class="btn" data-act="copyCsv">نسخ الجدول CSV</button></div>
    ${ms.length?`<div class="tw"><table><thead><tr><th>البلاغ</th><th>المسح ← البدء</th><th>الاكتمال</th><th>البلاغ ← فتح المسعف</th><th>وصول المسعف</th><th>الانتقال</th><th>السهولة</th><th>الوضوح</th></tr></thead><tbody>
      ${ms.map(({id,m})=>`<tr><td class="num">${esc(id.slice(0,6))}</td><td class="num">${dur(m.toStart)}</td><td class="num">${m.complete}%</td><td class="num">${dur(m.toMedic)}</td><td class="num">${dur(m.access)}</td><td class="num">${m.transfer==null?"—":m.transfer+"%"}</td><td class="num">${m.ease??"—"}</td><td class="num">${m.clarity??"—"}</td></tr>`).join("")}
    </tbody></table></div>`:`<div class="card"><p class="muted">لا توجد تجارب بعد. كل بلاغ تجريبي يضيف صفًا هنا.</p></div>`}
    <p class="small muted">مؤشر المزامنة بعد عودة الاتصال يظهر في الشريط العلوي: عدد التحديثات المنتظرة، ثم صفر بعد المزامنة.${S.lastSync?` آخر مزامنة: <span class="mono">${hms(S.lastSync)}</span>.`:""}</p>
  </section>`;
}
function csv(){
  const rows=[["incident","scan_to_start_s","completeness_pct","report_to_medic_s","medic_access_s","transfer_pct","ease","clarity"]];
  Object.entries(S.incidents).forEach(([id,i])=>{ const m=metrics(i); const s=x=>x==null?"":Math.round(x/1000); rows.push([id,s(m.toStart),m.complete,s(m.toMedic),s(m.access),m.transfer??"",m.ease??"",m.clarity??""]); });
  return rows.map(r=>r.join(",")).join("\n");
}

/* ============ بعد الرسم ============ */
function afterRender(r){
  document.querySelectorAll("[data-pct]").forEach(e=>{e.style.width=e.dataset.pct+"%";});
  if(r.name==="incident" && S.medic){
    const i=S.incidents[r.iid];
    if(i && !S.viewOpened[r.iid]){
      S.viewOpened[r.iid]=true;
      const m=i.medic||{}; const t=now();
      const patch={ medic:{ seenEvents:(i.events||[]).length, lastViewAt:t, loginAt: m.loginAt || S.medicLoginAt || t }, access:[...(i.access||[]),{t,who:"حساب طبي تجريبي",action:"view"}] };
      if(!m.openedAt) patch.medic.openedAt=t;
      setTimeout(()=>write("update","incidents/"+r.iid,patch),0);
    }
  }
}

/* ============ الأحداث ============ */
document.addEventListener("click", async ev=>{
  const tr=ev.target.closest("tr[data-href]"); if(tr){ location.hash=tr.dataset.href; return; }
  const b=ev.target.closest("[data-act]"); if(!b) return;
  const act=b.dataset.act, f=S.flow;
  if(act==="toggleOffline"){ S.simOffline=!S.simOffline; ls.set("simOffline",S.simOffline); toast(S.simOffline?"وضع انقطاع الاتصال: تُحفظ التحديثات على الجهاز":"عاد الاتصال: جارٍ المزامنة"); render(); flush(); return; }
  if(act==="fillRandom"){ const n=["عبدالله القحطاني","ماجد الدوسري","تركي المطيري","خالد الزهراني","بندر الغامدي"], u=["سرية المشاة ٢","وحدة الإمداد","الكتيبة الهندسية","سرية الاستطلاع"]; const p=a=>a[Math.floor(Math.random()*a.length)];
    $("#s-name").value=p(n)+" (افتراضي)"; $("#s-unit").value=p(u); $("#s-blood").selectedIndex=Math.floor(Math.random()*8); $("#s-all").value=p(["لا يوجد","البنسلين","المكسرات","السلفا"]); $("#s-chr").value=p(["لا يوجد","سكري النوع الأول","ربو"]); $("#s-med").value=p(["لا يوجد","إنسولين","بخاخ موسّع للشعب"]); return; }
  if(act==="startReport"){
    const iid=rid(12), t=now();
    f.iid=iid;
    write("set","incidents/"+iid,{sid:f.sid,scannedAt:f.scannedAt,startedAt:t,status:"open",description:"",location:"",answers:{},events:[{t,kind:"report",text:"بدء بلاغ إسعافي عبر مسح الرمز",by:"responder"}],medic:{},medicEvents:[],access:[],handoffs:[],demo:true});
    f.history=[]; f.node="describe"; render(); window.scrollTo(0,0); return;
  }
  if(act==="medicFromScan"){ if(S.medic){ const k=latestIncidentId(f.sid); location.hash = k? "i-"+k : "medic"; } else { f.node="medicLogin"; render(); } return; }
  if(act==="chip"){ $("#desc").value=b.dataset.v; f.draft=b.dataset.v; return; }
  if(act==="submitDesc"||act==="skipDesc"){
    const text=act==="submitDesc"?($("#desc").value||"").trim():""; const loc=($("#loc")?.value||"").trim();
    f.draft=text; f.loc=loc;
    const patch={location:loc};
    if(text){ f.busy=true; render(); const ai=await understand(text); f.busy=false; f.ai=ai; patch.description=text; patch.ai=ai;
      const evs=[...(S.incidents[f.iid].events||[]),{t:now(),kind:"report",text:"وصف المستجيب: "+text,by:"responder"}];
      const got=Object.entries(ai).filter(([k,v])=>["responsive","breathing","bleeding"].includes(k)&&v!=="unknown").map(([k,v])=>({responsive:"يستجيب",breathing:"يتنفس",bleeding:"نزيف"}[k]+": "+ANS[v]));
      evs.push({t:now(),kind:"ai",text:(ai.engine==="ai"?"المساعد الذكي":"المطابقة النصية")+" اقترح: "+(got.join("، ")||"لا شيء محدد")+" (بانتظار تأكيد المستجيب)",by:"system"});
      patch.events=evs;
    }
    respPatch(patch); go("safe"); return;
  }
  if(act==="speak"){ const n=PROTO[f.node]; speak((n.title||"")+". "+(n.body||"")); return; }
  if(act==="did"){ const n=PROTO[f.node]; respEvent("action","نفّذ المستجيب: "+n.title); go(n.next(f)); return; }
  if(act==="couldnt"){ const n=PROTO[f.node]; respEvent("fail","لم يستطع المستجيب: "+(n.title||"بدء الضغطات")); go(n.next(f)); return; }
  if(act==="ans"){ const n=PROTO[f.node]; f.answers[n.key]=b.dataset.v;
    const inc=S.incidents[f.iid]; const answers={...(inc.answers||{}),[n.key]:b.dataset.v};
    const events=[...(inc.events||[]),{t:now(),kind:"answer",text:n.title+" ← "+ANS[b.dataset.v],by:"responder"}];
    write("update","incidents/"+f.iid,{answers,events}); go(n.next(f)); return; }
  if(act==="called"){ const v=b.dataset.v; const txt={me:"المستجيب اتصل بالإسعاف",other:"شخص آخر يتصل بالإسعاف",no:"لم يتمكن المستجيب من الاتصال بالإسعاف"}[v];
    f.answers.emergencyCalled = v==="no"?"no":"yes";
    const inc=S.incidents[f.iid]; write("update","incidents/"+f.iid,{answers:{...(inc.answers||{}),emergencyCalled:f.answers.emergencyCalled},events:[...(inc.events||[]),{t:now(),kind:"call",text:txt,by:"responder"}]});
    if(b.dataset.stay){ render(); toast("تم تسجيل طلب الإسعاف"); } else go(PROTO.call.next(f)); return; }
  if(act==="cprStart"){ respEvent("action","بدأ المستجيب الضغطات على الصدر"); go("wait"); return; }
  if(act==="goCpr"){ respEvent("report","المستجيب أبلغ أن المصاب توقف عن التنفس"); go("cpr"); return; }
  if(act==="metro"){ toggleMetro(); render(); return; }
  if(act==="respNote"){ const v=($("#note").value||"").trim(); if(!v) return; respEvent("note","ملاحظة المستجيب: "+v); $("#note").value=""; toast("حُفظت الملاحظة"); return; }
  if(act==="arrived"){ stopMetro(); respEvent("report","المستجيب أكد وصول الفريق الطبي"); respPatch({responderDoneAt:now()}); go("feedback"); return; }
  if(act==="rate"){ f[b.dataset.k]=+b.dataset.v; render(); return; }
  if(act==="finish"){ respPatch({feedback:{ease:f.ease??null,clarity:f.clarity??null}}); go("done"); return; }
  if(act==="back"){ if(f.history.length){ f.node=f.history.pop(); render(); } return; }
  if(act==="logout"){ S.medic=false; ss.set("medic","0"); render(); return; }
  const iid=route().iid;
  if(act==="handoff"){ const i=S.incidents[iid]; const to=b.dataset.v; medicPatch(iid,{status:to,handoffs:[...(i.handoffs||[]),{t:now(),from:i.status,to}]},(i.status==="open"?"استلم المسعف الحالة":"تسليم الحالة: "+statusName(to))); toast("تم تسجيل "+statusName(to)); return; }
  if(act==="verify"){ const i=S.incidents[iid]; const k=b.dataset.k, v=b.dataset.v; const lbl=FIELDS.find(x=>x[0]===k)[1];
    medicPatch(iid,{medic:{verify:{...((i.medic||{}).verify||{}),[k]:v}}}, (v==="confirmed"?"أكد المسعف: ":"صحح المسعف: ")+lbl); return; }
  if(act==="idVerify"){ medicPatch(iid,{medic:{idVerified:b.checked}}, b.checked?"تحقق المسعف من هوية المصاب":"ألغى المسعف التحقق من الهوية"); return; }
  if(act==="copyCsv"){ const t=csv(); try{ await navigator.clipboard.writeText(t); toast("تم نسخ الجدول"); }catch(e){ toast("تعذّر النسخ التلقائي"); } return; }
});
document.addEventListener("submit", ev=>{
  ev.preventDefault();
  const id=ev.target.id;
  if(id==="loginForm"){
    if(($("#code").value||"").trim()!==MEDIC_CODE){ toast("رمز الدخول غير صحيح"); return; }
    S.medic=true; S.medicLoginAt=now(); ss.set("medic","1"); toast("تم الدخول بحساب طبي تجريبي");
    const r=route();
    if(r.name==="scan"){ const id2=latestIncidentId(r.sid); location.hash = id2? "i-"+id2 : "medic"; }
    else render();
    return;
  }
  if(id==="addForm"){
    const g=x=>($(x).value||"").trim();
    if(!g("#s-name")){ toast("اكتب اسمًا افتراضيًا"); return; }
    const sid=rid(10);
    write("set","soldiers/"+sid,{name:g("#s-name"),unit:g("#s-unit")||"—",blood:$("#s-blood").value,allergies:g("#s-all")||"لا يوجد",chronic:g("#s-chr")||"لا يوجد",meds:g("#s-med")||"لا يوجد",createdAt:now(),demo:true});
    ev.target.reset(); toast("تم التسجيل وتوليد الرمز"); return;
  }
  if(id==="assessForm"){
    const iid=route().iid; const g=x=>($(x).value||"").trim();
    medicPatch(iid,{medic:{vitals:{hr:g("#v-hr"),bp:g("#v-bp"),spo2:g("#v-spo2"),rr:g("#v-rr"),gcs:g("#v-gcs")},assessment:g("#assess"),interventions:g("#interv")}},"حدّث المسعف التقييم والعلامات الحيوية");
    toast(offline()?"حُفظ على الجهاز وسيُزامن عند عودة الاتصال":"تم حفظ التقييم"); return;
  }
});

/* ============ إيقاع الضغطات ============ */
function toggleMetro(){ S.metro? stopMetro() : startMetro(); }
function startMetro(){
  try{ const ctx=new (window.AudioContext||window.webkitAudioContext)(); S.metroCtx=ctx;
    S.metro=setInterval(()=>{ const o=ctx.createOscillator(), g=ctx.createGain(); o.frequency.value=880; g.gain.value=.15; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime+.05); }, 545);
  }catch(e){ toast("الصوت غير متاح"); }
}
function stopMetro(){ if(S.metro){ clearInterval(S.metro); S.metro=null; try{S.metroCtx.close();}catch(e){} } }

initStore();
