import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

const WORKER_VERSION = "1.0.0";
const POLL_MS = 3_000;
const HEARTBEAT_MS = 20_000;
const TASK_TIMEOUT_MS = 10 * 60_000;
const MAX_OUTPUT_BYTES = 2_000_000;

function configPath() {
  const flag = process.argv.indexOf("--config");
  if (flag >= 0 && process.argv[flag + 1]) return resolve(process.argv[flag + 1]);
  if (process.env.FON_AI_WORKER_CONFIG) return resolve(process.env.FON_AI_WORKER_CONFIG);
  if (!process.env.LOCALAPPDATA) throw new Error("LOCALAPPDATA est introuvable.");
  return join(process.env.LOCALAPPDATA, "FatesOfNations", "ai-worker", "config.json");
}

const configuration = JSON.parse(readFileSync(configPath(), "utf8"));
const siteUrl = String(configuration.siteUrl ?? "").replace(/\/$/, "");
const token = String(configuration.token ?? "");
const repoPath = resolve(String(configuration.repoPath ?? ""));
if (!siteUrl || !/^fonw_[A-Za-z0-9_-]{40,60}$/.test(token) || !existsSync(join(repoPath, ".git"))) {
  throw new Error("Configuration du relais invalide.");
}

function codexVersion() {
  return execFileSync("codex", ["--version"], { encoding: "utf8", windowsHide: true }).trim().slice(0, 120);
}

function verifyElevatedSandbox() {
  const output = execFileSync("codex", [
    "-c", 'windows.sandbox="elevated"',
    "sandbox",
    "-C", repoPath,
    "cmd.exe", "/d", "/c", "echo FON_CODEX_SANDBOX_OK",
  ], { encoding: "utf8", timeout: 60_000, windowsHide: true });
  if (!output.includes("FON_CODEX_SANDBOX_OK")) throw new Error("Le bac à sable élevé n'est pas disponible.");
  return "FON_CODEX_SANDBOX_OK";
}

async function api(body) {
  const response = await fetch(`${siteUrl}/api/ai/worker`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function safeTrackedPath(value) {
  const path = normalize(value).replaceAll("\\", "/");
  if (!path || path.startsWith("../") || isAbsolute(path)) return false;
  const segments = path.toLowerCase().split("/");
  if (segments.some((segment) => [".git", "node_modules", ".next", ".vercel", ".codex", ".impeccable", "artifacts", "fon-inventaire"].includes(segment))) return false;
  const file = basename(path).toLowerCase();
  if (file.startsWith(".env") || /(^|[._-])(secret|secrets|credential|credentials|auth|token|private[-_]?key)([._-]|$)/i.test(file)) return false;
  if (/\.(pem|pfx|p12|key|keystore)$/i.test(file)) return false;
  return true;
}

function assertInside(root, target) {
  const rel = relative(root, target);
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) throw new Error("Chemin de copie refusé.");
}

function createSnapshot() {
  const base = join(tmpdir(), "fon-ai-worker-");
  const snapshot = mkdtempSync(base);
  const tracked = execFileSync("git", ["-C", repoPath, "ls-files", "-z"], {
    encoding: "utf8", maxBuffer: 20_000_000, windowsHide: true,
  }).split("\0").filter(Boolean);
  for (const relativePath of tracked) {
    if (!safeTrackedPath(relativePath)) continue;
    const source = resolve(repoPath, relativePath);
    const destination = resolve(snapshot, relativePath);
    assertInside(repoPath, source);
    assertInside(snapshot, destination);
    if (!existsSync(source)) continue;
    if (!lstatSync(source).isFile()) continue;
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
  return snapshot;
}

function removeSnapshot(snapshot) {
  const resolved = resolve(snapshot);
  const expectedPrefix = resolve(tmpdir(), "fon-ai-worker-");
  if (!resolved.startsWith(expectedPrefix)) throw new Error("Nettoyage du relais refusé.");
  rmSync(resolved, { recursive: true, force: true });
}

function runCodex(job, snapshot) {
  const schemaPath = join(dirname(snapshot), `${basename(snapshot)}-schema.json`);
  writeFileSync(schemaPath, JSON.stringify(job.outputSchema), { encoding: "utf8", mode: 0o600 });
  const context = [
    job.gameContext ? `DONNÉES VIVANTES AUTORISÉES\n${job.gameContext}` : "",
    job.deploymentContext ? `ÉTAT VERCEL EN LECTURE SEULE, EXPURGÉ\n${JSON.stringify(job.deploymentContext)}` : "",
  ].filter(Boolean).join("\n\n");
  const prompt = `${job.instructions}${context ? `\n\n${context}` : ""}\n\nDEMANDE DE L'ADMINISTRATEUR\n${job.prompt}\n\nInspecte la copie en lecture seule si nécessaire, puis renvoie uniquement l'objet JSON demandé.`;
  const args = [
    "exec", "--ephemeral", "--json", "--output-schema", schemaPath,
    "--sandbox", "read-only", "--ignore-user-config", "--ignore-rules",
    "-C", snapshot, "--skip-git-repo-check", "--model", job.model,
    "-c", 'windows.sandbox="elevated"', "-c", 'approval_policy="never"',
    "-c", 'shell_environment_policy.inherit="none"', "-",
  ];

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("codex", args, { cwd: snapshot, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      rejectPromise(new Error("Délai local dépassé."));
    }, TASK_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output, "utf8") > MAX_OUTPUT_BYTES) child.kill();
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      clearTimeout(timer);
      try { rmSync(schemaPath, { force: true }); } catch {}
      if (code !== 0) return rejectPromise(new Error("Codex local n'a pas terminé la tâche."));
      const messages = output.split(/\r?\n/).filter(Boolean).flatMap((line) => {
        try {
          const event = JSON.parse(line);
          return event.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string"
            ? [event.item.text]
            : [];
        } catch {
          return [];
        }
      });
      const finalMessage = messages.at(-1);
      if (!finalMessage) return rejectPromise(new Error("Résultat structuré absent."));
      resolvePromise(finalMessage);
    });
    child.stdin.end(prompt);
  });
}

async function heartbeat(version, proof) {
  await api({ operation: "heartbeat", sandboxMode: "elevated", sandboxCheck: proof, codexVersion: version, workerVersion: WORKER_VERSION });
}

async function main() {
  const version = codexVersion();
  const proof = verifyElevatedSandbox();
  await heartbeat(version, proof);
  let lastHeartbeat = Date.now();

  while (true) {
    try {
      if (Date.now() - lastHeartbeat >= HEARTBEAT_MS) {
        await heartbeat(version, proof);
        lastHeartbeat = Date.now();
      }
      const claimed = await api({ operation: "claim" });
      if (!claimed.job) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, POLL_MS));
        continue;
      }
      const job = claimed.job;
      let snapshot;
      try {
        await api({ operation: "progress", jobId: job.id, stage: "lecture" });
        snapshot = createSnapshot();
        await api({ operation: "progress", jobId: job.id, stage: "analysis" });
        const result = await runCodex(job, snapshot);
        await api({ operation: "progress", jobId: job.id, stage: "plan" });
        await api({ operation: "result", jobId: job.id, output: result });
      } catch {
        await api({ operation: "failure", jobId: job.id }).catch(() => {});
      } finally {
        if (snapshot) removeSnapshot(snapshot);
      }
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10_000));
    }
  }
}

main().catch(() => process.exit(1));
