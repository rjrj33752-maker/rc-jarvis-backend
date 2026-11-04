
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 8080);
const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = "gemini-3.8-flash";

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  res.setHeader("Content-Type", "application/json");

  if (req.url === "/api/jarvis/health") {
    res.writeHead(200);
    return res.end(JSON.stringify({
      status: "online",
      assistant: "RC Jarvis"
    }));
  }

  if (req.url === "/api/jarvis/ask" && req.method === "POST") {
    try {
      if (!API_KEY) {
        throw new Error("Gemini API key is missing");
      }

      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (body.length > 100000) {
          res.writeHead(413);
          return res.end(JSON.stringify({
            error: "Request too large"
          }));
        }
      }

      const data = JSON.parse(body);
      const question = String(data.question || "").trim();

      if (!question) {
        res.writeHead(400);
        return res.end(JSON.stringify({
          error: "Question is required"
        }));
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: "You are RC Jarvis, a helpful personal AI voice assistant. Reply naturally in Hindi when the user speaks Hindi. Keep answers clear and concise."
              }]
            },
            contents: [{
              role: "user",
              parts: [{ text: question }]
            }]
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.error("Gemini error:", result);
        res.writeHead(502);
        return res.end(JSON.stringify({
          error: "AI service error"
        }));
      }

      const answer =
        result.candidates?.[0]?.content?.parts
          ?.map((part: any) => part.text || "")
          .join("") || "मुझे जवाब नहीं मिला।";

      res.writeHead(200);
      return res.end(JSON.stringify({
        answer: answer
      }));

    } catch (error) {
      console.error(error);
      res.writeHead(500);
      return res.end(JSON.stringify({
        error: "Server error"
      }));
    }
  }

  res.writeHead(404);
  res.end(JSON.stringify({
    error: "Route not found"
  }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`RC Jarvis running on port ${PORT}`);
});
