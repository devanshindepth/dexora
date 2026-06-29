import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import "dotenv/config";

async function main() {
  try {
    const { text } = await generateText({
      model: groq("llama-3.1-8b-instant"),
      system: "You are a helpful assistant.",
      prompt: "Hello, testing 123. Please respond with a short message.",
    });
    console.log("Response text:", JSON.stringify(text));
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
