import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import "dotenv/config";

async function main() {
  try {
    console.log("Using API key:", process.env.GROQ_API_KEY ? "Set" : "Not Set");
    const { text } = await generateText({
      model: groq("llama-3.1-8b-instant"),
      messages: [{ role: "user", content: "Hello, testing 123. Please respond with a short message." }],
    });
    console.log("Response text:", JSON.stringify(text));
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
