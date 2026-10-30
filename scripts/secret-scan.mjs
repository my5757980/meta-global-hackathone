/**
 * npm run lint:secrets — fail when a file git would commit holds something that looks like a secret:
 * API keys, tokens, private keys, or the exact value of a *_KEY / *_TOKEN / *_SECRET / *_PASSWORD in your
 * local .env. Prints the file and line only, never the secret itself.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const PATTERNS = [
  ["OpenAI-style API key", /\bsk-[A-Za-z0-9_-]{20,}/],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Neon API key", /\bnapi_[a-z0-9]{30,}/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

// exact secret values from the local .env, so a pasted key is caught whatever its shape
const envSecrets = existsSync(".env")
  ? readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)\s*=\s*"?([^"\s#]{12,})"?/))
      .filter(Boolean)
      .map((m) => m[2])
  : [];

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|zip|pdf|wav|mp3|ogg|m4a)$/i.test(f));

let found = 0;
for (const f of files) {
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue; // deleted or unreadable
  }
  text.split(/\r?\n/).forEach((line, i) => {
    for (const [name, re] of PATTERNS) {
      if (re.test(line)) {
        console.log(`${f}:${i + 1}: looks like a ${name}`);
        found++;
      }
    }
    if (envSecrets.some((v) => line.includes(v))) {
      console.log(`${f}:${i + 1}: contains a secret value from your .env`);
      found++;
    }
  });
}

if (found) {
  console.error(`\n${found} possible secret(s) — remove them before committing.`);
  process.exit(1);
}
console.log(`No secrets found in ${files.length} files (${envSecrets.length} .env secret value(s) checked).`);
