import { getTTSProvider } from "@/lib/tts/factory";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text) {
      return new Response("Missing text", { status: 400 });
    }

    const provider = getTTSProvider();
    const stream = await provider.generateAudioStream(text);

    return new Response(stream, {
      headers: {
        "Content-Type": "audio/wav",
        // Additional headers could be added here if needed
      },
    });
  } catch (error: any) {
    console.error("TTS Error:", error);
    return new Response(error.message || "Internal Server Error", { status: 500 });
  }
}
