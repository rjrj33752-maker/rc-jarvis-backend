
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 8080);
const API_KEY = process.env.GEMINI_API_KEY || "";

const MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash"
];

const SYSTEM_PROMPT = `
You are RC Jarvis, a helpful personal AI voice assistant.
Reply naturally in Hindi unless the user asks for another language.
Be friendly, intelligent, accurate and concise.
Your name is RC Jarvis.
`;

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
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (
    req.url === "/api/jarvis/health" &&
    req.method === "GET"
  ) {
    res.writeHead(200);
    return res.end(JSON.stringify({
      status: "online",
      assistant: "RC Jarvis"
    }));
  }

  if (
    req.url === "/api/jarvis/ask" &&
    req.method === "POST"
  ) {
    try {
      if (!API_KEY) {
        res.writeHead(500);
        return res.end(JSON.stringify({
          error: "Gemini API key is missing"
        }));
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

      let lastError = "";

      for (const model of MODELS) {
        try {
          console.log("Trying Gemini model:", model);

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                systemInstruction: {
                  parts: [{
                    text: SYSTEM_PROMPT
                  }]
                },
                contents: [{
                  role: "user",
                  parts: [{
                    text: question
                  }]
                }]
              })
            }
          );

          const result = await response.json();

          if (!response.ok) {
            lastError = JSON.stringify(result);

            console.error(
              "Gemini error:",
              model,
              response.status,
              result
            );

            // Try another model for temporary errors
            if (
              response.status === 429 ||
              response.status === 500 ||
              response.status === 502 ||
              response.status === 503 ||
              response.status === 504
            ) {
              continue;
            }

            res.writeHead(502);
            return res.end(JSON.stringify({
              error: "Gemini API request failed",
              details: lastError
            }));
          }

          const answer =
            result.candidates?.[0]?.content?.parts
              ?.map((part: any) => part.text || "")
              .join("")
              .trim() || "";

          if (!answer) {
            lastError = "Gemini returned an empty answer";
            console.error(lastError, result);
            continue;
          }

          console.log("Reply generated using:", model);

          res.writeHead(200);
          return res.end(JSON.stringify({
            answer: answer
          }));

        } catch (error) {
          lastError = String(error);
          console.error("Model request failed:", model, error);
        }
      }

      console.error("All Gemini models failed:", lastError);

      res.writeHead(503);
      return res.end(JSON.stringify({
        error: "All Gemini models are temporarily unavailable",
        details: lastError
      }));

    } catch (error) {
      console.error("Server error:", error);

      res.writeHead(500);
      return res.end(JSON.stringify({
        error: "Server error",
        details: String(error)
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
