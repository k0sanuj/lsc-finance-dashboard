import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

const cwd = process.cwd();
const env = {
  ...loadEnvFile(path.join(cwd, ".env.local")),
  ...loadEnvFile(path.join(cwd, "apps", "web", ".env.local")),
};
const model = env.GEMINI_MODEL || "gemini-2.5-flash";

if (!env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is missing from .env.local or apps/web/.env.local");
}

async function requestGemini() {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY.trim()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Reply with OK" }] }]
      })
    }
  );
}

let response;
let lastError;

for (let attempt = 0; attempt < 3; attempt += 1) {
  try {
    response = await requestGemini();
    break;
  } catch (error) {
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 300 * Math.pow(3, attempt)));
  }
}

if (!response) {
  throw lastError;
}

const text = await response.text();
console.log(
  JSON.stringify(
    {
      status: response.status,
      body: text.slice(0, 500)
    },
    null,
    2
  )
);
