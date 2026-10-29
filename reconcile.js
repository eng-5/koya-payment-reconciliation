// Payment reconciliation.
//
// Reads payments.jsonl and works out how much money we actually collected.
// Run:  node reconcile.js

const fs = require("fs");

let totalKobo = 0n;
let count = 0;
let uniqueId = new Map();

const fileContent = fs.readFileSync("payments.jsonl", "utf8");
const lines = fileContent.split(/\r?\n/);

for (const line of lines) {
  if (line.trim().length === 0) continue;

  let event;
  try {
    event = JSON.parse(line);
  }
  catch (err) {
    continue;
  }
  // Defensive check: ensure event is a valid object and has a txn_id
  if (!event || typeof event !== "object" || Array.isArray(event)) continue;
  if (!event.txn_id) continue;

  // Validate timestamp
  const ts = Date.parse(event.ts);
  if (Number.isNaN(ts)) continue;

  // Deduplication: keep only the latest attempt based on timestamp (ts)
  const current = uniqueId.get(event.txn_id);
  if (!current || ts >= current.ts) {
    uniqueId.set(event.txn_id, {
      ts,
      status: event.status,
      amount: event.amount
    })
  }

}

// Robust helper to safely parse amounts into integer kobo (prevents float drift)
function toKobo(value) {
  if (value === null || value === undefined || typeof value === "boolean") return null;

  // Clean string: remove commas and whitespace
  const s = String(value).replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;

  const isNegative = s.startsWith("-");
  const cleanStr = s.replace("-", "");
  const parts = cleanStr.split(".")

  const whole = parts[0] || "0";
  // Pad or slice fractional part to exactly 2 decimal places (kobo/cents)
  const frac = (parts[1] || "") + "00";
  const cents = frac.slice(0, 2);

  const kobo = BigInt(whole) * 100n + BigInt(cents);
  return isNegative ? -kobo : kobo;
}

for (const { status, amount } of uniqueId.values()) {
  //Safe string conversion for status to prevent TypeError on Data types
  const safeStatus = String(status || "").toLowerCase().trim();
  if (safeStatus === "success") {
    const kobo = toKobo(amount)
    if (kobo !== null) {
      totalKobo += kobo;
      count += 1;
    }

  }
}

const expected = parseInt(fs.readFileSync("expected.txt", "utf8").trim(), 10);

if (count !== expected) {
  console.log(`Check failed: counted ${count} successful payments, expected ${expected}.`);
  console.log("Something in the data isn't being handled the way the README describes.");
} else {
  const naira = (totalKobo + 50n) / 100n;
  console.log(`Check passed: ${count} successful payments.`);
  console.log(`Your code: KOYA-${naira}`);
}


