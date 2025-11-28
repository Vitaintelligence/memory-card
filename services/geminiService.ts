
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ThemeResponse } from "../types";

const FALLBACK_ICONS = ["🚀", "🪐", "👽", "☄️", "🌑", "🌟", "🛸", "🔭", "👾", "🤖", "🌞", "🌍", "⚡", "🔥", "🌈", "🍎", "🍕", "🎈", "🚗", "🐶", "🐱", "🦊", "🐸", "🐵", "🦄", "🐝", "🐞", "🐠", "🐬", "🐳"];
const FALLBACK_COLORS = ["#FECACA", "#BFDBFE", "#BBF7D0", "#FDE68A", "#DDD6FE", "#FBCFE8", "#C7D2FE", "#E9D5FF", "#A7F3D0", "#BAE6FD", "#E5E7EB", "#FECDD3", "#F5D0FE", "#C4B5FD", "#A5F3FC", "#6EE7B7", "#D4D4D8", "#FDA4AF", "#F0ABFC", "#818CF8"];

const getFallbackTheme = (count: number): ThemeResponse => {
    // Generate enough items by cycling if needed
    const items: string[] = [];
    const colors: string[] = [];
    
    for(let i=0; i<count; i++) {
        items.push(FALLBACK_ICONS[i % FALLBACK_ICONS.length]);
        colors.push(FALLBACK_COLORS[i % FALLBACK_COLORS.length]);
    }
    
    return { items, backgroundColorPalette: colors };
};

export const generateThemeDeck = async (theme: string, pairCount: number = 8): Promise<ThemeResponse> => {
  if (!process.env.API_KEY) {
    console.warn("No API Key found. Using fallback theme.");
    return getFallbackTheme(pairCount);
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      items: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: `A list of ${pairCount} unique emojis or short words (max 2 chars) related to the theme.`,
      },
      backgroundColorPalette: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: `A list of ${pairCount} hex color codes (pastel tones) that match the theme.`,
      }
    },
    required: ["items", "backgroundColorPalette"],
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate a memory match card set for the theme: "${theme}". Need ${pairCount} unique items (emojis preferrred) and ${pairCount} matching pastel hex colors.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    if (response.text) {
      const data = JSON.parse(response.text) as ThemeResponse;
      // Ensure we have enough items
      if (data.items.length < pairCount) {
          // Fill missing if AI hallucinated fewer items
          const fallback = getFallbackTheme(pairCount);
          return {
              items: [...data.items, ...fallback.items.slice(data.items.length)],
              backgroundColorPalette: [...data.backgroundColorPalette, ...fallback.backgroundColorPalette.slice(data.backgroundColorPalette.length)]
          };
      }
      return data;
    }
    return getFallbackTheme(pairCount);
  } catch (error) {
    console.error("Gemini generation failed", error);
    return getFallbackTheme(pairCount);
  }
};
