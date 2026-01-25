
import { GoogleGenAI } from "@google/genai";
import { DiscussionState, EngineContext } from "./types";

// Initialize the Google GenAI client with the API key from environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const IMBALANCE_TEXT = "השיח אינו מאוזן כרגע, ישנם קולות שכמעט לא נשמעים";
const NUDGE_TEXT = "מאטים רגע, כדי לאפשר לאזן את השיח";
const STRUCTURED_TEXT = "כדי לתת מקום לכולם נעבור עכשיו לסבב תורות";
const PAUSE_TEXT = "ניקח רגע של שקט כדי לחשוב ולהפנים את מה שנאמר";
const CHECKIN_TEXT = "נמשיך בשיח רק אם אין התנגדות מהותית";

// Basic in-memory cache to prevent redundant API calls
const tipCache: Record<string, string> = {};

export async function getModerationTip(state: DiscussionState, context: EngineContext): Promise<string> {
  // 1. Check for hardcoded responses for specific intervention states immediately
  // This bypasses the API call for these states entirely.
  if (state === DiscussionState.IMBALANCE) return IMBALANCE_TEXT;
  if (state === DiscussionState.NUDGE) return NUDGE_TEXT;
  if (state === DiscussionState.STRUCTURED) return STRUCTURED_TEXT;
  if (state === DiscussionState.PAUSE) return PAUSE_TEXT;
  if (state === DiscussionState.CHECKIN) return CHECKIN_TEXT;

  // 2. For MONITORING state, try to use the cache or generate a new tip
  const cacheKey = `${state}-${context.speakers.length}`;
  if (tipCache[cacheKey]) {
    return tipCache[cacheKey];
  }

  const prompt = `
    You are an expert group discussion moderator.
    The current discussion state is: ${state}.
    Speaker statistics (talk time in seconds): ${JSON.stringify(context.talkTime)}.
    Total discussion time: ${context.totalSeconds}s.
    Current dominance score: ${context.dominanceScore.toFixed(2)}.

    Provide a short (one sentence), encouraging moderation tip in Hebrew for the group to maintain healthy dialogue.
    
    CRITICAL RULES:
    1. Only suggest keeping up the good work if state is monitoring.
    2. Respond strictly in Hebrew.
    3. Be concise (max 12 words).
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are a concise, supportive AI moderator for Hebrew speakers.",
        temperature: 0.7,
      }
    });
    
    const text = response.text?.trim() || "שיח פורה לכולם!";
    tipCache[cacheKey] = text;
    return text;
  } catch (error: any) {
    console.error("Gemini Error:", error);
    // If we hit a rate limit (429), return a generic encouraging message
    if (error?.message?.includes('429') || error?.status === 429) {
      return "נמשיך להקשיב ולנהל שיח מכבד.";
    }
    return "שיח פורה לכולם!";
  }
}
