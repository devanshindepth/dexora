import { TTSProvider } from "./types";
import { OpenAITTSProvider } from "./providers/openai";
import { GeminiTTSProvider } from "./providers/gemini";

export function getTTSProvider(): TTSProvider {
  const providerName = process.env.TTS_PROVIDER || "gemini";

  switch (providerName.toLowerCase()) {
    case "openai":
      return new OpenAITTSProvider();
    case "gemini":
      return new GeminiTTSProvider();
    // Easily add more providers here (e.g., case "elevenlabs": return new ElevenLabsProvider();)
    default:
      console.warn(`Unknown TTS_PROVIDER '${providerName}', falling back to 'gemini'`);
      return new GeminiTTSProvider();
  }
}
