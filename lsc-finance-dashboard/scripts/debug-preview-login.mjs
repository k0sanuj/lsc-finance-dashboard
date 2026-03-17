import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function loadEnvFile(filePath) {
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
const deployment = process.argv[2];

if (!deployment) {
  throw new Error("Usage: node scripts/debug-preview-login.mjs <deployment-url>");
}

const envFile = loadEnvFile(path.join(cwd, ".env.local"));
const vercel = path.join(cwd, "node_modules", ".bin", "vercel");
const cookie = path.join(os.tmpdir(), "lsc-preview-cookies.txt");

try {
  fs.unlinkSync(cookie);
} catch (error) {
  if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
    throw error;
  }
}

const loginHtml = execFileSync(
  vercel,
  ["curl", "/login", "--deployment", deployment, "--", "--silent", "--show-error", "-c", cookie, "-b", cookie],
  { cwd, encoding: "utf8" }
);

const actionMatch = loginHtml.match(/name=\"(\$ACTION_ID_[^\"]+)\"/);
if (!actionMatch) {
  throw new Error("Unable to find the login action id.");
}

const actionId = actionMatch[1];

const loginResponse = execFileSync(
  vercel,
  [
    "curl",
    "/login",
    "--deployment",
    deployment,
    "--",
    "--silent",
    "--show-error",
    "-L",
    "-c",
    cookie,
    "-b",
    cookie,
    "-X",
    "POST",
    "-F",
    `${actionId}=`,
    "-F",
    `email=${envFile.AUTH_BOOTSTRAP_EMAIL}`,
    "-F",
    `password=${envFile.AUTH_BOOTSTRAP_PASSWORD}`
  ],
  { cwd, encoding: "utf8" }
);

const rootResponse = execFileSync(
  vercel,
  ["curl", "/", "--deployment", deployment, "--", "--silent", "--show-error", "-L", "-c", cookie, "-b", cookie],
  { cwd, encoding: "utf8" }
);

console.log(
  JSON.stringify(
    {
      actionId,
      loginPreview: loginResponse.slice(0, 400),
      rootPreview: rootResponse.slice(0, 1200)
    },
    null,
    2
  )
);
