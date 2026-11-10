
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 8080);
const API_KEY = process.env.GEMINI_API_KEY || "";

// Fast model first, reliable fallback after it
const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.8-flash"
];

const SYSTEM_PROMPT = `
You are RC Jarvis, a helpful personal AI voice assistant.

Reply naturally in Hindi unless the user asks for another language.
Keep answers direct, accurate, friendly and concise.
Give quick answers without unnecessary explanations.
For simple questions, answer in 1-3 sentences.
For commands, explain clearly what can and cannot be done.
Never pretend to have performed an action that you did not perform.
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
  res.setHeader("Content-Type", "application/json; charset=UTF-8");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // Health check
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

  // AI request
  if (
    req.url === "/api/jarvis/ask" &&
    req.method === "POST"
  ) {

    if (!API_KEY) {
      res.writeHead(500);
      return res.end(JSON.stringify({
        error: "Gemini API key is missing"
      }));
    }

    try {

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

      let lastError = "No model available";

      for (const model of MODELS) {

        let controller: AbortController | null = null;
        let timeout: ReturnType<typeof setTimeout> | null = null;

        try {

          console.log("Trying Gemini model:", model);

          controller = new AbortController();

          // Maximum 18 seconds per model
          timeout = setTimeout(() => {
            controller?.abort();
          }, 18000);

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
            {
              method: "POST",

              headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
              },

              signal: controller.signal,

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
                }],

                generationConfig: {
                  temperature: 0.6,
                  maxOutputTokens: 512
                }

              })
            }
          );

          const responseText = await response.text();

          let result: any;

          try {
            result = JSON.parse(responseText);
          } catch {
            result = {
              error: responseText.slice(0, 1000)
            };
          }

          if (!response.ok) {

            lastError = JSON.stringify(result);

            console.error(
              "Gemini error:",
              model,
              response.status,
              result
            );

            // Try fallback only for temporary errors
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
            continue;
          }

          console.log("Reply generated using:", model);

          res.writeHead(200);

          return res.end(JSON.stringify({
            answer: answer,
            model: model
          }));

        } catch (error) {

          lastError = String(error);

          console.error(
            "Model request failed:",
            model,
            error
          );

        } finally {

          if (timeout) {
            clearTimeout(timeout);
          }

        }
      }

      console.error(
        "All Gemini models failed:",
        lastError
      );

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
