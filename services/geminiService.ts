import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ThemeResponse } from "../types";

const FALLBACK_THEME: ThemeResponse = {
  items: ["🚀", "🪐", "👽", "☄️", "🌑", "🌟", "🛸", "🔭"],
  backgroundColorPalette: ["#FECACA", "#BFDBFE", "#BBF7D0", "#FDE68A", "#DDD6FE", "#FBCFE8", "#C7D2FE", "#E9D5FF"]
};

export const generateThemeDeck = async (theme: string): Promise<ThemeResponse> => {
  if (!process.env.API_KEY) {
    console.warn("No API Key found. Using fallback theme.");
    return FALLBACK_THEME;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      items: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "A list of 8 unique emojis or short words (max 2 chars) related to the theme.",
      },
      backgroundColorPalette: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "A list of 8 hex color codes (pastel tones) that match the theme.",
      }
    },
    required: ["items", "backgroundColorPalette"],
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate a memory match card set for the theme: "${theme}". Need 8 unique items (emojis preferrred) and 8 matching pastel hex colors.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    if (response.text) {
      const data = JSON.parse(response.text) as ThemeResponse;
      // Ensure we have enough items
      if (data.items.length < 8) return FALLBACK_THEME;
      return data;
    }
    return FALLBACK_THEME;
  } catch (error) {
    console.error("Gemini generation failed", error);
    return FALLBACK_THEME;
  }
};
