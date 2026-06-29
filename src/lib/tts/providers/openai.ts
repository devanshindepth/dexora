import { TTSProvider } from "../types";

export class OpenAITTSProvider implements TTSProvider {
  async generateAudioStream(text: string): Promise<ReadableStream<Uint8Array>> {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set.");
    }

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "onyx",
        input: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI TTS Error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error("No response body from OpenAI");
    }

    return response.body;
  }
}
