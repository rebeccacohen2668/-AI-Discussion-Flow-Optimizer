
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DiscussionState, EngineContext, DiscussionEvent } from './types';
import { DiscussionEngine } from './DiscussionEngine';
import { getModerationTip } from './geminiService';
import { 
  Play, 
  ArrowRight, 
  CheckCircle, 
  PauseCircle, 
  BarChart2, 
  BrainCircuit, 
  Clock, 
  Timer, 
  Star, 
  Trash2, 
  Users, 
  Mic2, 
  Wind, 
  Zap, 
  Target, 
  ChevronRight,
  AlertTriangle
} from 'lucide-react';

const INITIAL_SPEAKERS: string[] = [];

const SPEAKER_COLORS = [
  { name: 'blue', gradient: 'from-blue-500 to-blue-700', text: 'text-blue-700' },
  { name: 'emerald', gradient: 'from-emerald-500 to-emerald-700', text: 'text-emerald-700' },
  { name: 'rose', gradient: 'from-rose-500 to-rose-700', text: 'text-rose-700' },
  { name: 'orange', gradient: 'from-orange-500 to-orange-700', text: 'text-orange-700' },
  { name: 'purple', gradient: 'from-purple-500 to-purple-700', text: 'text-purple-700' },
  { name: 'cyan', gradient: 'from-cyan-500 to-cyan-700', text: 'text-cyan-700' },
  { name: 'pink', gradient: 'from-pink-500 to-pink-700', text: 'text-pink-700' },
  { name: 'amber', gradient: 'from-amber-500 to-amber-700', text: 'text-amber-700' },
  { name: 'teal', gradient: 'from-teal-500 to-teal-700', text: 'text-teal-700' },
  { name: 'indigo', gradient: 'from-indigo-500 to-indigo-700', text: 'text-indigo-700' },
];

const STATE_THEMES: Record<DiscussionState, { label: string, color: string, bg: string, icon: any, fullBg: string }> = {
  [DiscussionState.MONITORING]: { label: "שיח פתוח", color: "text-emerald-600", bg: "from-blue-50 to-emerald-50", icon: Play, fullBg: "bg-emerald-50" },
  [DiscussionState.IMBALANCE]: { label: "זוהה חוסר איזון", color: "text-red-700", bg: "from-red-100 to-red-400", icon: AlertTriangle, fullBg: "bg-red-200" },
  [DiscussionState.NUDGE]: { label: "מאטים רגע", color: "text-blue-600", bg: "from-blue-100 to-indigo-100", icon: PauseCircle, fullBg: "bg-blue-50" },
  [DiscussionState.STRUCTURED]: { label: "סבב תורות", color: "text-purple-700", bg: "from-purple-50 to-indigo-50", icon: ArrowRight, fullBg: "bg-purple-50" },
  [DiscussionState.PAUSE]: { label: "שתיקה רפלקטיבית", color: "text-slate-400", bg: "from-white to-blue-50/20", icon: Wind, fullBg: "bg-white" },
  [DiscussionState.CHECKIN]: { label: "בודקים אם אפשר להמשיך", color: "text-emerald-700", bg: "from-cyan-50 to-emerald-50", icon: CheckCircle, fullBg: "bg-cyan-50" },
};

const App: React.FC = () => {
  const engine = useMemo(() => new DiscussionEngine(INITIAL_SPEAKERS), []);
  const [snap, setSnap] = useState(engine.snapshot());
  const [moderationTip, setModerationTip] = useState<string>("מחכים למשתתפים שיצטרפו לשיח...");
  const [isLoadingTip, setIsLoadingTip] = useState(false);
  const [newSpeakerName, setNewSpeakerName] = useState("");
  const [isAutoSimulating, setIsAutoSimulating] = useState(false);
  const [isQuietViewActive, setIsQuietViewActive] = useState(false);
  const [previousState, setPreviousState] = useState<DiscussionState | null>(null);
  const simInterval = useRef<number | null>(null);
  const lastFetchedState = useRef<string>("");

  const update = useCallback(() => {
    setSnap({ ...engine.snapshot() });
  }, [engine]);

  const handleEvent = useCallback((event: DiscussionEvent) => {
    engine.send(event);
    update();
  }, [engine, update]);

  const handleToggleSilence = useCallback(() => {
    if (snap.state === DiscussionState.PAUSE) {
      handleEvent({ type: 'FORCE_STATE', state: previousState || DiscussionState.MONITORING });
    } else {
      setPreviousState(snap.state);
      handleEvent({ type: 'FORCE_STATE', state: DiscussionState.PAUSE });
    }
  }, [snap.state, previousState, handleEvent]);

  const handleAddSpeaker = useCallback(() => {
    const trimmed = newSpeakerName.trim();
    if (trimmed && snap.context.speakers.length < 10) {
      handleEvent({ type: 'ADD_SPEAKER', name: trimmed });
      setNewSpeakerName("");
    }
  }, [newSpeakerName, handleEvent, snap.context.speakers.length]);

  useEffect(() => {
    if (isAutoSimulating) {
      simInterval.current = window.setInterval(() => {
        handleEvent({ type: 'TICK', seconds: 1 });
      }, 1000);
    } else {
      if (simInterval.current) clearInterval(simInterval.current);
    }
    return () => { if (simInterval.current) clearInterval(simInterval.current); };
  }, [isAutoSimulating, handleEvent]);

  useEffect(() => {
    if (snap.context.speakers.length === 0) return;
    
    const stateKey = `${snap.state}-${snap.context.speakers.length}`;
    if (lastFetchedState.current === stateKey) return;

    const fetchTipDebounced = setTimeout(async () => {
      setIsLoadingTip(true);
      try {
        const tip = await getModerationTip(snap.state, snap.context);
        setModerationTip(tip);
        lastFetchedState.current = stateKey;
      } catch (e) {
        console.error("Tip fetch failed", e);
      } finally {
        setIsLoadingTip(false);
      }
    }, 600);

    return () => clearTimeout(fetchTipDebounced);
  }, [snap.state, snap.context.speakers.length]);

  const { state, context } = snap;
  const theme = isQuietViewActive 
    ? { label: "הקול השקט", color: "text-blue-700", bg: "from-blue-50 to-indigo-50", fullBg: "bg-blue-50" } 
    : STATE_THEMES[state];

  const speakerColorMap = useMemo(() => {
    const map: Record<string, typeof SPEAKER_COLORS[0]> = {};
    context.speakers.forEach((s, i) => {
      map[s] = SPEAKER_COLORS[i % SPEAKER_COLORS.length];
    });
    return map;
  }, [context.speakers]);

  const getSpeakerStyle = (s: string) => speakerColorMap[s] || SPEAKER_COLORS[0];
  const totalTalk = (Object.values(context.talkTime) as number[]).reduce((a, b) => a + b, 0);
  const avgTalk = totalTalk / (context.speakers.length || 1);

  const isImbalanceMeasureActive = state !== DiscussionState.STRUCTURED && state !== DiscussionState.PAUSE;

  const roundProgressInfo = useMemo(() => {
    if (state !== DiscussionState.STRUCTURED || context.turnOrder.length === 0) return null;
    const speakerCount = context.turnOrder.length;
    const totalRoundSeconds = speakerCount * context.turnHoldSeconds;
    const turnElapsed = context.totalSeconds - context.turnSince;
    const roundElapsed = (context.turnIndex * context.turnHoldSeconds) + Math.min(turnElapsed, context.turnHoldSeconds);
    const progressPercent = (roundElapsed / totalRoundSeconds) * 100;
    return { progressPercent, roundElapsed, totalRoundSeconds };
  }, [state, context.turnOrder, context.turnIndex, context.turnSince, context.totalSeconds, context.turnHoldSeconds]);

  return (
    <div className={`h-screen w-screen flex flex-col md:flex-row gap-4 p-4 transition-all duration-1000 overflow-hidden ${theme.fullBg}`}>
      <style>{`
        @keyframes floating-slow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        .animate-floating-slow { animation: floating-slow 8s ease-in-out infinite; }
        @keyframes breathing { 
          0%, 100% { transform: scale(0.97); box-shadow: inset -12px -12px 30px rgba(0,0,0,0.1), inset 8px 8px 15px rgba(255,255,255,0.5), 0 20px 40px rgba(0,0,0,0.05); } 
          50% { transform: scale(1.05); box-shadow: inset -18px -18px 40px rgba(0,0,0,0.15), inset 12px 12px 25px rgba(255,255,255,0.7), 0 40px 80px rgba(0,0,0,0.1); } 
        }
        .shush-sphere { animation: breathing 6s ease-in-out infinite; }
        .progress-circle { transition: stroke-dashoffset 0.8s ease-out; }
        .round-bar-transition { transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); }
      `}</style>
      <div className={`bg-waves opacity-5 transition-colors duration-1000 ${state === DiscussionState.PAUSE ? 'mix-blend-overlay' : ''}`}></div>

      <section className="w-full md:w-[280px] lg:w-[320px] z-10 relative flex-shrink-0 h-full flex flex-col overflow-hidden">
        <div className="bg-white/95 backdrop-blur-2xl border border-white/60 rounded-[2rem] p-4 shadow-2xl flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between pb-2 border-b border-blue-100 shrink-0">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-900" />
              <h2 className="text-base font-black text-blue-950">לוח בקרה</h2>
            </div>
            <div className={`px-2 py-0.5 rounded-full border text-[8px] font-black flex items-center gap-1 ${context.autoMode ? 'bg-indigo-100 border-indigo-200 text-indigo-700' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
              <Zap size={9} fill={context.autoMode ? 'currentColor' : 'none'} />
              {context.autoMode ? 'אוטו' : 'ידני'}
            </div>
          </div>

          <div className="flex-1 flex flex-col space-y-2 pt-3 min-h-0 overflow-hidden">
            <button 
              onClick={() => handleEvent({ type: 'SET_AUTO_MODE', enabled: !context.autoMode })}
              className={`w-full py-2 px-3 rounded-xl flex items-center justify-between transition-all duration-300 border shrink-0 ${
                context.autoMode 
                ? 'bg-indigo-600 border-indigo-700 text-white' 
                : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Zap size={14} className={context.autoMode ? 'text-white' : 'text-slate-400'} />
                <span className="text-xs font-black tracking-tight">ניהול אוטומטי</span>
              </div>
              <div className={`w-7 h-3.5 rounded-full relative transition-colors ${context.autoMode ? 'bg-indigo-400' : 'bg-slate-300'}`}>
                <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full shadow-sm transition-all ${context.autoMode ? 'right-4' : 'right-0.5'}`}></div>
              </div>
            </button>

            <div className="flex gap-1.5 shrink-0">
              <button 
                onClick={() => setIsAutoSimulating(!isAutoSimulating)}
                disabled={context.speakers.length === 0}
                className={`flex-[2] py-2 rounded-xl font-black text-[10px] transition-all shadow active:scale-95 ${
                  isAutoSimulating 
                  ? 'bg-rose-100 text-rose-700 border border-rose-200' 
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50'
                }`}
              >
                {isAutoSimulating ? 'עצור' : 'הפעל דיון'}
              </button>
              <button 
                onClick={handleToggleSilence}
                className={`flex-1 py-2 rounded-xl font-black text-[10px] transition-all border shadow active:scale-95 ${
                  state === DiscussionState.PAUSE 
                  ? 'bg-blue-600 text-white border-blue-700' 
                  : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                }`}
              >
                {state === DiscussionState.PAUSE ? 'בטל' : 'שקט'}
              </button>
            </div>

            <div className="flex gap-1.5 shrink-0">
              <input 
                type="text"
                value={newSpeakerName}
                onChange={(e) => setNewSpeakerName(e.target.value)}
                placeholder="שם..."
                className="flex-1 bg-white border border-blue-200 rounded-xl px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                onKeyDown={(e) => e.key === 'Enter' && handleAddSpeaker()}
              />
              <button 
                onClick={handleAddSpeaker} 
                disabled={context.speakers.length >= 10 || !newSpeakerName.trim()}
                className="bg-indigo-600 text-white px-3.5 rounded-xl font-black text-xs hover:bg-indigo-700 disabled:opacity-50 shadow active:scale-95"
              >
                +
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden py-1">
              <div className="grid grid-cols-2 gap-1.5 h-full content-start">
                {context.speakers.map(s => {
                  const isActive = context.activeSpeaker === s;
                  const isQuiet = context.quietSpeaker === s;
                  const style = getSpeakerStyle(s);
                  return (
                    <div 
                      key={s} 
                      className={`group relative p-1.5 rounded-xl border transition-all duration-300 flex items-center gap-1.5 ${
                        isActive ? 'bg-white border-indigo-400 shadow scale-[1.02] z-10' : 'bg-blue-50/50 border-transparent hover:bg-white hover:border-blue-200'
                      }`}
                    >
                      <button 
                        onClick={() => handleEvent({ type: 'SPEAKER_SET', name: s })}
                        className={`w-7 h-7 rounded-lg bg-gradient-to-br ${style.gradient} flex items-center justify-center text-white font-black text-[10px] shrink-0 shadow relative`}
                      >
                        {s[0]}
                        {isActive && <div className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 border-2 border-white rounded-full animate-pulse shadow-sm"></div>}
                      </button>
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleEvent({ type: 'SPEAKER_SET', name: s })}>
                        <div className={`font-black text-[9px] truncate ${isActive ? 'text-indigo-950' : 'text-blue-900'}`}>{s}</div>
                        <div className="text-[8px] font-mono font-bold text-slate-400">{context.talkTime[s] || 0}s</div>
                      </div>
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEvent({ type: 'SET_QUIET_SPEAKER', name: isQuiet ? null : s })}
                          className={`p-0.5 rounded transition-colors ${isQuiet ? 'text-amber-600 bg-amber-50' : 'text-slate-400 hover:text-amber-500'}`}
                        >
                          <Target size={12} />
                        </button>
                        <button 
                          onClick={() => handleEvent({ type: 'REMOVE_SPEAKER', name: s })}
                          className="p-0.5 text-rose-400 hover:text-rose-600"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-blue-100 shrink-0">
              {Object.entries(STATE_THEMES).map(([st, info]) => (
                <button 
                  key={st}
                  onClick={() => handleEvent({ type: 'FORCE_STATE', state: st as DiscussionState })}
                  className={`text-[10px] p-2 rounded-xl border font-black flex items-center gap-1.5 transition-all active:scale-95 shadow-sm ${
                    state === st ? 'bg-blue-900 border-blue-950 text-white' : 'bg-white border-blue-50 text-blue-700 hover:bg-blue-50'
                  }`}
                >
                  <info.icon size={12} strokeWidth={2.5} />
                  <span className="truncate">{info.label}</span>
                </button>
              ))}
              <button 
                onClick={() => setIsQuietViewActive(!isQuietViewActive)}
                className={`col-span-2 text-[10px] p-2 rounded-xl border font-black flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm ${
                  isQuietViewActive ? 'bg-indigo-600 border-indigo-700 text-white' : 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100'
                }`}
              >
                <Mic2 size={12} />
                <span>מצב "קול שקט"</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="flex-1 flex flex-col gap-4 z-10 relative h-full overflow-hidden">
        <div className="flex-1 bg-white/60 backdrop-blur-3xl border border-white/60 rounded-[3rem] p-8 lg:p-12 flex flex-col relative overflow-hidden shadow-2xl transition-all duration-1000">
          <div className="flex justify-between items-start z-[60] mb-6 relative">
            <div className="space-y-1">
              <h1 className={`text-5xl lg:text-7xl font-black tracking-tighter ${theme.color} transition-all drop-shadow-md`}>
                {theme.label}
              </h1>
              <p className="text-slate-500 font-black text-xs uppercase tracking-[0.4em] opacity-60">AI DISCUSSION ANALYTICS</p>
            </div>
            <div className="flex gap-8 bg-white/70 p-4 px-6 rounded-[2.5rem] border border-white/90 shadow-lg backdrop-blur-md">
              <div className={`text-right transition-opacity duration-500 ${isImbalanceMeasureActive ? 'opacity-100' : 'opacity-30'}`}>
                <div className="text-xs uppercase font-black text-blue-900 flex items-center justify-end gap-1.5 mb-1"><BarChart2 size={14}/> מדד איזון</div>
                <div className={`text-5xl lg:text-6xl font-black tabular-nums leading-none tracking-tighter ${context.imbalanceFlag ? 'text-red-700 animate-pulse' : 'text-blue-950'}`}>
                  {(context.dominanceScore || 0).toFixed(2)}
                </div>
              </div>
              <div className="w-px h-12 bg-blue-100/60 self-center mx-1"></div>
              <div className="text-right">
                <div className="text-xs uppercase font-black text-blue-900 flex items-center justify-end gap-1.5 mb-1"><Clock size={14}/> זמן כולל</div>
                <div className="text-5xl lg:text-6xl font-black text-blue-950 tabular-nums leading-none tracking-tighter">
                  {context.totalSeconds}<span className="text-2xl ml-2 text-blue-300 font-black">s</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center relative min-h-0 py-4 z-20">
            {context.speakers.length === 0 ? (
              <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-1000 text-blue-50">
                <Users size={100} strokeWidth={1} />
                <p className="text-2xl font-black text-blue-900/20 text-center tracking-tight">הוסיפו משתתפים בלוח הבקרה...</p>
              </div>
            ) : isQuietViewActive ? (
              <div className="w-full h-full flex flex-col items-center justify-center animate-in slide-in-from-bottom-8 duration-700">
                <div className="relative">
                  <div className="absolute inset-0 bg-indigo-500 blur-[100px] opacity-10 animate-pulse"></div>
                  {!context.quietSpeaker ? (
                    <div className="text-center space-y-2">
                       <Mic2 size={60} className="mx-auto text-indigo-100 mb-2 opacity-50" />
                       <p className="text-2xl font-black text-indigo-900/40 tracking-tight">נא לבחור "קול שקט"</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                       <div className={`w-44 h-44 lg:w-60 lg:h-60 rounded-full bg-gradient-to-br ${getSpeakerStyle(context.quietSpeaker).gradient} shadow-2xl border-[8px] border-white flex items-center justify-center text-white font-black text-6xl relative z-10 animate-floating`}>
                          {context.quietSpeaker[0]}
                          <div className="absolute inset-[-12px] rounded-full border-4 border-indigo-400/30 animate-ping"></div>
                       </div>
                       <h2 className="mt-8 text-5xl font-black text-indigo-950 tracking-tighter drop-shadow-md">{context.quietSpeaker}</h2>
                    </div>
                  )}
                </div>
              </div>
            ) : state === DiscussionState.PAUSE ? (
              <div className="flex flex-col items-center gap-6 animate-in zoom-in duration-1000">
                 <div className="shush-sphere w-52 h-52 rounded-full bg-slate-50 border-[8px] border-slate-200 flex items-center justify-center shadow-inner">
                    <Wind size={80} className="text-slate-300" />
                 </div>
                 <div className="text-center">
                   <div className="text-8xl font-black text-slate-800 tabular-nums tracking-tighter">00:{String(Math.max(0, 20 - context.silenceSeconds)).padStart(2, '0')}</div>
                   <p className="text-2xl font-bold text-slate-400 mt-4 tracking-tight">מרחב שקט להתבוננות</p>
                 </div>
              </div>
            ) : (
              <div className={`flex flex-wrap items-center justify-center transition-all duration-1000 max-w-4xl px-4 ${state === DiscussionState.NUDGE ? 'gap-0 scale-95' : 'gap-8 lg:gap-12 mt-2'}`}>
                {context.speakers.map((s, idx) => {
                  const isActive = context.activeSpeaker === s;
                  const isQuiet = context.quietSpeaker === s;
                  const talkTime = context.talkTime[s] || 0;
                  const growthFactor = totalTalk > 0 ? (talkTime / avgTalk) : 1;
                  let size = 80;
                  if (state === DiscussionState.STRUCTURED) size = isActive ? 130 : 55;
                  else if (state === DiscussionState.NUDGE) size = 100;
                  else if (state === DiscussionState.CHECKIN) size = 90;
                  else size = Math.min(160, Math.max(80, 90 * (0.7 + growthFactor * 0.5)));
                  const style = getSpeakerStyle(s);
                  return (
                    <div key={s} className={`flex flex-col items-center transition-all duration-700 ease-out animate-floating-slow relative ${state === DiscussionState.NUDGE ? '-mx-3' : ''}`} style={{ animationDelay: `${idx * 0.4}s` }}>
                      <div style={{ width: size, height: size }} className={`rounded-full bg-gradient-to-br ${style.gradient} shadow-2xl transition-all duration-700 relative flex items-center justify-center border-[5px] border-white ${isActive ? 'ring-[10px] ring-indigo-500/10 scale-110 z-20' : 'opacity-90 z-10'}`}>
                         {isActive && (
                           <svg className="absolute inset-0 -rotate-90 pointer-events-none overflow-visible" viewBox="0 0 100 100">
                             <circle cx="50" cy="50" r="59" fill="none" stroke="currentColor" strokeWidth="3" className="text-indigo-500/10" />
                             {state === DiscussionState.STRUCTURED && (
                               <circle 
                                 cx="50" cy="50" r="59" fill="none" 
                                 stroke="currentColor" strokeWidth="3" 
                                 strokeDasharray="370.7"
                                 strokeDashoffset={370.7 * (1 - (context.totalSeconds - context.turnSince) / context.turnHoldSeconds)}
                                 className="text-indigo-500 progress-circle"
                               />
                             )}
                           </svg>
                         )}
                         <span className="text-white font-black drop-shadow-xl select-none" style={{ fontSize: size * 0.35 }}>{s[0]}</span>
                         {isQuiet && <Star className="absolute -top-2.5 -left-2.5 text-amber-400 fill-amber-400 drop-shadow-md" size={size * 0.3} />}
                      </div>
                      <div className={`mt-3 text-center transition-all duration-500 ${isActive ? 'scale-110 font-bold' : 'opacity-70'} ${state === DiscussionState.NUDGE ? 'opacity-40 scale-75' : ''}`}>
                         <div className={`text-sm font-black ${isActive ? 'text-indigo-950' : 'text-blue-900'}`}>{s}</div>
                         <div className="text-[10px] font-bold text-slate-500 tracking-widest uppercase mt-0.5">{talkTime}s</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {state === DiscussionState.STRUCTURED && roundProgressInfo && (
            <div className="mt-auto pt-8 flex flex-col gap-3 animate-in slide-in-from-bottom-4 duration-500 z-50 relative group">
              <div className="flex items-center justify-between px-2">
                <div className="text-xs font-black text-indigo-900 bg-white/50 px-3 py-1 rounded-full shadow-sm border border-indigo-100">
                  דובר {context.turnIndex + 1} מתוך {context.turnOrder.length}
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex-1 h-3 bg-blue-100/50 rounded-full overflow-hidden shadow-inner border border-blue-50/50 relative">
                  {/* Speaker delimiters */}
                  <div className="absolute inset-0 flex">
                    {context.turnOrder.map((_, i) => (
                      <div key={i} className={`h-full border-r border-indigo-200/20 last:border-0`} style={{ width: `${100 / context.turnOrder.length}%` }}></div>
                    ))}
                  </div>
                  {/* Continuous filler */}
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 round-bar-transition shadow-[0_0_15px_rgba(79,70,229,0.3)] relative"
                    style={{ width: `${roundProgressInfo.progressPercent}%` }}
                  >
                    <div className="absolute right-0 top-0 bottom-0 w-4 bg-white/20 blur-sm animate-pulse"></div>
                  </div>
                </div>
                
                <div className="flex flex-col items-center shrink-0">
                  <button 
                    onClick={() => handleEvent({ type: 'NEXT_TURN' })}
                    className="p-3 rounded-2xl bg-white border border-indigo-100 text-indigo-600 hover:bg-indigo-50 shadow-xl active:scale-90 transition-all group"
                    title="דובר הבא"
                  >
                    <ChevronRight size={24} className="group-hover:translate-x-0.5 transition-transform" />
                  </button>
                  <div className="mt-2 text-[10px] font-black text-indigo-900 bg-white/40 px-3 py-1 rounded-full shadow-sm border border-indigo-50/50 uppercase tracking-tighter">
                    {context.turnOrder[context.turnIndex]}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-blue-950 text-white rounded-[2rem] p-4 lg:p-6 relative overflow-hidden shadow-2xl flex items-center gap-5 border border-white/10 shrink-0 mb-4 mx-4 z-40">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/15 blur-3xl rounded-full"></div>
          <div className="bg-gradient-to-br from-indigo-500 to-blue-700 p-3 rounded-[1.1rem] shadow-2xl border border-white/20 shrink-0">
             <BrainCircuit className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <span className="bg-indigo-500/30 text-indigo-200 text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border border-indigo-500/40 shadow-inner">AI Moderator Insight</span>
              {isLoadingTip && <div className="flex gap-1"><div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce"></div><div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></div></div>}
            </div>
            <p className={`text-sm lg:text-base font-bold leading-relaxed text-blue-50 drop-shadow-sm`}>
              {isQuietViewActive ? "עכשיו ניתן במה למי שעוד לא דיבר" : moderationTip}
            </p>
          </div>
          {context.autoMode && (
            <div className="hidden lg:flex flex-col items-center shrink-0 bg-white/10 p-2.5 rounded-xl border border-white/10 shadow-inner">
              <Timer size={16} className="text-indigo-400" />
              <div className="text-[8px] font-black text-indigo-300 mt-1 uppercase tracking-widest">Auto</div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default App;
