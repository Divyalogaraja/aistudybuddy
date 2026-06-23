import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini Client Lazily to prevent crash on startup if API key is missing
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please set it in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// REST route for topic generation
app.post("/api/study", async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      res.status(400).json({ error: "Please enter a valid study topic." });
      return;
    }

    const ai = getGeminiClient();
    
    const prompt = `Create an easy-to-understand study guide and interactive quiz about the topic: "${topic.trim()}".
    
    1. EXPLAIN the topic in a way that represents simple language, using relatable real-world analogies, bullet points, and neat paragraphs formatted in clean Markdown.
    2. GENERATE exactly 5 diverse and effective multiple-choice questions to test comprehension, with 4 distinct options each.
    3. PROVIDE an encouraging and highly motivational quote about study/learning, tailored to either this topic or general academic perseverance.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are AI Study Buddy, an exceptionally encouraging, brilliant private tutor who explains hard concepts in conversational, delightfully plain, simple language using metaphors. You design highly visual interactive quizzes and love motivational cues.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topic: { 
              type: Type.STRING,
              description: "The standardized name of the topic studied."
            },
            explanation: { 
              type: Type.STRING, 
              description: "Engaging and comprehensive simple explanation of the topic. Use list bullet points, analogies, and rich Markdown formatting."
            },
            quiz: {
              type: Type.ARRAY,
              description: "Exactly 5 multiple choice questions.",
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING, description: "The quiz question text." },
                  options: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING },
                    description: "An array of exactly 4 unique choices/options."
                  },
                  correctAnswer: { 
                    type: Type.INTEGER, 
                    description: "The zero-based index of the correct answer (0, 1, 2, or 3)." 
                  },
                  explanation: { 
                    type: Type.STRING, 
                    description: "A friendly explanation of why this answer is correct." 
                  }
                },
                required: ["question", "options", "correctAnswer", "explanation"]
              }
            },
            quote: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING, description: "A beautiful motivational quote about learning or studying." },
                author: { type: Type.STRING, description: "The author of the motivational quote." }
              },
              required: ["text", "author"]
            }
          },
          required: ["topic", "explanation", "quiz", "quote"]
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) {
      throw new Error("No response text received from the Gemini model.");
    }

    const data = JSON.parse(jsonText.trim());
    res.json(data);
  } catch (error: any) {
    console.error("Error generating study contents:", error);
    res.status(500).json({ 
      error: error.message || "Failed to generate study materials. Please check your API key and try again." 
    });
  }
});

// Boot the servers
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
