import { useState, useEffect, useRef, useCallback, createContext, useContext, useReducer } from "react";
import { createClient } from "@supabase/supabase-js";

/* ═══════════════════════════════════════════════════════
   PASTE YOUR KEYS HERE after copying from .env
   Or set them in .env as VITE_SUPABASE_URL etc.
═══════════════════════════════════════════════════════ */
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(SUPA_URL, SUPA_KEY);
const CONFIGURED = !SUPA_URL.includes("placeholder");

/* ── AI ── */
const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;

async function callAI(messages, system = "") {

  const res = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: system || "You are a helpful study assistant." },
          ...messages
        ],
        temperature: 0.7
      })
    }
  );

  const data = await res.json();

  if (!res.ok) {
    console.error("Groq error:", data);
    throw new Error(data.error?.message || "Groq request failed");
  }

  return data.choices[0].message.content;
}
async function callAIJSON(prompt) {

  const text = await callAI([
    { role: "user", content: prompt + "\n\nRespond ONLY with valid JSON." }
  ]);

  return JSON.parse(
    text.replace(/```json|```/g, "").trim()
  );
}
/* ── DB helpers ── */
const db = {
  async getProfile(id) { try { const { data } = await supabase.from("profiles").select("*").eq("id", id).single(); return data; } catch { return null; } },
  async upsertProfile(id, fields) { try { await supabase.from("profiles").upsert({ id, ...fields, updated_at: new Date().toISOString() }); } catch(e) { console.warn("upsert:", e); } },
  async addXP(id, pts) {
    try {
      const { data: p } = await supabase.from("profiles").select("total_xp,streak,last_active").eq("id", id).single();
      const today = new Date().toDateString(), yesterday = new Date(Date.now() - 86400000).toDateString();
      const lastDay = p?.last_active ? new Date(p.last_active).toDateString() : null;
      let streak = p?.streak || 0;
      if (lastDay === yesterday) streak++; else if (lastDay !== today) streak = 1;
      await supabase.from("profiles").update({ total_xp: (p?.total_xp || 0) + pts, streak, last_active: new Date().toISOString() }).eq("id", id);
      return { xp: (p?.total_xp || 0) + pts, streak };
    } catch { return null; }
  },
  async listChats(uid) { try { const { data } = await supabase.from("chat_sessions").select("id,title,updated_at").eq("user_id", uid).order("updated_at", { ascending: false }).limit(20); return data || []; } catch { return []; } },
  async createChat(uid) { try { const { data } = await supabase.from("chat_sessions").insert({ user_id: uid, title: "New Chat", messages: [] }).select().single(); return data; } catch { return null; } },
  async saveChat(id, msgs, title) { try { await supabase.from("chat_sessions").update({ messages: msgs, title: title || "Chat", updated_at: new Date().toISOString() }).eq("id", id); } catch {} },
  async deleteChat(id) { try { await supabase.from("chat_sessions").delete().eq("id", id); } catch {} },
  async listNotes(uid) { try { const { data } = await supabase.from("notes").select("*").eq("user_id", uid).order("updated_at", { ascending: false }); return data || []; } catch { return []; } },
  async saveNote(n) { try { const { data } = await supabase.from("notes").upsert({ ...n, updated_at: new Date().toISOString() }).select().single(); return data; } catch { return null; } },
  async deleteNote(id) { try { await supabase.from("notes").delete().eq("id", id); } catch {} },
  async listDecks(uid) { try { const { data } = await supabase.from("flashcard_decks").select("*").eq("user_id", uid).order("created_at", { ascending: false }); return data || []; } catch { return []; } },
  async saveDeck(d) { try { const { data } = await supabase.from("flashcard_decks").upsert(d).select().single(); return data; } catch { return null; } },
  async deleteDeck(id) { try { await supabase.from("flashcard_decks").delete().eq("id", id); } catch {} },
  async listTasks(uid) { try { const { data } = await supabase.from("tasks").select("*").eq("user_id", uid).order("created_at", { ascending: false }); return data || []; } catch { return []; } },
  async saveTask(t) { try { const { data } = await supabase.from("tasks").upsert(t).select().single(); return data; } catch { return null; } },
  async toggleTask(id, done) { try { await supabase.from("tasks").update({ done, completed_at: done ? new Date().toISOString() : null }).eq("id", id); } catch {} },
  async deleteTask(id) { try { await supabase.from("tasks").delete().eq("id", id); } catch {} },
};

/* ── Config ── */
const TOOLS = [
  { id:"dashboard", e:"⌂",  n:"Home",         tag:"Command center",   c:"#0ea5e9" },
  { id:"chat",      e:"✦",  n:"Brain Dump",   tag:"AI tutor 24/7",    c:"#8b5cf6" },
  { id:"notes",     e:"✎",  n:"Note Vault",   tag:"Smart notes",       c:"#10b981" },
  { id:"flash",     e:"⚡", n:"Flash Mode",   tag:"Study faster",      c:"#f59e0b" },
  { id:"planner",   e:"☑",  n:"Planner",      tag:"Crush tasks",       c:"#f43f5e" },
  { id:"tldr",      e:"≡",  n:"TL;DR",        tag:"Cut the fluff",     c:"#38bdf8" },
  { id:"quiz",      e:"◎",  n:"Quiz Grind",   tag:"Test yourself",     c:"#f97316" },
  { id:"essay",     e:"✒",  n:"Essay Era",    tag:"Write better",      c:"#a78bfa" },
  { id:"exam",      e:"◈",  n:"Exam Oracle",  tag:"Predict your exam", c:"#fb7185" },
  { id:"path",      e:"→",  n:"Study Path",   tag:"Your roadmap",      c:"#818cf8" },
{ id:"mindmap", e:"🧠", n:"Mind Map", tag:"Visual learning", c:"#6366f1" },
];
const ONBOARDING = [
  { id:"grade", q:"What's your education level?", e:"🎓", opts:["High School (9-10)","High School (11-12)","Undergraduate","Postgraduate","Self-learning"] },
  { id:"goal",  q:"Your main study goal?",        e:"🎯", opts:["Ace exams","Deep understanding","Quick revision","Learn something new","Career prep"] },
  { id:"style", q:"How do you learn best?",       e:"🧠", opts:["Visual (diagrams)","Reading & writing","Practice problems","Discussion","Mixed"] },
  { id:"daily_time", q:"Daily study time?",       e:"⏰", opts:["Under 30 min","30–60 min","1–2 hours","2–4 hours","4+ hours"] },
  { id:"struggle", q:"Biggest struggle?",         e:"😤", opts:["Staying focused","Understanding concepts","Remembering things","Writing essays","Time management"] },
];
const LEVELS = [
  { min:0, n:"Freshman", i:"🌱" }, { min:200, n:"Scholar", i:"📖" },
  { min:500, n:"Thinker", i:"🧩" }, { min:1000, n:"Learner+", i:"⚡" },
  { min:2000, n:"Brain Trust", i:"🧠" }, { min:5000, n:"Genius", i:"💡" },
];
function getLevel(xp) {
  for (let i = LEVELS.length - 1; i >= 0; i--) if (xp >= LEVELS[i].min) return { ...LEVELS[i], num: i+1, next: LEVELS[i+1] || null };
  return { ...LEVELS[0], num:1, next:LEVELS[1] };
}

/* ── Global State ── */
const Ctx = createContext(null);
function reducer(s, a) {
  switch(a.t) {
    case "SET": return { ...s, ...a.v };
    case "ADD_TOAST": return { ...s, toasts: [...s.toasts, { id:Date.now(), ...a.v }] };
    case "DEL_TOAST": return { ...s, toasts: s.toasts.filter(t => t.id !== a.id) };
    default: return s;
  }
}
function AppProvider({ children }) {
  const [s, d] = useReducer(reducer, {
    screen: "loading", user:null, profile:null,
    tool:"dashboard", sidebar:true,
    chats:[], chatId:null, chatMsgs:{},
    notes:[], decks:[], tasks:[],
    toasts:[], apiKey:"",
  });
  const set = useCallback(v => d({ t:"SET", v }), []);
  const toast = useCallback((msg, type="info", icon="✦") => {
    const id = Date.now();
    d({ t:"ADD_TOAST", v:{msg,type,icon,id} });
    setTimeout(() => d({ t:"DEL_TOAST", id }), 3000);
  }, []);

  useEffect(() => {
    const k = (() => { try { return localStorage.getItem("kos_key")||""; } catch { return ""; } })();
    if (k) { window.__KOS_KEY__ = k; set({ apiKey:k }); }
  }, []);

  useEffect(() => {
    if (!CONFIGURED) { set({ screen:"landing" }); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data?.session?.user) boot(data.session.user);
      else set({ screen:"landing" });
    }).catch(() => { if (alive) set({ screen:"landing" }); });
    const { data:{ subscription } } = supabase.auth.onAuthStateChange((e, session) => {
      if (!alive) return;
      if (session?.user) boot(session.user);
      else set({ user:null, profile:null, screen:"landing" });
    });
    return () => { alive=false; subscription.unsubscribe(); };
  }, []);

  async function boot(user) {
    set({ user });
    let p = await db.getProfile(user.id);
    if (!p) {
      await db.upsertProfile(user.id, { name:user.user_metadata?.full_name||user.email?.split("@")[0]||"Student", email:user.email, avatar_url:user.user_metadata?.avatar_url||"", total_xp:25, streak:1, last_active:new Date().toISOString(), onboarding_done:false });
      p = await db.getProfile(user.id);
    }
    set({ profile:p });
    const k = (() => { try { return localStorage.getItem("kos_key")||""; } catch { return ""; } })();
    
    if (!p?.onboarding_done) { set({ screen:"onboarding" }); return; }
    const chatList = await db.listChats(user.id);
    set({ screen:"app", chats:chatList, chatId:chatList[0]?.id||null });
  }

  const saveKey = useCallback(k => {
    try { localStorage.setItem("kos_key", k); } catch {}
    window.__KOS_KEY__ = k;
    set({ apiKey:k });
  }, []);

  const addXP = useCallback(async pts => {
    if (!s.user?.id) return;
    const r = await db.addXP(s.user.id, pts);
    if (r) { set({ profile:{ ...s.profile, total_xp:r.xp, streak:r.streak } }); toast(`+${pts} XP`, "xp", "⚡"); }
  }, [s.user?.id, s.profile]);

  return <Ctx.Provider value={{ ...s, set, toast, saveKey, addXP, level:getLevel(s.profile?.total_xp||0) }}>{children}</Ctx.Provider>;
}
const useApp = () => useContext(Ctx);
function useMobile(){
  const [mobile,setMobile]=useState(window.innerWidth < 768)

  useEffect(()=>{
    const r = () => setMobile(window.innerWidth < 768)

    window.addEventListener("resize", r)

    return () => window.removeEventListener("resize", r)
  },[])

  return mobile
}

/* ══════════════════════════════════
   MAIN EXPORT
══════════════════════════════════ */

export default function App() {

  const mobile = window.innerWidth < 768

  return (
    <AppProvider>
      <GlobalStyles />
      <Router />
      <BottomNav />
      <ToastLayer />
      {!mobile && <FloatingAI />}
    </AppProvider>
  );

}

function Router() {
  const { screen } = useApp();

  if (screen === "loading") return <Splash />;
  if (screen === "landing") return <Landing />;
  if (screen === "onboarding") return <Onboarding />;

  return <Shell />;
}
/* ── Splash ── */
function Splash() {
  return (

    <div style={{
      ...C.center,
      flexDirection:"column",
      gap:18,
      position:"relative",
      overflow:"hidden"
    }}>

      {/* Glow Background */}
      <div style={{
        position:"absolute",
        width:500,
        height:500,
        borderRadius:"50%",
        background:"radial-gradient(circle,#6366f155,transparent 60%)",
        filter:"blur(80px)",
        animation:"glowMove 6s ease-in-out infinite"
      }}/>

      {/* Logo */}
      <div style={{
        padding:20,
        borderRadius:"50%",
        background:"radial-gradient(circle,#6366f122,transparent)",
        animation:"floatLogo 3s ease-in-out infinite"
      }}>
        <img
          src="/logo.png"
          style={{
            width:90,
            height:90,
            objectFit:"contain"
          }}
        />
      </div>

      {/* Title */}
      <div style={{
        fontSize:"1.4rem",
        fontWeight:700,
        color:"#f0f2f8",
        letterSpacing:"0.04em"
      }}>
        Knowledge OS
      </div>

      {/* Subtitle */}
      <div style={{
        fontSize:"0.8rem",
        opacity:0.6
      }}>
        AI Powered Study System
      </div>

      {/* Loading dots */}
      <div style={{ display:"flex", gap:6 }}>
        {[0,1,2].map(i => (
          <span
            key={i}
            style={{
              width:6,
              height:6,
              borderRadius:"50%",
              background:"#6366f1",
              animation:`kpulse 1.2s ${i*0.2}s infinite`
            }}
          />
        ))}
      </div>

    </div>
  );
}
/* ── Landing ── */
function Landing() {
  const [busy, setBusy] = useState(false);
  const login = async () => {
    setBusy(true);
    try { await supabase.auth.signInWithOAuth({ provider:"google", options:{ redirectTo:window.location.origin } }); }
    catch(e) { console.error(e); setBusy(false); }
  };
  return (
    <div style={{ minHeight:"100vh", overflowY:"auto", background:"#080c14" }}>
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", overflow:"hidden" }}>
        <div style={{ position:"absolute", width:500, height:500, borderRadius:"50%", background:"rgba(14,165,233,0.07)", filter:"blur(100px)", top:-100, left:-100 }} />
        <div style={{ position:"absolute", width:400, height:400, borderRadius:"50%", background:"rgba(99,102,241,0.06)", filter:"blur(100px)", bottom:-80, right:-80 }} />
      </div>
      {/* Nav */}
      <nav style={{ position:"relative", zIndex:10, display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 36px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Logo size={30} r={8} f={14} />
          <span style={{ fontSize:"0.9rem", fontWeight:700, color:"#f0f2f8" }}>Knowledge OS</span>
          <span style={C.badge}>v3.0</span>
        </div>
        <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>

<button style={{ ...C.btnPrimary, padding:"14px 32px", fontSize:"0.9375rem", borderRadius:100 }} onClick={login} disabled={busy}>
  <Gicon size={18} /> {busy ? "Connecting…" : "Get started"}
</button>

<button
onClick={login}
style={{
 ...C.btnGhostSmall,
 height:36,
 padding:"0 18px"
}}
>
Login
</button>

</div>
      </nav>
      {/* Hero */}
      <div style={{ textAlign:"center", padding:"80px 24px 60px", maxWidth:680, margin:"0 auto", position:"relative", zIndex:10 }}>
        <div style={{ display:"inline-block", background:"rgba(14,165,233,0.08)", border:"1px solid rgba(14,165,233,0.2)", borderRadius:100, padding:"4px 16px", fontSize:"0.72rem", color:"#0ea5e9", fontWeight:700, marginBottom:28 }}>
          🚀 Your AI Study System
        </div>
        <h1 style={{ fontSize:"clamp(2.2rem,5vw,3.5rem)", fontWeight:800, lineHeight:1.1, marginBottom:20, color:"#f0f2f8" }}>
          Study smarter.<br />
          <span style={{ background:"linear-gradient(135deg,#0ea5e9 0%,#38bdf8 50%,#8b5cf6 100%)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Not harder.</span>
        </h1>
        <p style={{ fontSize:"1.05rem", color:"rgba(200,204,216,0.6)", maxWidth:480, margin:"0 auto 40px", lineHeight:1.75 }}>
          13 AI tools in one platform. Learns your style. Remembers your progress. Gets smarter every session.
        </p>
        <button style={{ ...C.btnPrimary, padding:"14px 32px", fontSize:"0.9375rem", borderRadius:100 }} onClick={login} disabled={busy}>
  <Gicon size={18} /> {busy ? "Connecting…" : "Get Started"}
</button>
      </div>
      {/* Tool pills */}
      <div style={{ textAlign:"center", padding:"20px 24px 60px", position:"relative", zIndex:10 }}>
        <p style={{ fontSize:"0.65rem", fontWeight:700, letterSpacing:"0.12em", color:"rgba(126,132,148,0.5)", textTransform:"uppercase", marginBottom:20 }}>13 TOOLS IN ONE PLACE</p>
        <div style={{ display:"flex", flexWrap:"wrap", gap:9, justifyContent:"center", maxWidth:800, margin:"0 auto" }}>
          {["AI Tutor","Flashcards","Quiz Grind","Exam Predictor","TL;DR","Study Path","Note Vault","Study Rooms","Doubt Forum","Essay Era","Planner","Note Market","Study Dashboard"].map(t => (
            <div key={t} style={{ padding:"7px 16px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:100, fontSize:"0.8rem", color:"rgba(200,204,216,0.6)", fontWeight:500 }}>{t}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Onboarding ── */
function Onboarding() {
  const { user, profile, set, toast } = useApp();
  const [step, setStep] = useState(0);
  const [ans, setAns] = useState({});
  const [saving, setSaving] = useState(false);
  const q = ONBOARDING[step];
  const pct = (step / ONBOARDING.length) * 100;
  const next = async () => {
    if (!ans[q.id]) return;
    if (step < ONBOARDING.length - 1) { setStep(s=>s+1); return; }
    setSaving(true);
    await db.upsertProfile(user.id, { ...ans, onboarding_done:true });
    set({ profile:{ ...profile, ...ans, onboarding_done:true }, screen:"app" });
    toast("Welcome! Let's study 🎓", "success");
    setSaving(false);
  };
  return (
    <div style={C.center}>
      <div style={C.card}>
        <div style={{ background:"rgba(255,255,255,0.05)", borderRadius:99, height:3, marginBottom:8 }}>
          <div style={{ height:"100%", background:"linear-gradient(90deg,#0ea5e9,#8b5cf6)", borderRadius:99, width:`${pct}%`, transition:"width 0.4s" }} />
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.7rem", color:"rgba(126,132,148,0.5)", marginBottom:28 }}>
          <span>{step+1} of {ONBOARDING.length}</span><span>{Math.round(pct)}%</span>
        </div>
        <div style={{ fontSize:"1.8rem", marginBottom:12 }}>{q.e}</div>
        <h2 style={{ fontSize:"1.1rem", fontWeight:700, marginBottom:20, color:"#f0f2f8", lineHeight:1.4 }}>{q.q}</h2>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:24 }}>
          {q.opts.map(o => (
            <button key={o} onClick={()=>setAns(p=>({...p,[q.id]:o}))} style={{ padding:"10px 12px", borderRadius:10, border:`1px solid ${ans[q.id]===o?"rgba(14,165,233,0.4)":"rgba(255,255,255,0.07)"}`, background:ans[q.id]===o?"rgba(14,165,233,0.1)":"rgba(255,255,255,0.02)", color:ans[q.id]===o?"#0ea5e9":"rgba(200,204,216,0.65)", fontSize:"0.8rem", cursor:"pointer", textAlign:"left", fontFamily:"inherit", transition:"all 0.15s" }}>{o}</button>
          ))}
        </div>
        <div style={{ display:"flex", justifyContent:"flex-end" }}>
          <button style={C.btnPrimary} onClick={next} disabled={!ans[q.id]||saving}>{saving?"Saving…":step<ONBOARDING.length-1?"Next →":"Start studying 🚀"}</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════
   MAIN SHELL
══════════════════════════════════ */

function Shell() {
  const mobile = useMobile()
  const startX = useRef(null)
  const { tool, set, sidebar, profile, chats, chatId, level, addXP, apiKey, saveKey } = useApp();
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyVal, setKeyVal] = useState("");
  const onTouchStart = (e)=>{
  startX.current = e.touches[0].clientX
}

const onTouchEnd = (e)=>{

  if(!mobile) return

  const endX = e.changedTouches[0].clientX

  // swipe right → open sidebar
  if(startX.current < 40 && endX > 120){
    set({ sidebar:true })
  }

  // swipe left → close sidebar
  if(startX.current > 200 && endX < 100){
    set({ sidebar:false })
  }

}
  const GROUPS = [
    { label:"Overview", ids:["dashboard"] },
    { label:"AI Tools", ids:["chat","tldr","essay","exam","path"] },
    { label:"Study",    ids:["notes","flash","quiz","planner"] },
  ];
  const xpPct = level.next ? Math.max(0,Math.min(100,((profile?.total_xp||0)-level.min)/(level.next.min-level.min)*100)) : 100;
  const newChat = async () => {
    if (!profile?.id) return;
    const c = await db.createChat(profile.id);
    if (c) { set({ chats:[c,...chats], chatId:c.id, tool:"chat" }); }
  };

  const PAGES = { dashboard:<Dashboard/>, chat:<Chat/>, notes:<Notes/>, flash:<Flash/>, planner:<Planner/>, tldr:<TLDR/>, quiz:<Quiz/>, essay:<Essay/>, exam:<Exam/>, path:<StudyPath/>, mindmap:<MindMap/> };

  return (
  <div
 onTouchStart={onTouchStart}
 onTouchEnd={onTouchEnd}
 style={{
 display:"flex",
 height:"100dvh",
 overflow:"hidden",
 background:"#080c14",
 position:"relative"
}}>
      {/* Sidebar */}
      {/* Sidebar */}
<div style={{
  width: mobile ? (sidebar ? 220 : 0) : (sidebar ? 218 : 50),
  position: mobile ? "absolute" : "relative",
  zIndex: mobile ? 100 : "auto",
  height:"100%",
  background:"#0d1220",
  borderRight:"1px solid rgba(255,255,255,0.06)",
  display:"flex",
  flexDirection:"column",
  flexShrink:0,
  overflow:"hidden",
  transition:"width 0.2s ease"
}}>
        {/* Logo row */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"13px 10px", borderBottom:"1px solid rgba(255,255,255,0.06)", height:52, flexShrink:0 }}>
          <Logo size={28} r={8} f={14} style={{ flexShrink:0 }} />
          {sidebar && <span style={{ fontSize:"0.875rem", fontWeight:700, color:"#f0f2f8", whiteSpace:"nowrap" }}>Knowledge OS</span>}
        </div>
        {/* User card */}
        {sidebar && profile && (
          <div style={{ padding:"10px 10px", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", gap:8, alignItems:"flex-start" }}>
            <div style={{ width:28, height:28, borderRadius:"50%", background:"linear-gradient(135deg,#0ea5e9,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.72rem", fontWeight:800, color:"#fff", flexShrink:0 }}>{(profile.name||"U")[0]}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:"0.78rem", fontWeight:600, color:"#f0f2f8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{profile.name}</div>
              <div style={{ fontSize:"0.67rem", color:"rgba(126,132,148,0.7)" }}>{level.i} Lvl {level.num} · {level.n}</div>
              <div style={{ background:"rgba(255,255,255,0.06)", borderRadius:99, height:2.5, marginTop:4, overflow:"hidden" }}>
                <div style={{ height:"100%", background:"linear-gradient(90deg,#0ea5e9,#38bdf8)", width:`${xpPct}%`, transition:"width 0.6s" }} />
              </div>
              <div style={{ fontSize:"0.62rem", color:"rgba(126,132,148,0.5)", marginTop:2 }}>⚡{profile.total_xp||0} XP · 🔥{profile.streak||0} days</div>
            </div>
          </div>
        )}
        {/* Nav */}
        <nav style={{ flex:1, overflowY:"auto", padding:"6px 5px" }}>
          {GROUPS.map(g => (
            <div key={g.label} style={{ marginBottom:4 }}>
              {sidebar && <div style={{ fontSize:"0.62rem", fontWeight:800, letterSpacing:"0.1em", textTransform:"uppercase", color:"rgba(126,132,148,0.4)", padding:"7px 7px 3px" }}>{g.label}</div>}
              {g.ids.map(id => {
                const t = TOOLS.find(x=>x.id===id); if(!t) return null;
                const active = tool===id;
                return (
                  <button
  key={id}
  onClick={()=>set({tool:id})}
  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
  onMouseLeave={e=>e.currentTarget.style.background=active?`rgba(${hexToRgb(t.c)},0.1)`:"transparent"} title={!sidebar?t.n:""} style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 8px", borderRadius:9, border:"none", background:active?`rgba(${hexToRgb(t.c)},0.1)`:"transparent",boxShadow:active?`0 0 10px ${t.c}55`:"none", cursor:"pointer", transition:"all 0.15s", color:active?t.c:"rgba(200,204,216,0.45)", fontFamily:"inherit" }}>
                    <span style={{ fontSize:"0.925rem", width:18, textAlign:"center", flexShrink:0 }}>{t.e}</span>
                    {sidebar && <span style={{ fontSize:"0.8rem", fontWeight:active?600:500, whiteSpace:"nowrap" }}>{t.n}</span>}
                    {active && <div style={{ width:3, height:3, borderRadius:"50%", background:t.c, marginLeft:"auto", flexShrink:0 }} />}
                  </button>
                );
              })}
              {/* Chat history */}
              {sidebar && g.label==="AI Tools" && (
                <div style={{ marginTop:4, marginLeft:2 }}>
                  <button onClick={newChat} style={{ width:"100%", padding:"5px 8px", borderRadius:7, border:"1px dashed rgba(14,165,233,0.2)", background:"transparent", color:"rgba(14,165,233,0.45)", cursor:"pointer", fontSize:"0.72rem", fontWeight:600, textAlign:"left", fontFamily:"inherit", transition:"all 0.15s" }}>+ New chat</button>
                  {chats.slice(0,6).map(c => (
                    <button key={c.id} onClick={()=>set({chatId:c.id,tool:"chat"})} style={{ width:"100%", padding:"4px 8px", borderRadius:6, border:"none", background:"transparent", color:chatId===c.id&&tool==="chat"?"#0ea5e9":"rgba(126,132,148,0.4)", cursor:"pointer", fontSize:"0.72rem", textAlign:"left", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"block", fontFamily:"inherit", transition:"all 0.15s" }}>
                      ✦ {(c.title||"Chat").slice(0,22)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)", padding:"8px 5px" }}>
          <button onClick={()=>supabase.auth.signOut()} style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"8px 8px", borderRadius:8, border:"none", background:"transparent", color:"rgba(126,132,148,0.4)", cursor:"pointer", fontSize:"0.78rem", fontFamily:"inherit", transition:"all 0.15s" }}>
            <span>←</span>{sidebar&&<span>Sign out</span>}
          </button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
        {/* Topbar */}
        {/* Topbar */}
<div style={{
  height:52,
  borderBottom:"1px solid rgba(255,255,255,0.06)",
  display:"flex",
  alignItems:"center",
  padding:"0 16px",
  gap:12,
  flexShrink:0,
  background:"#080c14"
}}>
  
  <button 
    onClick={()=>set({sidebar:!sidebar})}
    style={{
      width:32,
      height:32,
      borderRadius:8,
      border:"1px solid rgba(255,255,255,0.07)",
      background:"rgba(255,255,255,0.02)",
      cursor:"pointer",
      color:"rgba(200,204,216,0.5)",
      fontSize:"1rem",
      display:"flex",
      alignItems:"center",
      justifyContent:"center"
    }}
  >
    ☰
  </button>

  <div style={{ flex:1 }}>
    <div style={{ fontSize:"0.9375rem", fontWeight:700, color:"#f0f2f8" }}>
      {TOOLS.find(t=>t.id===tool)?.n}
    </div>
    <div style={{ fontSize:"0.68rem", color:"rgba(126,132,148,0.45)" }}>
      {TOOLS.find(t=>t.id===tool)?.tag}
    </div>
  </div>

  {profile && <span style={C.badge}>⚡ {profile.total_xp||0} XP</span>}
<span style={{
 padding:"4px 10px",
 borderRadius:8,
 fontSize:"0.72rem",
 background:"rgba(16,185,129,0.1)",
 color:"#10b981",
 border:"1px solid rgba(16,185,129,0.2)"
}}>
⚡ AI Online
</span>
</div>
        {/* Page */}
       <div style={{ flex:1, overflow:"hidden" }} className="page">
  {PAGES[tool] || <Dashboard />}
</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════
   PAGES
══════════════════════════════════ */

/* ── Dashboard ── */
function Dashboard() {
  const { profile, set, chats, notes, tasks, level, addXP } = useApp();
  const xpPct = level.next ? Math.max(0,Math.min(100,((profile?.total_xp||0)-level.min)/(level.next.min-level.min)*100)) : 100;
  const first = profile?.name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const hi = hour<12?"Good morning":hour<17?"Good afternoon":"Good evening";
  const quick = [
    { id:"chat",c:"#8b5cf6",e:"✦",l:"Ask AI" },
    { id:"flash",c:"#f59e0b",e:"⚡",l:"Flashcards" },
    { id:"quiz",c:"#f97316",e:"◎",l:"Quiz" },
    { id:"exam",c:"#fb7185",e:"◈",l:"Exam Predict" },
    { id:"path",c:"#818cf8",e:"→",l:"Study Path" },
    { id:"tldr",c:"#38bdf8",e:"≡",l:"TL;DR" },
  ];
  return (
    <div style={{ height:"100%", overflowY:"auto", padding:"24px 28px", maxWidth:860 }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:"1.4rem", fontWeight:800, color:"#f0f2f8", marginBottom:4 }}>{hi}, {first} 👋</h1>
          <p style={{ fontSize:"0.8rem", color:"rgba(126,132,148,0.6)" }}>{level.i} {level.n} · Level {level.num} · {profile?.streak||0} day streak</p>
        </div>
        <div
  className="card-hover"
  style={{
    textAlign:"center",
    ...C.glass,
    border:"1px solid rgba(255,255,255,0.06)",
    borderRadius:14,
    padding:"14px 18px"
  }}
>
          <div style={{ fontSize:"1.5rem", fontWeight:800, background:"linear-gradient(135deg,#0ea5e9,#8b5cf6)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>{profile?.total_xp||0}</div>
          <div style={{ fontSize:"0.65rem", color:"rgba(126,132,148,0.4)", marginTop:2 }}>Total XP</div>
          <div style={{ background:"rgba(255,255,255,0.05)", borderRadius:99, height:2.5, width:80, marginTop:6, overflow:"hidden" }}>
            <div style={{ height:"100%", background:"linear-gradient(90deg,#0ea5e9,#38bdf8)", width:`${xpPct}%` }} />
          </div>
        </div>
      </div>
      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:10, marginBottom:26 }}>
        {[
  { l:"Streak",c:"#f97316",v:`${profile?.streak||0}d`,i:"🔥" },
  { l:"XP",c:"#0ea5e9",v:profile?.total_xp||0,i:"⚡" },
  { l:"Chats",c:"#8b5cf6",v:chats.length,i:"✦" },
  { l:"Level",c:"#10b981",v:level.num,i:level.i },
].map(s=>(
  <div
    key={s.l}
    className="card-hover"
    style={{
      ...C.glass,
      border:`1px solid rgba(255,255,255,0.06)`,
      borderTop:`2px solid ${s.c}40`,
      borderRadius:14,
      padding:"14px 12px",
      textAlign:"center"
    }}
  >
    <div style={{ fontSize:"1rem", marginBottom:4 }}>
      {s.i}
    </div>

    <div style={{ fontSize:"1.25rem", fontWeight:800, color:s.c }}>
      {s.v}
    </div>

    <div style={{ fontSize:"0.68rem", color:"rgba(126,132,148,0.45)", marginTop:1 }}>
      {s.l}
    </div>

  </div>
))}
      </div>
      {/* Study Heatmap */}
<div style={{marginBottom:26}}>
  <div style={C.sectionLabel}>STUDY ACTIVITY</div>

  <div style={{
    display:"grid",
    gridTemplateColumns:"repeat(14,1fr)",
    gap:4,
    marginTop:10
  }}>

    {Array.from({length:42}).map((_,i)=>{

      const lvl = profile?.streak > i ? 0.8 : 0.1

      const c =
        lvl>0.7 ? "#0ea5e9" :
        lvl>0.4 ? "#1d4ed8" :
        lvl>0.2 ? "#1e3a8a" :
        "rgba(255,255,255,0.05)"

      return(
        <div
          key={i}
          style={{
            width:12,
            height:12,
            borderRadius:3,
            background:c
          }}
        />
      )

    })}

  </div>
</div>
{/* Study analytics */}
<div style={{marginBottom:26}}>

<div style={C.sectionLabel}>STUDY ANALYTICS</div>

<div style={{
 display:"grid",
 gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",
 gap:10,
 marginTop:10
}}>

{[
 {l:"Notes",v:notes.length},
 {l:"Chats",v:chats.length},
 {l:"Tasks",v:tasks.length}
].map(s=>(
 <div
  key={s.l}
  style={{
   ...C.glass,
   padding:14,
   borderRadius:12,
   textAlign:"center"
  }}
 >
  <div style={{fontSize:"1.4rem",fontWeight:700}}>
   {s.v}
  </div>

  <div style={{fontSize:"0.7rem",opacity:0.6}}>
   {s.l}
  </div>

 </div>
))}

</div>
</div>
      {/* Quick actions */}
      <div style={{ marginBottom:26 }}>
        <div style={C.sectionLabel}>QUICK ACTIONS</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:9, marginTop:10 }}>
          {quick.map(q=>(
            <button key={q.id} onClick={()=>set({tool:q.id})} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:7, padding:"16px 8px", ...C.glass, border:`1px solid rgba(255,255,255,0.06)`, borderTop:`2px solid ${q.c}30`, borderRadius:13, cursor:"pointer", transition:"all 0.15s" }}>
              <span style={{ fontSize:"1.3rem" }}>{q.e}</span>
              <span style={{ fontSize:"0.76rem", fontWeight:600, color:q.c }}>{q.l}</span>
            </button>
          ))}
        </div>
      </div>
      {/* Profile */}
      {profile?.goal && (
        <div>
          <div style={C.sectionLabel}>YOUR PROFILE</div>
          <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginTop:10 }}>
            {[profile.goal, profile.style, profile.grade].filter(Boolean).map(v=>(
              <span key={v} style={{ padding:"4px 12px", background:"rgba(14,165,233,0.08)", border:"1px solid rgba(14,165,233,0.2)", borderRadius:100, fontSize:"0.75rem", color:"#0ea5e9", fontWeight:600 }}>{v}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Chat ── */
function Chat() {
  const { profile, chats, chatId, set, addXP, toast } = useApp();
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const taRef = useRef(null);

   useEffect(() => {

    if (!chatId || !profile?.id) return;

    supabase
      .from("chat_sessions")
      .select("messages")
      .eq("id", chatId)
      .single()
      .then(({ data }) => {
        if (data?.messages) setMsgs(data.messages);
        else setMsgs([]);
      });

  }, [chatId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs]);

 const send = async () => {
  if (!input.trim() || loading) return;

  let currentChatId = chatId;

  // create chat automatically if none exists
  if (!currentChatId) {
    const c = await db.createChat(profile.id);
    if (!c) return;
    set({ chats:[c,...chats], chatId:c.id });
    currentChatId = c.id;
  }

  const userMsg = { role:"user", content:input.trim() };
  const next = [...msgs, userMsg];

  setMsgs(next);
  setInput("");
  setLoading(true);

  try {
    const reply = await callAI(next, "", profile);

    const final = [...next, { role:"assistant", content:reply }];
    setMsgs(final);

    let title = chats.find(c=>c.id===currentChatId)?.title

if(!title || title === "New Chat"){
  title = userMsg.content.slice(0,40)
}

   await db.saveChat(currentChatId, final, title);

// refresh chat list
const updatedChats = await db.listChats(profile.id);

set({
  chats: updatedChats,
  chatId: currentChatId
});
    addXP(5);

  } catch(e) {
    toast(e.message,"error","✗");
    setMsgs([...next,{role:"assistant",content:`**Error:** ${e.message}`}]);
  }

  setLoading(false);
};

  const TIPS = ["Explain quantum mechanics simply","Help me with derivatives","Summarize the Cold War","Create a 3-day revision plan"];

  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div style={{
  flex:1,
  overflowY:"auto",
  padding:"16px 20px",
  paddingBottom:220,
  display:"flex",
  flexDirection:"column",
  gap:14
}}>
        {msgs.length===0 ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", paddingTop:60, gap:12 }}>
            <div style={{ fontSize:"2.5rem", opacity:0.2 }}>✦</div>
            <h3 style={{ fontSize:"1.1rem", color:"#f0f2f8", fontWeight:700 }}>What do you want to learn?</h3>
            <p style={{ fontSize:"0.825rem", color:"rgba(126,132,148,0.5)", marginBottom:16 }}>Your AI tutor knows your profile and is ready.</p>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, maxWidth:520, width:"100%" }}>
              {TIPS.map(t=>(
                <button key={t} onClick={()=>setInput(t)} style={{ padding:"10px 12px", ...C.glass, border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, color:"rgba(200,204,216,0.55)", fontSize:"0.8rem", cursor:"pointer", textAlign:"left", lineHeight:1.45, fontFamily:"inherit", transition:"all 0.15s" }}>{t}</button>
              ))}
            </div>
          </div>
        ) : msgs.map((m,i)=>(
          <div key={i} style={{ display:"flex",
flexWrap:"wrap",
gap:9, flexDirection:m.role==="user"?"row-reverse":"row", maxWidth:"min(760px,100%)" }}>
            <div style={{ width:26, height:26, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.72rem", fontWeight:700, background:m.role==="user"?"linear-gradient(135deg,#0ea5e9,#8b5cf6)":"rgba(14,165,233,0.1)", color:m.role==="user"?"#fff":"#0ea5e9" }}>
              {m.role==="user"?(profile?.name||"U")[0]:"✦"}
            </div>
            <div style={{ maxWidth:"85%", padding:"9px 13px", borderRadius:m.role==="user"?"12px 3px 12px 12px":"3px 12px 12px 12px", background:m.role==="user"?"rgba(14,165,233,0.1)":"#111828", border:`1px solid ${m.role==="user"?"rgba(14,165,233,0.25)":"rgba(255,255,255,0.06)"}`, fontSize:"0.875rem", lineHeight:1.75, color:"#e8eaf0", whiteSpace:"pre-wrap" }}>{m.content}</div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex",
flexWrap:"wrap",
gap:9 }}>
            <div style={{ width:26, height:26, borderRadius:"50%", background:"rgba(14,165,233,0.1)", display:"flex", alignItems:"center", justifyContent:"center", color:"#0ea5e9", fontSize:"0.875rem" }}>✦</div>
            <div style={{ padding:"9px 14px", ...C.glass, border:"1px solid rgba(255,255,255,0.06)", borderRadius:"3px 12px 12px 12px", display:"flex", gap:4, alignItems:"center" }}>
              {[0,1,2].map(i=><span key={i} style={{ width:5, height:5, borderRadius:"50%", background:"#0ea5e9", display:"inline-block", animation:`kpulse 1.2s ${i*0.18}s ease infinite` }}/>)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{
  position:"fixed",
  bottom:110,
  left:"50%",
  transform:"translateX(-50%)",
  width:"92%",
  maxWidth:700,
  background:"rgba(17,24,40,0.9)",
  backdropFilter:"blur(14px)",
  border:"1px solid rgba(255,255,255,0.08)",
  borderRadius:30,
  padding:"10px 14px",
  boxShadow:"0 10px 30px rgba(0,0,0,0.4)",
  zIndex:999
}}>
        <div style={{
  display:"flex",
  gap:9,
  alignItems:"flex-end",
  width:"100%",
  ...C.glass,
  border:"1px solid rgba(255,255,255,0.08)",
  borderRadius:14,
  padding:"9px 11px",
  transition:"all 0.15s"
}}>
          <textarea
  ref={taRef}
  value={input}
  onChange={(e)=>{
    setInput(e.target.value)

    // auto expand textarea
    e.target.style.height = "auto"
    e.target.style.height = e.target.scrollHeight + "px"
  }}
  onKeyDown={(e)=>{
    if(e.key==="Enter" && !e.shiftKey){
      e.preventDefault()
      send()
    }
  }}
  placeholder="Ask anything… (Enter to send)"
  rows={1}
  style={{
    flex:1,
    background:"none",
    border:"none",
    outline:"none",
    resize:"none",
    color:"#e8eaf0",
    fontSize:"0.875rem",
    fontFamily:"inherit",
    lineHeight:1.6,
    maxHeight:120,
    overflow:"auto"
  }}
/>
          <button onClick={send} disabled={!input.trim()||loading} style={{ width:32, height:32, borderRadius:8, border:"none", background:input.trim()&&!loading?"#0ea5e9":"rgba(255,255,255,0.05)", color:"#fff", fontSize:"1.1rem", cursor:input.trim()&&!loading?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.15s" }}>↑</button>
        </div>
        <div style={{ textAlign:"center", fontSize:"0.67rem", color:"rgba(126,132,148,0.3)", marginTop:5 }}>+5 XP per message · AI remembers your profile</div>
      </div>
    </div>
  );
}

/* ── Notes ── */
function Notes() {
  const { profile, notes, set, addXP, toast } = useApp();
  const [activeId, setActiveId] = useState(null);
  const [title, setTitle] = useState(""); const [content, setContent] = useState("");
  const [aiOut, setAiOut] = useState(""); const [aiLoading, setAiLoading] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(()=>{ if(profile?.id) db.listNotes(profile.id).then(n=>set({notes:n})); },[profile?.id]);
  const filtered = notes.filter(n=>(n.title||"").toLowerCase().includes(search.toLowerCase())||(n.content||"").toLowerCase().includes(search.toLowerCase()));
  const open = n=>{ setActiveId(n.id); setTitle(n.title||""); setContent(n.content||""); setAiOut(""); };
  const newNote = async()=>{ const n=await db.saveNote({user_id:profile.id,title:"Untitled",content:""}); if(n){set({notes:[n,...notes]});open(n);} };
  const save = async()=>{ if(!activeId) return; const n=await db.saveNote({id:activeId,user_id:profile.id,title:title||"Untitled",content}); if(n){set({notes:notes.map(x=>x.id===activeId?{...x,title:n.title,content:n.content}:x)});addXP(3);toast("Saved ✓","success");} };
  const del = async id=>{ await db.deleteNote(id); set({notes:notes.filter(n=>n.id!==id)}); if(activeId===id){setActiveId(null);setTitle("");setContent("");} };
  const enhance = async()=>{ if(!content.trim()) return; setAiLoading(true); try{ const r=await callAI([{role:"user",content:`Improve and structure these notes with clear headings, bullet points, bolded key terms:\n\n${content}`}],"",profile); setAiOut(r); addXP(10); }catch(e){toast(e.message,"error","✗");} setAiLoading(false); };
  return (
    <div style={{
 display: window.innerWidth < 768 ? "block" : "flex",
 height:"100%",
 overflow:"hidden"
}}>
      <div style={{ width:210, borderRight:"1px solid rgba(255,255,255,0.06)", display:"flex", flexDirection:"column" }}>
        <div style={{ padding:9, borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", gap:7 }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{...C.input,height:30,flex:1,fontSize:"0.78rem"}} />
          <button style={C.btnPrimarySmall} onClick={newNote}>+</button>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:5 }}>
          {filtered.map(n=>(
            <div key={n.id} onClick={()=>open(n)} style={{ padding:"8px 9px", borderRadius:8, cursor:"pointer", background:activeId===n.id?"rgba(14,165,233,0.08)":"transparent", border:`1px solid ${activeId===n.id?"rgba(14,165,233,0.25)":"transparent"}`, marginBottom:2, transition:"all 0.15s" }}>
              <div style={{ fontSize:"0.8rem", fontWeight:500, color:"#e8eaf0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{n.title||"Untitled"}</div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:3 }}>
                <span style={{ fontSize:"0.67rem", color:"rgba(126,132,148,0.4)" }}>{new Date(n.updated_at).toLocaleDateString()}</span>
                <button onClick={e=>{e.stopPropagation();del(n.id);}} style={{ background:"none", border:"none", color:"rgba(244,63,94,0.5)", cursor:"pointer", fontSize:"0.72rem", padding:0 }}>✕</button>
              </div>
            </div>
          ))}
          {filtered.length===0 && <div style={{ textAlign:"center", padding:"40px 10px", color:"rgba(126,132,148,0.3)", fontSize:"0.8rem" }}>No notes</div>}
        </div>
      </div>
      {activeId ? (
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <input value={title} onChange={e=>setTitle(e.target.value)} style={{ background:"none", border:"none", outline:"none", fontSize:"1.1rem", fontWeight:700, color:"#f0f2f8", padding:"16px 20px 8px", width:"100%", fontFamily:"inherit" }} placeholder="Note title…" />
          <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Write your notes here…" style={{ flex:1, background:"none", border:"none", outline:"none", resize:"none", padding:"8px 20px", fontSize:"0.875rem", lineHeight:1.8, color:"rgba(200,204,216,0.8)", fontFamily:"inherit", width:"100%" }} />
          <div style={{ padding:"10px 16px", borderTop:"1px solid rgba(255,255,255,0.06)", display:"flex", gap:8 }}>
            <button
 style={C.btnGhostSmall}
 onClick={async()=>{

 const q=await callAIJSON(`
Generate 5 MCQ quiz questions from these notes:

${content}

Return JSON:
{"questions":[{"q":"question","options":["A","B","C","D"],"answer":"A"}]}
`)

 console.log(q)
 toast("Quiz generated from notes!","success")

 }}
>
Generate Quiz
</button>
            <button style={C.btnPrimarySmall} onClick={save}>Save</button>
            <button style={C.btnGhostSmall} onClick={enhance} disabled={aiLoading}>{aiLoading?"Enhancing…":"✦ AI Enhance"}</button>
          </div>
          {aiOut && (
            <div style={{ margin:"0 16px 14px", padding:14, ...C.glass, border:"1px solid rgba(14,165,233,0.2)", borderRadius:12, maxHeight:200, overflow:"hidden", display:"flex", flexDirection:"column" }}>
              <div style={{ fontSize:"0.67rem", fontWeight:800, color:"#0ea5e9", letterSpacing:"0.08em", marginBottom:8 }}>✦ AI ENHANCED</div>
              <div style={{ fontSize:"0.825rem", lineHeight:1.75, flex:1, overflow:"auto", whiteSpace:"pre-wrap", color:"rgba(200,204,216,0.8)" }}>{aiOut}</div>
              <button style={{...C.btnPrimarySmall, marginTop:10}} onClick={()=>{setContent(aiOut);setAiOut("");}}>Use This ✓</button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(126,132,148,0.25)", flexDirection:"column", gap:8 }}>
          <span style={{ fontSize:"2rem" }}>✎</span><span style={{ fontSize:"0.875rem" }}>Select or create a note</span>
        </div>
      )}
    </div>
  );
}

/* ── Flash Mode ── */
function Flash() {
  const { profile, decks, set, addXP, toast } = useApp();
  const [mode, setMode] = useState("list");
  const [active, setActive] = useState(null);
  const [topic, setTopic] = useState(""); const [genLoading, setGenLoading] = useState(false);
  const [idx, setIdx] = useState(0); const [flipped, setFlipped] = useState(false);
  const [score, setScore] = useState({k:0,u:0});
  useEffect(()=>{ if(profile?.id) db.listDecks(profile.id).then(d=>set({decks:d})); },[profile?.id]);
const gen = async()=>{ 
 if(!topic.trim()) return; 

 setGenLoading(true); 

 try{

  const data = await callAIJSON(`
Generate 10 flashcards for: "${topic}".
Return JSON: {"cards":[{"q":"question","a":"answer"}]}
`)

  // 🔥 add spaced repetition fields
  const cards = data.cards.map(c => ({
   ...c,
   interval:1,
   review:Date.now()
  }))

  const d = await db.saveDeck({
   user_id:profile.id,
   title:topic,
   subject:topic,
   cards
  })

  if(d){
   set({decks:[d,...decks]})
  }

  setTopic("")
  setMode("list")

  addXP(20)

  toast("10 cards generated! ⚡","success","⚡")

 }catch(e){
  toast(e.message,"error","✗")
 }

 setGenLoading(false)
}
  if(mode==="study"&&active) {
    const done = idx>=active.cards.length;
    const card = active.cards[idx];
    return (
      <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        {done ? (
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:"3rem", marginBottom:12 }}>🏆</div>
            <h2 style={{ color:"#f0f2f8", marginBottom:10 }}>Deck complete!</h2>
            <div style={{ display:"flex", gap:24, justifyContent:"center", marginBottom:24 }}>
              <span style={{ color:"#10b981", fontWeight:700 }}>✓ {score.k} got it</span>
              <span style={{ color:"#f43f5e", fontWeight:700 }}>✗ {score.u} reviewing</span>
            </div>
            <button style={C.btnPrimary} onClick={()=>setMode("list")}>Back to Decks</button>
          </div>
        ):(
          <div style={{ width:"100%", maxWidth:520 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14, fontSize:"0.8rem", color:"rgba(126,132,148,0.6)" }}>
              <span style={{color:"#10b981"}}>✓ {score.k}</span><span>{idx+1}/{active.cards.length}</span><span style={{color:"#f43f5e"}}>✗ {score.u}</span>
            </div>
            <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:99, height:3, marginBottom:20 }}>
              <div style={{ height:"100%", background:"#0ea5e9", borderRadius:99, width:`${(idx/active.cards.length)*100}%` }} />
            </div>
            <div onClick={()=>setFlipped(p=>!p)} style={{ height:220, cursor:"pointer", position:"relative", perspective:1000 }}>
              <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:28, ...C.glass, border:"1px solid rgba(255,255,255,0.08)", borderRadius:18, backfaceVisibility:"hidden", opacity:flipped?0:1, transition:"opacity 0.2s" }}>
                <span style={{...C.badge, marginBottom:14}}>QUESTION</span>
                <div style={{ fontSize:"1.05rem", fontWeight:600, textAlign:"center", color:"#f0f2f8", lineHeight:1.55 }}>{card.q}</div>
                <div style={{ fontSize:"0.72rem", color:"rgba(126,132,148,0.4)", marginTop:20 }}>Tap to reveal ↓</div>
              </div>
              <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:28, background:"#18202e", border:"1px solid rgba(14,165,233,0.2)", borderRadius:18, backfaceVisibility:"hidden", opacity:flipped?1:0, transition:"opacity 0.2s" }}>
                <span style={{ fontSize:"0.7rem", background:"rgba(16,185,129,0.1)", color:"#10b981", border:"1px solid rgba(16,185,129,0.2)", borderRadius:100, padding:"2px 10px", fontWeight:700, marginBottom:14 }}>ANSWER</span>
                <div style={{ fontSize:"1.05rem", fontWeight:600, textAlign:"center", color:"#f0f2f8", lineHeight:1.55 }}>{card.a}</div>
              </div>
            </div>
            {flipped && (
  <div style={{ display:"flex", gap:12, marginTop:18 }}>

    <button
      style={{ flex:1,padding:"11px",borderRadius:10,border:"1px solid rgba(244,63,94,0.25)",background:"rgba(244,63,94,0.08)",color:"#f43f5e",fontWeight:600,cursor:"pointer" }}
      onClick={()=>{

        const updated=[...active.cards]
        const card=updated[idx]

        card.interval=1
        card.review=Date.now()+86400000

        setActive({...active,cards:updated})

        setScore(p=>({...p,u:p.u+1}))
        setIdx(p=>p+1)
        setFlipped(false)

      }}
    >
      Still learning
    </button>

    <button
      style={{ flex:1,padding:"11px",borderRadius:10,border:"none",background:"#10b981",color:"#fff",fontWeight:700,cursor:"pointer" }}
      onClick={()=>{

        const updated=[...active.cards]
        const card=updated[idx]

        card.interval=(card.interval||1)*2
        card.review=Date.now()+card.interval*86400000

        setActive({...active,cards:updated})

        setScore(p=>({...p,k:p.k+1}))
        addXP(5)
        setIdx(p=>p+1)
        setFlipped(false)

      }}
    >
      Got it ✓
    </button>

  </div>
)}
          </div>
        )}
      </div>
    );
  }
  return (
    <Page title="⚡ Flash Mode" sub={`${decks.length} decks`} action={<button style={C.btnGhostSmall} onClick={()=>setMode(mode==="gen"?"list":"gen")}>✦ AI Generate</button>}>
      {mode==="gen" && (
        <div style={{ display:"flex",
flexWrap:"wrap",
gap:9, marginBottom:18, padding:"14px 16px", ...C.glass, border:"1px solid rgba(255,255,255,0.07)", borderRadius:13 }}>
          <input value={topic} onChange={e=>setTopic(e.target.value)} onKeyDown={e=>e.key==="Enter"&&gen()} placeholder="Topic to generate flashcards for…" style={{...C.input,flex:1}} />
          <button style={C.btnPrimary} onClick={gen} disabled={genLoading||!topic}>{genLoading?"Generating…":"Generate 10 Cards"}</button>
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:12 }}>
        {decks.map(d=>(
          <div key={d.id} style={{ ...C.glass, border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:16 }}>
            <div style={{ fontSize:"0.875rem", fontWeight:700, color:"#f0f2f8", marginBottom:4 }}>{d.title}</div>
            <div style={{ fontSize:"0.75rem", color:"rgba(126,132,148,0.5)", marginBottom:14 }}>{d.cards?.length||0} cards</div>
            <div style={{ display:"flex", gap:8 }}>
              <button style={C.btnPrimarySmall} onClick={()=>study(d)}>Study ⚡</button>
              <button onClick={()=>del(d.id)} style={{ background:"none", border:"1px solid rgba(244,63,94,0.2)", color:"rgba(244,63,94,0.6)", borderRadius:7, padding:"5px 9px", cursor:"pointer", fontSize:"0.75rem" }}>✕</button>
            </div>
          </div>
        ))}
        {decks.length===0 && <EmptyState icon="⚡" text="Generate your first deck with AI" />}
      </div>
    </Page>
  );
}

/* ── Planner ── */
function Planner() {
  const { profile, tasks, set, addXP, toast } = useApp();
  const [newT, setNewT] = useState(""); const [pri, setPri] = useState("medium");
  useEffect(()=>{ if(profile?.id) db.listTasks(profile.id).then(t=>set({tasks:t})); },[profile?.id]);
  const add = async()=>{ if(!newT.trim()) return; const t=await db.saveTask({user_id:profile.id,title:newT,priority:pri,done:false}); if(t){set({tasks:[t,...tasks]});setNewT("");addXP(2);} };
  const toggle=async(id,done)=>{ await db.toggleTask(id,!done); set({tasks:tasks.map(t=>t.id===id?{...t,done:!done}:t)}); if(!done){addXP(8);toast("Task done! 🎉","success","✓");} };
  const del=async id=>{ await db.deleteTask(id); set({tasks:tasks.filter(t=>t.id!==id)}); };
  const pending=tasks.filter(t=>!t.done); const done=tasks.filter(t=>t.done);
  const PC={high:"#f43f5e",medium:"#f59e0b",low:"#10b981"};
  return (
    <Page title="☑ Planner" sub={`${pending.length} pending`}>
      <div style={{ display:"flex",
flexWrap:"wrap",
gap:9, marginBottom:18, padding:"13px 15px", ...C.glass, border:"1px solid rgba(255,255,255,0.07)", borderRadius:13 }}>
        <input value={newT} onChange={e=>setNewT(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Add a task…" style={{...C.input,flex:1}} />
        <div style={{ display:"flex", gap:6 }}>
          {["high","medium","low"].map(p=>(
            <button key={p} onClick={()=>setPri(p)} style={{ padding:"5px 10px", borderRadius:7, border:`1px solid ${pri===p?PC[p]+"60":"rgba(255,255,255,0.07)"}`, background:pri===p?`${PC[p]}15`:"transparent", color:pri===p?PC[p]:"rgba(126,132,148,0.5)", fontSize:"0.72rem", fontWeight:700, cursor:"pointer", textTransform:"capitalize", fontFamily:"inherit" }}>{p}</button>
          ))}
        </div>
        <button style={C.btnPrimary} onClick={add}>Add</button>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {pending.map(t=>(
          <div key={t.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 14px", ...C.glass, border:"1px solid rgba(255,255,255,0.06)", borderRadius:11 }}>
            <button onClick={()=>toggle(t.id,t.done)} style={{ width:18, height:18, borderRadius:4, border:`2px solid ${PC[t.priority]}`, background:"none", cursor:"pointer", flexShrink:0 }} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:"0.875rem", color:"#e8eaf0", fontWeight:500 }}>{t.title}</div>
              <span style={{ fontSize:"0.67rem", color:PC[t.priority], fontWeight:700 }}>{t.priority}</span>
            </div>
            <button onClick={()=>del(t.id)} style={{ background:"none", border:"none", color:"rgba(244,63,94,0.4)", cursor:"pointer", fontSize:"0.78rem" }}>✕</button>
          </div>
        ))}
        {done.slice(0,5).map(t=>(
          <div key={t.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 14px", background:"rgba(255,255,255,0.01)", border:"1px solid rgba(255,255,255,0.04)", borderRadius:11, opacity:0.45 }}>
            <div style={{ width:18, height:18, borderRadius:4, background:"#10b981", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.65rem", color:"#fff", flexShrink:0 }}>✓</div>
            <div style={{ flex:1, fontSize:"0.875rem", color:"rgba(200,204,216,0.4)", textDecoration:"line-through" }}>{t.title}</div>
            <button onClick={()=>del(t.id)} style={{ background:"none", border:"none", color:"rgba(244,63,94,0.3)", cursor:"pointer", fontSize:"0.78rem" }}>✕</button>
          </div>
        ))}
        {tasks.length===0 && <EmptyState icon="☑" text="No tasks yet" />}
      </div>
    </Page>
  );
}

/* ── TL;DR ── */
function TLDR() {
  const { profile, addXP, toast } = useApp();
  const [text, setText] = useState(""); const [mode, setMode] = useState("bullets"); const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);
  const run = async()=>{ if(!text.trim()) return; setLoading(true); const P={bullets:"Summarize in clear bullet points:",paragraph:"Write a concise 3-sentence summary:",eli12:"Explain simply like I'm 12:",outline:"Create a structured outline:",exam:"Extract the most important exam facts:"}; try{ const r=await callAI([{role:"user",content:`${P[mode]}\n\n${text}`}],"",profile); setOut(r); addXP(8); }catch(e){toast(e.message,"error","✗");} setLoading(false); };
  return (
    <Page title="≡ TL;DR Machine" sub="Paste anything, get the gist">
      <div style={{ display:"flex", gap:7, marginBottom:14, flexWrap:"wrap" }}>
        {[["bullets","Bullets"],["paragraph","Summary"],["eli12","ELI12"],["outline","Outline"],["exam","Exam Prep"]].map(([v,l])=>(
          <button key={v} onClick={()=>setMode(v)} style={{ padding:"5px 13px", borderRadius:100, border:`1px solid ${mode===v?"rgba(14,165,233,0.35)":"rgba(255,255,255,0.07)"}`, background:mode===v?"rgba(14,165,233,0.1)":"transparent", color:mode===v?"#0ea5e9":"rgba(200,204,216,0.45)", fontSize:"0.78rem", fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>{l}</button>
        ))}
      </div>
      <div style={{
  display:"grid",
  gridTemplateColumns: window.innerWidth < 768 ? "1fr" : "1fr 1fr",
  gap:18,
  flex:1,
  overflow:"hidden",
  minHeight:300
}}>
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:10 }}>
          <textarea
  value={text}
  onChange={(e)=>setText(e.target.value)}
  placeholder="Paste textbook content, lecture notes, articles…"
  style={{
    ...C.textarea,
    flex:1,
    minHeight: window.innerWidth < 768 ? 160 : 240
  }}
/>
          <button style={C.btnPrimary} onClick={run} disabled={loading||!text.trim()}>{loading?"Processing…":"✦ Summarize"}</button>
        </div>
        <div style={{ flex:1, padding:16, ...C.glass, border:"1px solid rgba(255,255,255,0.07)", borderRadius:13, overflowY:"auto" }}>
          {out ? <div style={{ fontSize:"0.875rem", lineHeight:1.8, color:"#e8eaf0", whiteSpace:"pre-wrap" }}>{out}</div>
               : <div style={{ color:"rgba(126,132,148,0.3)", fontSize:"0.875rem" }}>Your summary appears here ✨</div>}
        </div>
      </div>
    </Page>
  );
}

/* ── Quiz ── */
function Quiz() {
  const { profile, addXP, toast } = useApp();
  const [topic, setTopic] = useState(""); const [diff, setDiff] = useState("medium");
  const [quiz, setQuiz] = useState(null); const [ans, setAns] = useState({}); const [submitted, setSubmitted] = useState(false); const [score, setScore] = useState(0); const [loading, setLoading] = useState(false);
  const gen=async()=>{ if(!topic.trim()) return; setLoading(true); setQuiz(null); setAns({}); setSubmitted(false); try{ const d=await callAIJSON(`Generate 5 ${diff} multiple choice questions about "${topic}". Return: {"questions":[{"q":"question","options":["A) opt","B) opt","C) opt","D) opt"],"answer":"A","explanation":"why"}]}`,profile); setQuiz(d); }catch(e){toast(e.message,"error","✗");} setLoading(false); };
  const submit=()=>{ let c=0; quiz.questions.forEach((q,i)=>{ if(ans[i]===q.answer?.[0]) c++; }); setScore(c); setSubmitted(true); addXP(15+c*10); if(c===5) toast("Perfect! 🏆","success","🏆"); };
  return (
    <Page title="◎ Quiz Grind" sub="AI-generated quizzes on any topic">
      <div style={{ display:"flex",
flexWrap:"wrap",
gap:9, marginBottom:18, padding:"13px 15px", ...C.glass, border:"1px solid rgba(255,255,255,0.07)", borderRadius:13, flexWrap:"wrap" }}>
        <input value={topic} onChange={e=>setTopic(e.target.value)} onKeyDown={e=>e.key==="Enter"&&gen()} placeholder="Topic…" style={{...C.input,flex:1,minWidth:160}} />
        <div style={{ display:"flex", gap:6 }}>
          {["easy","medium","hard"].map(d=>(
            <button key={d} onClick={()=>setDiff(d)} style={{ padding:"5px 11px", borderRadius:7, border:`1px solid ${diff===d?"rgba(14,165,233,0.3)":"rgba(255,255,255,0.07)"}`, background:diff===d?"rgba(14,165,233,0.1)":"transparent", color:diff===d?"#0ea5e9":"rgba(126,132,148,0.5)", fontSize:"0.75rem", fontWeight:700, cursor:"pointer", textTransform:"capitalize", fontFamily:"inherit" }}>{d}</button>
          ))}
        </div>
        <button style={C.btnPrimary} onClick={gen} disabled={loading||!topic}>{loading?"Generating…":"Generate Quiz"}</button>
      </div>
      {submitted && quiz && (
        <div style={{ background:score>=3?"rgba(16,185,129,0.06)":"rgba(244,63,94,0.05)", border:`1px solid ${score>=3?"rgba(16,185,129,0.2)":"rgba(244,63,94,0.15)"}`, borderRadius:14, padding:"18px 22px", textAlign:"center", marginBottom:18 }}>
          <div style={{ fontSize:"2.5rem", fontWeight:800, color:score>=3?"#10b981":"#f43f5e" }}>{score}/{quiz.questions.length}</div>
          <div style={{ fontWeight:600, marginTop:4, color:"#e8eaf0" }}>{score===5?"Perfect! 🏆":score>=4?"Excellent 🔥":score>=3?"Good job 👍":"Keep grinding 💪"}</div>
        </div>
      )}
      {quiz?.questions?.map((q,i)=>(
        <div key={i} style={{ ...C.glass, border:"1px solid rgba(255,255,255,0.07)", borderRadius:13, padding:16, marginBottom:12 }}>
          <div style={{ fontSize:"0.9rem", fontWeight:600, color:"#f0f2f8", marginBottom:12, lineHeight:1.5 }}>{i+1}. {q.q}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {q.options?.map(opt=>{ const L=opt[0],sel=ans[i]===L,correct=submitted&&L===q.answer?.[0],wrong=submitted&&sel&&L!==q.answer?.[0]; return (
              <button key={opt} onClick={()=>!submitted&&setAns(p=>({...p,[i]:L}))} style={{ padding:"9px 12px", borderRadius:9, border:`1px solid ${correct?"rgba(16,185,129,0.4)":wrong?"rgba(244,63,94,0.4)":sel?"rgba(14,165,233,0.35)":"rgba(255,255,255,0.07)"}`, background:correct?"rgba(16,185,129,0.08)":wrong?"rgba(244,63,94,0.08)":sel?"rgba(14,165,233,0.08)":"rgba(255,255,255,0.02)", color:correct?"#10b981":wrong?"#f43f5e":sel?"#0ea5e9":"rgba(200,204,216,0.7)", textAlign:"left", fontSize:"0.8rem", fontWeight:500, cursor:submitted?"default":"pointer", fontFamily:"inherit" }}>{opt}</button>
            );})}
          </div>
          {submitted&&q.explanation&&<div style={{ marginTop:10, padding:"8px 11px", background:"rgba(255,255,255,0.02)", borderRadius:8, fontSize:"0.78rem", color:"rgba(200,204,216,0.55)", lineHeight:1.55 }}>💡 {q.explanation}</div>}
        </div>
      ))}
      {quiz&&!submitted&&<button style={C.btnPrimary} onClick={submit}>Submit Answers</button>}
      {submitted&&<button style={{...C.btnPrimary,background:"rgba(255,255,255,0.06)",color:"rgba(200,204,216,0.7)",border:"1px solid rgba(255,255,255,0.1)"}} onClick={()=>{setQuiz(null);setTopic("");}}>Try Another</button>}
    </Page>
  );
}

/* ── Essay ── */
function Essay() {
  const { profile, addXP, toast } = useApp();
  const [topic, setTopic] = useState(""); const [type, setType] = useState("argumentative"); const [essay, setEssay] = useState(""); const [fb, setFb] = useState(""); const [loading, setLoading] = useState(false); const [fbLoading, setFbLoading] = useState(false);
  const wc = essay.trim().split(/\s+/).filter(Boolean).length;
  const gen=async()=>{ if(!topic.trim()) return; setLoading(true); try{ const r=await callAI([{role:"user",content:`Write a well-structured ${type} essay on: "${topic}". Include strong intro with thesis, 3 body paragraphs with evidence, and compelling conclusion.`}],"",profile); setEssay(r); addXP(15); }catch(e){toast(e.message,"error","✗");} setLoading(false); };
  const getFb=async()=>{ if(!essay.trim()) return; setFbLoading(true); try{ const r=await callAI([{role:"user",content:`Grade this essay (A-F) and give specific feedback on: thesis, evidence, structure, language:\n\n${essay}`}],"",profile); setFb(r); addXP(5); }catch(e){toast(e.message,"error","✗");} setFbLoading(false); };
  return (
    <Page title="✒ Essay Era" sub="AI-assisted essay writing">
      <div style={{ display:"flex",
flexWrap:"wrap",
gap:9, marginBottom:14, flexWrap:"wrap" }}>
        <input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Essay topic…" style={{...C.input,flex:2,minWidth:180}} />
      <select
  value={type}
  onChange={e=>setType(e.target.value)}
  style={{
    ...C.input,
    flex:"0 0 160px",
    cursor:"pointer",
    ...C.glass,    color:"#e8eaf0",
    border:"1px solid rgba(255,255,255,0.08)"
  }}
>
  {["argumentative","analytical","expository","compare and contrast","persuasive"].map(t =>
    <option key={t} style={{...C.glass, color:"#e8eaf0"}}>
      {t}
    </option>
  )}
</select>
        <button style={C.btnPrimary} onClick={gen} disabled={loading||!topic}>{loading?"Writing…":"✦ Generate"}</button>
      </div>
      <textarea value={essay} onChange={e=>setEssay(e.target.value)} placeholder="Your essay appears here or start writing…" style={{...C.textarea, minHeight:260, flex:1}} />
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10, flexWrap:"wrap", gap:8 }}>
        <span style={{ fontSize:"0.72rem", color:"rgba(126,132,148,0.4)" }}>{wc} words</span>
        <div style={{ display:"flex", gap:8 }}>
          {essay && <button style={C.btnGhostSmall} onClick={()=>navigator.clipboard.writeText(essay)}>Copy 📋</button>}
          <button style={C.btnGhostSmall} onClick={getFb} disabled={fbLoading||!essay}>{fbLoading?"Analyzing…":"✦ AI Feedback"}</button>
        </div>
      </div>
      {fb && <div style={{ marginTop:14, padding:14, ...C.glass, border:"1px solid rgba(139,92,246,0.2)", borderRadius:12, fontSize:"0.875rem", lineHeight:1.75, color:"rgba(200,204,216,0.8)", whiteSpace:"pre-wrap", maxHeight:200, overflowY:"auto" }}><div style={{ fontSize:"0.67rem", color:"#8b5cf6", fontWeight:800, marginBottom:8 }}>AI FEEDBACK</div>{fb}</div>}
    </Page>
  );
}

/* ── Exam Oracle ── */
function Exam() {
  const { profile, addXP, toast } = useApp();
  const [subject, setSubject] = useState(""); const [topics, setTopics] = useState(""); const [pred, setPred] = useState(null); const [loading, setLoading] = useState(false);
  const predict=async()=>{ if(!subject.trim()) return; setLoading(true); try{ const d=await callAIJSON(`Predict an exam for "${subject}"${topics?` covering: ${topics}`:""}.Return: {"high_prob":[{"topic":"name","pct":"85%","reason":"why","key_points":["p1","p2"]}],"question_types":["type1","type2"],"study_tips":["tip1","tip2"]}`,profile); setPred(d); addXP(12); }catch(e){toast(e.message,"error","✗");} setLoading(false); };
  return (
    <Page title="◈ Exam Oracle" sub="Predict what'll be on your exam">
      <div style={{ ...C.glass, border:"1px solid rgba(255,255,255,0.07)", borderRadius:13, padding:16, marginBottom:20 }}>
        <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Subject (e.g. Physics, History…)" style={{...C.input,marginBottom:9}} />
        <textarea value={topics} onChange={e=>setTopics(e.target.value)} placeholder="Topics covered (optional)" style={{...C.textarea,marginBottom:10}} rows={2} />
        <button style={C.btnPrimary} onClick={predict} disabled={loading||!subject}>{loading?"Predicting…":"◈ Predict My Exam"}</button>
      </div>
      {pred && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={C.sectionLabel}>HIGH PROBABILITY TOPICS</div>
          {pred.high_prob?.map((t,i)=>(
            <div key={i} style={{ ...C.glass, border:"1px solid rgba(255,255,255,0.07)", borderRadius:13, padding:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <span style={{ fontWeight:700, color:"#f0f2f8" }}>{t.topic}</span>
                <span style={{ fontSize:"0.72rem", background:parseInt(t.pct)>70?"rgba(244,63,94,0.1)":"rgba(245,158,11,0.1)", color:parseInt(t.pct)>70?"#f43f5e":"#f59e0b", border:"none", borderRadius:100, padding:"2px 10px", fontWeight:700 }}>{t.pct}</span>
              </div>
              <div style={{ fontSize:"0.78rem", color:"rgba(200,204,216,0.5)", marginBottom:8 }}>{t.reason}</div>
              {t.key_points?.map((p,j)=><div key={j} style={{ fontSize:"0.78rem", color:"rgba(200,204,216,0.45)", padding:"3px 0" }}>· {p}</div>)}
            </div>
          ))}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            {[["QUESTION TYPES",pred.question_types],["STUDY TIPS",pred.study_tips]].map(([h,items])=>(
              <div key={h} style={{ ...C.glass, border:"1px solid rgba(255,255,255,0.07)", borderRadius:13, padding:14 }}>
                <div style={C.sectionLabel}>{h}</div>
                {items?.map((x,i)=><div key={i} style={{ fontSize:"0.8rem", color:"rgba(200,204,216,0.6)", padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>{x}</div>)}
              </div>
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}

/* ── Study Path ── */
function StudyPath() {
  const { profile, addXP, toast } = useApp();
  const [goal, setGoal] = useState(""); const [path, setPath] = useState(null); const [loading, setLoading] = useState(false);
  const gen=async()=>{ if(!goal.trim()) return; setLoading(true); try{ const d=await callAIJSON(`Create a detailed adaptive study plan
based on the user's learning style and daily time.
Include:
topics
revision days
practice tests for: "${goal}". Profile: ${profile?.grade||""}, ${profile?.style||""}, ${profile?.daily_time||""}. Return: {"title":"name","overview":"intro","weeks":[{"week":1,"theme":"focus","days":[{"day":"Mon","task":"study task","mins":45}]}],"milestones":["m1","m2","m3"]}`,profile); setPath(d); addXP(15); }catch(e){toast(e.message,"error","✗");} setLoading(false); };
  return (
    <Page title="→ Study Path" sub="Your personalized AI learning roadmap">
      <div style={{ display:"flex",
flexWrap:"wrap",
gap:9, marginBottom:20 }}>
        <input value={goal} onChange={e=>setGoal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&gen()} placeholder="What do you want to master? (e.g. Calculus, IELTS, Python…)" style={{...C.input,flex:1}} />
        <button style={C.btnPrimary} onClick={gen} disabled={loading||!goal}>{loading?"Building…":"→ Generate Path"}</button>
      </div>
      {path && (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ padding:18, ...C.glass, border:"1px solid rgba(14,165,233,0.2)", borderRadius:16 }}>
            <h3 style={{ fontSize:"1.1rem", fontWeight:700, color:"#f0f2f8", marginBottom:6 }}>{path.title}</h3>
            <p style={{ fontSize:"0.875rem", color:"rgba(200,204,216,0.55)", lineHeight:1.65 }}>{path.overview}</p>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            {path.weeks?.map((w,i)=>(
              <div key={i} style={{ ...C.glass, border:"1px solid rgba(255,255,255,0.07)", borderRadius:13, padding:14 }}>
                <div style={{ fontSize:"0.67rem", fontWeight:800, color:"#0ea5e9", letterSpacing:"0.06em", marginBottom:10 }}>WEEK {w.week}: {w.theme?.toUpperCase()}</div>
                {w.days?.slice(0,4).map((d,j)=>(
                  <div key={j} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize:"0.68rem", fontWeight:700, color:"rgba(126,132,148,0.4)", width:28, flexShrink:0 }}>{d.day}</span>
                    <span style={{ fontSize:"0.78rem", color:"rgba(200,204,216,0.6)", flex:1 }}>{d.task}</span>
                    <span style={{ fontSize:"0.68rem", color:"rgba(126,132,148,0.35)" }}>{d.mins}m</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ ...C.glass, border:"1px solid rgba(255,255,255,0.07)", borderRadius:13, padding:14 }}>
            <div style={C.sectionLabel}>MILESTONES</div>
            {path.milestones?.map((m,i)=>(
              <div key={i} style={{ display:"flex", gap:10, padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ color:"#0ea5e9" }}>✦</span>
                <span style={{ fontSize:"0.875rem", color:"rgba(200,204,216,0.65)" }}>{m}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
    </Page>
  );
 
}
 function MindMap(){
 const {profile,toast}=useApp()
 const [topic,setTopic]=useState("")
 const [map,setMap]=useState(null)

 const gen=async()=>{
  if(!topic) return

  const data=await callAIJSON(`
Generate a simple mindmap for "${topic}"
Return JSON:
{
 "center":"topic",
 "nodes":[
   {"name":"node","children":["a","b","c"]}
 ]
}
`)

  setMap(data)
 }

 return(
  <Page title="🧠 Mind Map" sub="Visualize concepts">

   <div style={{display:"flex",gap:10,marginBottom:20}}>
    <input
     value={topic}
     onChange={e=>setTopic(e.target.value)}
     placeholder="Topic..."
     style={{...C.input,flex:1}}
    />

    <button style={C.btnPrimary} onClick={gen}>
     Generate
    </button>
   </div>

   {map && (
    <div style={{...C.glass,padding:20,borderRadius:12}}>
     <h3>{map.center}</h3>

     {map.nodes.map((n,i)=>(
      <div key={i} style={{marginTop:10}}>
       <b>{n.name}</b>

       <ul>
        {n.children.map((c,j)=>(
         <li key={j}>{c}</li>
        ))}
       </ul>

      </div>
     ))}
    </div>
   )}

  </Page>
 )
}

/* ═══ SHARED UI ═══ */
function Page({ title, sub, action, children }) {
  return (
    <div style={{ height:"100%", overflowY:"auto", padding: window.innerWidth < 768 ? "18px 16px 90px" : "22px 26px", display:"flex", flexDirection:"column", gap:0 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18, flexWrap:"wrap", gap:10 }}>
        <div>
          <h2 style={{ fontSize:"1.2rem", fontWeight:800, color:"#f0f2f8", marginBottom:2 }}>{title}</h2>
          {sub && <p style={{ fontSize:"0.78rem", color:"rgba(126,132,148,0.45)" }}>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
function EmptyState({ icon, text }) {
  return <div style={{ gridColumn:"1/-1", display:"flex", flexDirection:"column", alignItems:"center", padding:"50px 20px", gap:10 }}>
    <span style={{ fontSize:"2.2rem", opacity:0.25 }}>{icon}</span>
    <span style={{ fontSize:"0.875rem", color:"rgba(126,132,148,0.4)" }}>{text}</span>
  </div>;
}
function Logo({ size = 44 }) {
  return (
    <div style={{
      width:size,
      height:size,
      borderRadius:12,
      background:"linear-gradient(135deg,#0ea5e9,#8b5cf6)",
      display:"flex",
      alignItems:"center",
      justifyContent:"center",
      fontWeight:900,
      fontSize:size*0.45,
      color:"#fff",
      letterSpacing:"0.05em"
    }}>
      K
    </div>
  )
}
function Gicon({ size=15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" style={{flexShrink:0}}>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>;
}
function ToastLayer() {
  const { toasts } = useApp();
  return <div style={{ position:"fixed", bottom:20, right:20, display:"flex", flexDirection:"column", gap:7, zIndex:9999, pointerEvents:"none" }}>
    {toasts.map(t=>(
      <div key={t.id} style={{ display:"flex", alignItems:"center", gap:9, background:"#1e2738", border:`1px solid ${t.type==="xp"?"rgba(14,165,233,0.25)":t.type==="success"?"rgba(16,185,129,0.25)":"rgba(244,63,94,0.25)"}`, borderRadius:12, padding:"9px 15px", fontSize:"0.8125rem", fontWeight:600, boxShadow:"0 4px 16px rgba(0,0,0,0.4)", animation:"kfadeUp 0.25s ease", pointerEvents:"auto" }}>
        <span>{t.icon}</span><span style={{ color:"#f0f2f8" }}>{t.msg}</span>
      </div>
    ))}
  </div>;
}

function FloatingAI(){
 const {set}=useApp()

 return (
  <button
   onClick={()=>set({tool:"chat"})}
   style={{
    position:"fixed",
    bottom: window.innerWidth < 768 ? 80 : 25,
    right:25,
    width:56,
    height:56,
    borderRadius:"50%",
    background:"linear-gradient(135deg,#0ea5e9,#8b5cf6)",
    border:"none",
    color:"#fff",
    fontSize:"1.4rem",
    cursor:"pointer",
    boxShadow:"0 10px 30px rgba(0,0,0,0.4)",
    zIndex:999
   }}
  >
   ✦
  </button>
 )
}
function CommandPalette() {
  const { set } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const tools = [
    { name: "Brain Dump", id: "chat" },
    { name: "Flash Mode", id: "flash" },
    { name: "Quiz Grind", id: "quiz" },
    { name: "Essay Era", id: "essay" },
    { name: "Exam Oracle", id: "exam" },
    { name: "TLDR", id: "tldr" },
    { name: "Planner", id: "planner" },
    { name: "Notes", id: "notes" }
  ];

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!open) return null;

  const results = tools.filter(t =>
    t.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.6)",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      paddingTop: 120,
      zIndex: 9999
    }}>

      <div style={{
        width: 420,
        background: "#111828",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        overflow: "hidden"
      }}>

        <input
          autoFocus
          placeholder="Search tools..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 14px",
            border: "none",
            outline: "none",
            background: "#111828",
            color: "#e8eaf0",
            fontSize: "0.9rem"
          }}
        />

        {results.map(t => (
          <div
            key={t.id}
            onClick={() => {
              set({ tool: t.id });
              setOpen(false);
              setQuery("");
            }}
            style={{
              padding: "10px 14px",
              cursor: "pointer",
              borderTop: "1px solid rgba(255,255,255,0.05)"
            }}
          >
            {t.name}
          </div>
        ))}

      </div>
    </div>
  );
}

/* ═══ Design tokens ═══ */
const C = {
  center: { height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#080c14", padding:20 },
  card: { background:"#0d1220", border:"1px solid rgba(255,255,255,0.07)", borderRadius:20, padding:36, width:"100%", maxWidth:430 },
  glass:{
  background:"rgba(17,24,39,0.7)",
  backdropFilter:"blur(10px)",
  border:"1px solid rgba(255,255,255,0.08)"
},
  badge: { fontSize:"0.68rem", background:"rgba(14,165,233,0.1)", color:"#0ea5e9", border:"1px solid rgba(14,165,233,0.2)", borderRadius:100, padding:"2px 9px", fontWeight:700, display:"inline-block" },

  input: { width:"100%", height:36, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:9, padding:"0 11px", color:"#e8eaf0", fontSize:"0.8375rem", fontFamily:"inherit", outline:"none" },
  textarea: { width:"100%", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:"9px 12px", color:"#e8eaf0", fontSize:"0.8375rem", fontFamily:"inherit", outline:"none", resize:"none", lineHeight:1.65 },
  btnPrimary: { display:"inline-flex", alignItems:"center", gap:7, padding:"0 18px", height:36, borderRadius:100, border:"none", background:"#0ea5e9", color:"#fff", fontSize:"0.8125rem", fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit", flexShrink:0 },
  btnGhostSmall: { display:"inline-flex", alignItems:"center", gap:6, padding:"0 13px", height:30, borderRadius:100, border:"1px solid rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.03)", color:"rgba(200,204,216,0.65)", fontSize:"0.78rem", fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit" },
  btnPrimarySmall: { display:"inline-flex", alignItems:"center", gap:6, padding:"0 13px", height:30, borderRadius:100, border:"none", background:"#0ea5e9", color:"#fff", fontSize:"0.78rem", fontWeight:700, cursor:"pointer", fontFamily:"inherit" },
  sectionLabel: { fontSize:"0.63rem", fontWeight:800, letterSpacing:"0.1em", textTransform:"uppercase", color:"rgba(126,132,148,0.4)" },
};
function hexToRgb(hex) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
function BottomNav(){

  const { tool, set } = useApp()

  const mobile = window.innerWidth < 768

  if(!mobile) return null

  const items = [
    {id:"dashboard", icon:"⌂"},
    {id:"chat", icon:"✦"},
    {id:"notes", icon:"✎"},
    {id:"flash", icon:"⚡"},
    {id:"planner", icon:"☑"}
  ]

  return(
    <div style={{
      position:"fixed",
      bottom:0,
      left:0,
      right:0,
      height:60,
      background:"#0d1220",
      borderTop:"1px solid rgba(255,255,255,0.06)",
      display:"flex",
      justifyContent:"space-around",
      alignItems:"center",
      zIndex:999
    }}>

      {items.map(i=>{

        const active = tool === i.id

        return(
          <button
            key={i.id}
            onClick={()=>set({tool:i.id})}
            style={{
              background:"none",
              border:"none",
              color: active ? "#0ea5e9" : "rgba(200,204,216,0.45)",
              fontSize:"1.2rem",
              cursor:"pointer"
            }}
          >
            {i.icon}
          </button>
        )

      })}

    </div>
  )

}
/* ═══ Global CSS ═══ */
function GlobalStyles() {
  return (
    <style>{`
      *,*::before,*::after{
        box-sizing:border-box;
        margin:0;
        padding:0;
      }

      html{
        font-size:14px;
        -webkit-font-smoothing:antialiased;
      }

      body{
 background:#080c14;
 background-image:
 radial-gradient(circle at 20% 30%,rgba(14,165,233,0.15),transparent 40%),
 radial-gradient(circle at 80% 70%,rgba(139,92,246,0.15),transparent 40%);
}
 @keyframes logoSpin{
 0%{transform:rotate(0deg)}
 100%{transform:rotate(360deg)}
}

      button:disabled{
        opacity:0.45;
        cursor:not-allowed!important;
      }

      ::-webkit-scrollbar{
 width:5px;
 height:5px;
}

::-webkit-scrollbar-thumb{
 background:linear-gradient(#0ea5e9,#8b5cf6);
 border-radius:10px;
}

::-webkit-scrollbar-track{
 background:transparent;
}

      @keyframes kpulse{
        0%,100%{opacity:1;transform:scale(1);}
        50%{opacity:0.3;transform:scale(0.75);}
      }

      @keyframes kfadeUp{
        from{opacity:0;transform:translateY(8px);}
        to{opacity:1;transform:none;}
      }
        .card-hover{
  transition:all .2s ease;
}

.card-hover:hover{
  transform:translateY(-4px);
  box-shadow:0 10px 25px rgba(0,0,0,0.45);
}
  .page{
 animation:fadePage 0.25s ease;
}

@keyframes fadePage{
 from{
  opacity:0;
  transform:translateY(5px);
 }
 to{
  opacity:1;
  transform:none;
 }
}
 body{
 background:linear-gradient(-45deg,#080c14,#0d1220,#0b1324);
 background-size:400% 400%;
 animation:bgMove 18s ease infinite;
}

@keyframes bgMove{
 0%{background-position:0% 50%}
 50%{background-position:100% 50%}
 100%{background-position:0% 50%}
}
 .card-hover{
  transition:all .2s ease;
}

.card-hover:hover{
  transform:translateY(-4px);
  box-shadow:0 10px 25px rgba(0,0,0,0.45);
}
  /* Glass panel hover */
div[style*="backdrop-filter"]{
 transition:all .2s ease;
}

div[style*="backdrop-filter"]:hover{
 transform:translateY(-3px);
 box-shadow:0 12px 30px rgba(0,0,0,0.45);
}
 button{
 transition:all .15s ease;
}

button:hover{
 transform:translateY(-1px);
 filter:brightness(1.08);
}
 @keyframes floatLogo{
  0%{transform:translateY(0px)}
  50%{transform:translateY(-6px)}
  100%{transform:translateY(0px)}
}
  @keyframes glowMove{
  0%{transform:scale(1)}
  50%{transform:scale(1.15)}
  100%{transform:scale(1)}
}
  @media (max-width:768px){

  html{
    font-size:13px;
  }

  h1{
    font-size:1.6rem;
  }

  h2{
    font-size:1.2rem;
  }

  textarea{
    font-size:14px;
  }

  button{
    min-height:36px;
  }

}
      
    `}</style>
  );
}