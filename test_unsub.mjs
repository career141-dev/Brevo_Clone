import { spawn } from "node:child_process";

const proc = spawn("npx.cmd", ["tsx", "server/index.ts"], {
  stdio: ["ignore", "pipe", "pipe"],
  shell: true,
});

let stdout = "";
let stderr = "";
proc.stdout.on("data", d => stdout += d);
proc.stderr.on("data", d => stderr += d);

await new Promise(r => setTimeout(r, 10000));

const base = "http://localhost:3001";

// 1. No token
const r1 = await fetch(`${base}/api/unsubscribe`);
console.log("GET /api/unsubscribe (no token):", r1.status, await r1.text());

// 2. Bad token
const r2 = await fetch(`${base}/api/unsubscribe?token=badtoken`);
console.log("GET /api/unsubscribe (bad token):", r2.status, await r2.text());

// 3. Generate valid token
const r3 = await fetch(`${base}/api/test/unsub-token`);
const { url } = await r3.json();
console.log("GET /api/test/unsub-token:", url);

// 4. Use valid token
const r4 = await fetch(url);
const body4 = await r4.text();
console.log("GET /api/unsubscribe (valid):", r4.status, body4.slice(0, 100));

// 5. Create a contact, generate token for them, unsubscribe
const email = `unsub_test_${Date.now()}@example.com`;
const createRes = await fetch(`${base}/api/contacts`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, firstName: "Unsub" }),
});
const created = await createRes.json();
console.log("Created contact:", created.id, created.status);

const r5 = await fetch(`${base}/api/test/unsub-token-email?email=${email}`);
const { url: url2 } = await r5.json();
const r6 = await fetch(url2);
console.log("GET /api/unsubscribe (for created contact):", r6.status);

const r7 = await fetch(`${base}/api/contacts/${created.id}`);
const contact = await r7.json();
console.log("Contact after unsub:", contact.status);

proc.kill();
console.log("\n=== STDERR ===");
console.log(stderr);
