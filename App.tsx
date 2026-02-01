
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
  { name: 'deep-forest', gradient: 'from-[#4a635d] to-[#2c3d38]', text: 'text-[#4a635d]' },
  { name: 'burnt-sienna', gradient: 'from-[#a66e51] to-[#7d4f38]', text: 'text-[#a66e51]' },
  { name: 'dark-moss', gradient: 'from-[#6b754d] to-[#4c5436]', text: 'text-[#6b754d]' },
  { name: 'golden-bronze', gradient: 'from-[#b5925d] to-[#8a6e42]', text: 'text-[#b5925d]' },
  { name: 'navy-steel', gradient: 'from-[#5c727d] to-[#3d4d54]', text: 'text-[#5c727d]' },
  { name: 'dark-umber', gradient: 'from-[#8c6b5a] to-[#5d473b]', text: 'text-[#8c6b5a]' },
  { name: 'pine', gradient: 'from-[#547366] to-[#3a4f46]', text: 'text-[#547366]' },
  { name: 'deep-coral', gradient: 'from-[#b38576] to-[#8c6559]', text: 'text-[#b38576]' },
  { name: 'antique-khaki', gradient: 'from-[#9e9672] to-[#736d52]', text: 'text-[#9e9672]' },
  { name: 'charcoal', gradient: 'from-[#6e747a] to-[#454a4f]', text: 'text-[#6e747a]' },
];

const STATE_THEMES: Record<DiscussionState, { label: string, color: string, bg: string, icon: any, fullBg: string }> = {
  [DiscussionState.MONITORING]: { label: "שיח פתוח", color: "text-[#4a635d]", bg: "from-[#f2ede4] to-[#ebe6db]", icon: Play, fullBg: "bg-[#f2ede4]" },
  [DiscussionState.IMBALANCE]: { label: "זוהה חוסר איזון", color: "text-red-900", bg: "from-[#fecaca] to-[#fca5a5]", icon: AlertTriangle, fullBg: "bg-[#fee2e2]" },
  [DiscussionState.NUDGE]: { label: "מאטים רגע", color: "text-[#7d4f38]", bg: "from-[#ebe4d8] to-[#dfd6c6]", icon: PauseCircle, fullBg: "bg-[#ebe4d8]" },
  [DiscussionState.STRUCTURED]: { label: "סבב תורות", color: "text-[#4c5436]", bg: "from-[#e9eee6] to-[#dae2d4]", icon: ArrowRight, fullBg: "bg-[#e9eee6]" },
  [DiscussionState.PAUSE]: { label: "שתיקה רפלקטיבית", color: "text-[#5d473b]", bg: "from-[#f2ede4] to-[#e8e2d8]", icon: Wind, fullBg: "bg-[#f2ede4]" },
  [DiscussionState.CHECKIN]: { label: "בודקים אם אפשר להמשיך", color: "text-[#4a635d]", bg: "from-[#e6efea] to-[#d4e4db]", icon: CheckCircle, fullBg: "bg-[#e6efea]" },
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

  const toggleQuietMode = useCallback(() => {
    const nextVal = !isQuietViewActive;
    setIsQuietViewActive(nextVal);
    handleEvent({ type: 'SET_QUIET_MODE', enabled: nextVal });
  }, [isQuietViewActive, handleEvent]);

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
    ? { label: "הקול השקט", color: "text-[#8a6e42]", bg: "from-[#f5f1ea] to-[#ebe4d8]", fullBg: "bg-[#f5f1ea]" } 
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

  const isImbalanceMeasureActive = 
    state !== DiscussionState.STRUCTURED && 
    state !== DiscussionState.PAUSE && 
    state !== DiscussionState.NUDGE && 
    state !== DiscussionState.CHECKIN;

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
    <div className={`h-screen w-screen flex flex-col md:flex-row gap-4 p-4 transition-all duration-1000 overflow-hidden ${theme.fullBg} ${state === DiscussionState.IMBALANCE ? 'imbalance-bg-active' : ''}`}>
      <style>{`
        @keyframes floating-slow { 
          0%, 100% { transform: translate(0, 0) rotate(0deg); } 
          25% { transform: translate(8px, -15px) rotate(1deg); }
          50% { transform: translate(-5px, -8px) rotate(-1deg); }
          75% { transform: translate(-10px, -12px) rotate(0.5deg); }
        }
        .animate-floating-slow { animation: floating-slow 10s ease-in-out infinite; }
        
        @keyframes breathing { 
          0%, 100% { transform: scale(0.97); box-shadow: inset -12px -12px 30px rgba(58, 47, 40, 0.1), inset 8px 8px 15px rgba(255, 255, 255, 0.2); } 
          50% { transform: scale(1.05); box-shadow: inset -18px -18px 40px rgba(58, 47, 40, 0.15), inset 12px 12px 25px rgba(255, 255, 255, 0.3); } 
        }
        .shush-sphere { animation: breathing 6s ease-in-out infinite; }
        
        @keyframes imbalance-pulse {
          0%, 100% { background-color: rgba(254, 202, 202, 0.3); box-shadow: inset 0 0 100px rgba(185, 28, 28, 0.05); }
          50% { background-color: rgba(254, 202, 202, 0.6); box-shadow: inset 0 0 150px rgba(185, 28, 28, 0.15); }
        }
        .imbalance-bg-active {
          animation: imbalance-pulse 3s ease-in-out infinite;
        }

        .progress-circle { transition: stroke-dashoffset 0.8s ease-out; }
        .round-bar-transition { transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); }
        .imbalance-glow { box-shadow: 0 0 35px 15px rgba(185, 28, 28, 0.4); }
      `}</style>
      <div className={`bg-waves opacity-20 transition-colors duration-1000 ${state === DiscussionState.PAUSE ? 'mix-blend-overlay' : ''}`}></div>

      {/* Control Panel (Sidebar) */}
      <section className="w-full md:w-[280px] lg:w-[320px] z-10 relative flex-shrink-0 h-full flex flex-col overflow-hidden">
        <div className={`bg-[#f5f1ea]/95 backdrop-blur-2xl border transition-colors duration-500 rounded-[2rem] p-4 shadow-xl flex flex-col h-full overflow-hidden ${state === DiscussionState.IMBALANCE ? 'border-red-300 shadow-red-100/30' : 'border-[#d6cdc1]/70'}`}>
          <div className="flex items-center justify-between pb-3 border-b border-[#d6cdc1] shrink-0">
            <div className="flex items-center gap-3">
              <Users className={`w-6 h-6 ${state === DiscussionState.IMBALANCE ? 'text-red-800' : 'text-[#5d473b]'}`} />
              <h2 className="text-xl font-black text-[#3d2e25]">לוח בקרה</h2>
            </div>
            <div className={`px-2 py-1 rounded-full border text-[10px] font-black flex items-center gap-1.5 ${context.autoMode ? 'bg-[#d4e4db] border-[#4a635d]/20 text-[#2c3d38]' : 'bg-white/50 border-[#d6cdc1] text-slate-600'}`}>
              <Zap size={10} fill={context.autoMode ? 'currentColor' : 'none'} />
              {context.autoMode ? 'אוטו' : 'ידני'}
            </div>
          </div>

          <div className="flex-1 flex flex-col space-y-3 pt-4 min-h-0 overflow-hidden">
            <button 
              onClick={() => handleEvent({ type: 'SET_AUTO_MODE', enabled: !context.autoMode })}
              className={`w-full py-3 px-4 rounded-xl flex items-center justify-between transition-all duration-300 border shrink-0 ${
                context.autoMode 
                ? 'bg-[#4a635d] border-[#2c3d38] text-white shadow-md' 
                : 'bg-white/60 border-[#d6cdc1] text-[#5d473b] hover:border-[#4a635d]/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <Zap size={18} className={context.autoMode ? 'text-white' : 'text-[#4a635d]'} />
                <span className="text-lg font-black tracking-tight">ניהול אוטומטי</span>
              </div>
              <div className={`w-10 h-5 rounded-full relative transition-colors ${context.autoMode ? 'bg-[#2c3d38]' : 'bg-slate-400'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${context.autoMode ? 'right-5.5' : 'right-0.5'}`}></div>
              </div>
            </button>

            <div className="flex gap-2 shrink-0">
              <button 
                onClick={() => setIsAutoSimulating(!isAutoSimulating)}
                disabled={context.speakers.length === 0}
                className={`flex-[2] py-3 rounded-xl font-black text-lg transition-all shadow-sm active:scale-95 ${
                  isAutoSimulating 
                  ? 'bg-[#ebe4d8] text-[#7d4f38] border border-[#7d4f38]/30' 
                  : 'bg-[#4a635d] text-white hover:bg-[#2c3d38] disabled:opacity-50'
                }`}
              >
                {isAutoSimulating ? 'עצור' : 'הפעל'}
              </button>
              <button 
                onClick={handleToggleSilence}
                className={`flex-1 py-3 rounded-xl font-black text-lg transition-all border shadow-sm active:scale-95 ${
                  state === DiscussionState.PAUSE 
                  ? 'bg-[#8a6e42] text-white border-[#8a6e42]' 
                  : 'bg-[#f5f1ea] text-[#5d473b] border-[#d6cdc1] hover:bg-[#ebe6db]'
                }`}
              >
                {state === DiscussionState.PAUSE ? 'בטל' : 'שקט'}
              </button>
            </div>

            <div className="flex gap-2 shrink-0">
              <input 
                type="text"
                value={newSpeakerName}
                onChange={(e) => setNewSpeakerName(e.target.value)}
                placeholder="שמות המשתתפים"
                className="flex-1 bg-white/80 border border-[#d6cdc1] rounded-xl px-3 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#4a635d]/20"
                onKeyDown={(e) => e.key === 'Enter' && handleAddSpeaker()}
              />
              <button 
                onClick={handleAddSpeaker} 
                disabled={context.speakers.length >= 10 || !newSpeakerName.trim()}
                className="bg-[#5d473b] text-white px-5 rounded-xl font-black text-xl hover:bg-[#3d2e25] disabled:opacity-50 shadow-sm active:scale-95"
              >
                +
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden py-1">
              <div className="grid grid-cols-2 gap-2 h-full content-start overflow-y-auto scrollbar-hide">
                {context.speakers.map(s => {
                  const isActive = context.activeSpeaker === s;
                  const isQuiet = context.quietSpeaker === s;
                  const style = getSpeakerStyle(s);
                  return (
                    <div 
                      key={s} 
                      className={`group relative p-2 rounded-xl border transition-all duration-300 flex items-center gap-2 ${
                        isActive ? 'bg-white border-[#4a635d]/50 shadow-md scale-[1.02] z-10' : 'bg-[#e8e2d8]/50 border-transparent hover:bg-white hover:border-[#d6cdc1]'
                      }`}
                    >
                      <button 
                        onClick={() => handleEvent({ type: 'SPEAKER_SET', name: s })}
                        className={`w-8 h-8 rounded-lg bg-gradient-to-br ${style.gradient} flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm relative`}
                      >
                        {s[0]}
                        {isActive && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#4a635d] border-2 border-white rounded-full animate-pulse shadow-sm"></div>}
                      </button>
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleEvent({ type: 'SPEAKER_SET', name: s })}>
                        <div className={`font-black text-[13px] truncate ${isActive ? 'text-[#1a1816]' : 'text-[#3d2e25]'}`}>{s}</div>
                        <div className="text-[10px] font-mono font-bold text-[#736d52]">{context.talkTime[s] || 0}s</div>
                      </div>
                      <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 bg-white/95 rounded-md p-0.5 shadow-sm">
                        <button 
                          onClick={() => handleEvent({ type: 'SET_QUIET_SPEAKER', name: isQuiet ? null : s })}
                          className={`p-0.5 rounded transition-colors ${isQuiet ? 'text-[#8a6e42]' : 'text-slate-500 hover:text-[#8a6e42]'}`}
                        >
                          <Target size={12} />
                        </button>
                        <button 
                          onClick={() => handleEvent({ type: 'REMOVE_SPEAKER', name: s })}
                          className="p-0.5 text-red-600/70 hover:text-red-900"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#d6cdc1] shrink-0">
              {Object.entries(STATE_THEMES).map(([st, info]) => (
                <button 
                  key={st}
                  onClick={() => handleEvent({ type: 'FORCE_STATE', state: st as DiscussionState })}
                  className={`min-h-[50px] p-2 rounded-xl border font-black flex items-center gap-2 transition-all active:scale-95 shadow-sm ${
                    state === st ? 'bg-[#5d473b] border-[#3d2e25] text-white shadow-md' : 'bg-white/80 border-[#d6cdc1] text-[#5d473b] hover:bg-[#f5f1ea]'
                  }`}
                >
                  <info.icon size={16} strokeWidth={2.5} className="shrink-0" />
                  <span className="text-[11px] leading-tight text-right flex-1">{info.label}</span>
                </button>
              ))}
              <button 
                onClick={toggleQuietMode}
                className={`col-span-2 text-base p-3 rounded-xl border font-black flex items-center justify-center gap-3 transition-all active:scale-95 shadow-md ${
                  isQuietViewActive ? 'bg-[#8a6e42] border-[#736d52] text-white' : 'bg-[#4a635d] border-[#2c3d38] text-[#f5f1ea] hover:bg-[#2c3d38]'
                }`}
              >
                <Mic2 size={20} />
                <span>{isQuietViewActive ? 'בטל "קול שקט"' : 'מצב "קול שקט"'}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Discussion Workspace */}
      <section className="flex-1 flex flex-col gap-4 z-10 relative h-full overflow-hidden">
        <div className={`flex-1 bg-white/60 backdrop-blur-3xl border transition-all duration-1000 rounded-[3rem] p-6 flex flex-col relative overflow-hidden shadow-2xl ${state === DiscussionState.IMBALANCE ? 'border-red-400 shadow-red-200/40' : 'border-white/40'}`}>
          <div className="flex justify-between items-start z-[60] mb-4 relative">
            <div className="space-y-1">
              <h1 className={`text-3xl lg:text-5xl font-black tracking-tighter ${theme.color} transition-all drop-shadow-sm`}>
                {theme.label}
              </h1>
              <p className="text-[#736d52] font-black text-[10px] uppercase tracking-[0.4em] opacity-80">AI DISCUSSION ANALYTICS</p>
            </div>
            
            <div className={`flex gap-4 lg:gap-6 bg-white/90 p-2.5 px-5 rounded-[2rem] border transition-colors shadow-xl backdrop-blur-md ${state === DiscussionState.IMBALANCE ? 'border-red-200' : 'border-[#d6cdc1]/40'}`}>
              <div className={`text-right transition-all duration-500 ${isImbalanceMeasureActive ? 'opacity-100' : 'opacity-30'}`}>
                <div className={`text-[10px] lg:text-xs uppercase font-black flex items-center justify-end gap-1 mb-0.5 ${state === DiscussionState.IMBALANCE ? 'text-red-900' : 'text-[#3d2e25]'}`}><BarChart2 size={12}/> מדד איזון</div>
                <div className={`text-2xl lg:text-4xl font-black tabular-nums leading-none tracking-tighter ${context.imbalanceFlag ? 'text-red-900 animate-pulse' : 'text-[#1a1816]'}`}>
                  {(context.dominanceScore || 0).toFixed(2)}
                </div>
              </div>
              <div className="w-px h-10 bg-[#d6cdc1]/60 self-center mx-1"></div>
              <div className="text-right">
                <div className="text-[10px] lg:text-xs uppercase font-black text-[#1a1816] flex items-center justify-end gap-1 mb-0.5"><Clock size={12}/> זמן כולל</div>
                <div className="text-2xl lg:text-4xl font-black text-[#1a1816] tabular-nums leading-none tracking-tighter">
                  {context.totalSeconds}<span className="text-base ml-1 text-[#736d52] font-black">s</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center relative min-h-0 py-2 z-20 overflow-hidden">
            {context.speakers.length === 0 ? (
              <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-1000 text-[#d6cdc1]">
                <Users size={80} strokeWidth={1} />
                <p className="text-2xl font-black text-[#3d2e25]/20 text-center tracking-tight">הוסיפו משתתפים בלוח הבקרה כדי להתחיל...</p>
              </div>
            ) : isQuietViewActive ? (
              <div className="w-full h-full flex flex-col items-center justify-center animate-in slide-in-from-bottom-8 duration-700">
                <div className="relative">
                  <div className="absolute inset-0 bg-[#8a6e42] blur-[100px] opacity-20 animate-pulse"></div>
                  {!context.quietSpeaker ? (
                    <div className="text-center space-y-4">
                       <Mic2 size={80} className="mx-auto text-[#d6cdc1] mb-4 opacity-60" />
                       <p className="text-2xl font-black text-[#3d2e25]/40 tracking-tight">נא לבחור "קול שקט" מלוח הבקרה</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                       <div className={`w-40 h-40 lg:w-56 lg:h-56 rounded-full bg-gradient-to-br ${getSpeakerStyle(context.quietSpeaker).gradient} shadow-2xl border-[8px] border-white flex items-center justify-center text-white font-black text-6xl lg:text-7xl relative z-10 animate-floating`}>
                          {context.quietSpeaker[0]}
                          <div className="absolute inset-[-12px] rounded-full border-4 border-[#8a6e42]/30 animate-ping"></div>
                       </div>
                       <h2 className="mt-8 text-4xl lg:text-5xl font-black text-[#1a1816] tracking-tighter drop-shadow-md">{context.quietSpeaker}</h2>
                    </div>
                  )}
                </div>
              </div>
            ) : state === DiscussionState.PAUSE ? (
              <div className="flex flex-col items-center gap-6 animate-in zoom-in duration-1000">
                 <div className="shush-sphere w-48 h-48 lg:w-56 lg:h-56 rounded-full bg-[#ebe6db] border-[10px] border-[#d6cdc1]/50 flex items-center justify-center shadow-inner">
                    <Wind size={60} className="text-[#736d52]" />
                 </div>
                 <div className="text-center">
                   <div className="text-6xl lg:text-7xl font-black text-[#1a1816] tabular-nums tracking-tighter">00:{String(Math.max(0, 20 - context.silenceSeconds)).padStart(2, '0')}</div>
                   <p className="text-xl lg:text-2xl font-bold text-[#736d52] mt-4 tracking-tight">מרחב שקט להתבוננות והפנמה</p>
                 </div>
              </div>
            ) : (
              <div className={`w-full h-full flex flex-wrap items-center justify-center transition-all duration-1000 ${state === DiscussionState.NUDGE ? 'gap-0 max-w-[450px]' : 'gap-6 lg:gap-12'}`}>
                {context.speakers.map((s, idx) => {
                  const isActive = context.activeSpeaker === s;
                  const isQuiet = context.quietSpeaker === s;
                  const talkTime = context.talkTime[s] || 0;
                  const growthFactor = totalTalk > 0 ? (talkTime / avgTalk) : 1;
                  
                  const isFlagged = context.imbalanceFlag && 
                                   (talkTime / avgTalk > 1.5) && 
                                   state !== DiscussionState.NUDGE && 
                                   state !== DiscussionState.CHECKIN;
                  
                  let size = 95;
                  if (state === DiscussionState.STRUCTURED) {
                    size = isActive ? 150 : 75;
                  } else if (state === DiscussionState.NUDGE) {
                    size = 85; 
                  } else if (state === DiscussionState.CHECKIN) {
                    size = 90;
                  } else {
                    size = Math.min(150, Math.max(85, 95 * (0.8 + growthFactor * 0.4)));
                  }
                  
                  const style = getSpeakerStyle(s);
                  return (
                    <div 
                      key={s} 
                      className={`flex flex-col items-center transition-all duration-1000 ease-in-out relative animate-floating-slow ${state === DiscussionState.NUDGE ? 'scale-95 -mx-3 -my-1 z-20' : ''}`}
                      style={{ animationDelay: `${idx * 0.3}s` }}
                    >
                      <div 
                        style={{ width: size, height: size }} 
                        className={`rounded-full bg-gradient-to-br ${style.gradient} shadow-lg transition-all duration-1000 relative flex items-center justify-center border-[5px] border-white/60 ${isActive ? 'ring-[8px] ring-[#4a635d]/20 scale-110 z-30 shadow-xl' : 'opacity-90 z-10'} ${isFlagged ? 'imbalance-glow' : ''} ${state === DiscussionState.NUDGE ? 'shadow-inner ring-2 ring-white/30' : ''}`}
                      >
                         {isActive && (
                           <svg className="absolute inset-0 -rotate-90 pointer-events-none overflow-visible" viewBox="0 0 100 100">
                             <circle cx="50" cy="50" r="58" fill="none" stroke="currentColor" strokeWidth="4" className="text-[#4a635d]/10" />
                             {state === DiscussionState.STRUCTURED && (
                               <circle 
                                 cx="50" cy="50" r="58" fill="none" 
                                 stroke="currentColor" strokeWidth="4" 
                                 strokeDasharray="364.4"
                                 strokeDashoffset={364.4 * (1 - (context.totalSeconds - context.turnSince) / context.turnHoldSeconds)}
                                 className="text-[#4a635d] progress-circle"
                               />
                             )}
                           </svg>
                         )}
                         <span className="text-white font-black drop-shadow-md select-none transition-all duration-1000" style={{ fontSize: size * 0.35 }}>{s[0]}</span>
                         {isQuiet && <Star className="absolute -top-2 -left-2 text-[#8a6e42] fill-[#8a6e42] drop-shadow-md" size={size * 0.3} />}
                      </div>
                      <div className={`mt-2.5 text-center transition-all duration-1000 ${isActive ? 'scale-110 font-bold' : 'opacity-70'}`}>
                         <div className={`text-sm font-black truncate max-w-[100px] ${isActive ? 'text-[#1a1816]' : 'text-[#3d2e25]'}`}>{s}</div>
                         <div className="text-[10px] font-bold text-[#736d52] tracking-widest uppercase mt-0.5">{talkTime}s</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {state === DiscussionState.STRUCTURED && roundProgressInfo && (
            <div className="mt-auto pt-4 flex flex-col gap-3 animate-in slide-in-from-bottom-4 duration-500 z-50 relative group">
              <div className="flex items-center justify-between px-2">
                <div className="text-[10px] font-black text-[#1a1816] bg-white/60 px-3 py-1.5 rounded-full shadow-sm border border-[#d6cdc1]/60">
                  דובר {context.turnIndex + 1} מתוך {context.turnOrder.length}
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex-1 h-2.5 bg-[#d6cdc1]/40 rounded-full overflow-hidden shadow-inner border border-[#d6cdc1]/30 relative">
                  <div className="absolute inset-0 flex">
                    {context.turnOrder.map((_, i) => (
                      <div key={i} className={`h-full border-r border-[#d6cdc1]/30 last:border-0`} style={{ width: `${100 / context.turnOrder.length}%` }}></div>
                    ))}
                  </div>
                  <div className="h-full bg-gradient-to-r from-[#4a635d] to-[#2c3d38] round-bar-transition shadow-[0_0_10px_rgba(74,99,93,0.3)] relative" style={{ width: `${roundProgressInfo.progressPercent}%` }}></div>
                </div>
                <div className="flex flex-col items-center shrink-0">
                  <button onClick={() => handleEvent({ type: 'NEXT_TURN' })} className="p-2.5 rounded-xl bg-white/80 border border-[#d6cdc1]/70 text-[#4a635d] hover:bg-[#e6efea] shadow-md active:scale-90 transition-all group">
                    <ChevronRight size={28} className="group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* AI Notification Drawer */}
        <div className={`transition-all duration-700 rounded-[2rem] p-5 lg:p-6 relative overflow-hidden shadow-xl flex items-center gap-5 border shrink-0 mb-4 mx-4 z-40 ${state === DiscussionState.IMBALANCE ? 'bg-red-950 border-red-800 text-white shadow-red-200/20' : 'bg-[#445e54] border-white/10 text-[#f5f1ea]'}`}>
          <div className={`p-3 rounded-2xl border shrink-0 ${state === DiscussionState.IMBALANCE ? 'bg-white/10 border-white/20' : 'bg-white/10 border-white/10'}`}>
             <BrainCircuit className="w-6 h-6 lg:w-7 lg:h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <span className={`text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em] px-3 py-0.5 rounded-full border shadow-inner ${state === DiscussionState.IMBALANCE ? 'bg-white/10 border-white/20 text-white' : 'bg-white/10 border-white/5 text-[#f5f1ea]'}`}>AI Moderator Insight</span>
              {isLoadingTip && <div className="flex gap-1.5"><div className="w-1 h-1 bg-white/60 rounded-full animate-bounce"></div><div className="w-1 h-1 bg-white/60 rounded-full animate-bounce [animation-delay:0.2s]"></div></div>}
            </div>
            <p className={`text-sm lg:text-xl font-bold leading-tight drop-shadow-sm truncate-3-lines`}>
              {isQuietViewActive ? "עכשיו זמן להקשיב למי שטרם השמיע את קולו" : moderationTip}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default App;
