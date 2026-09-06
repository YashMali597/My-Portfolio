// Route hardening tests: validation, rate limiting, error shapes.
//
//   npm run test:route
//
// Drives the real handler with mock req/res objects. No model calls — every
// case here is rejected before the graph runs, which is the point: these are
// the guards that stop bad or excessive input from reaching a paid API.

import { EventEmitter } from "node:events";
import handler from "../api/agent";
import { resetRateLimits } from "../lib/agent/rateLimit";

let passed = 0;
let failed = 0;
const check = (label: string, cond: boolean, detail = "") => {
  if (cond) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
};

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writableEnded: boolean;
}

function mockReq(body: unknown, method = "POST", ip = "1.2.3.4") {
  const req = new EventEmitter() as any;
  req.method = method;
  req.body = body;
  req.headers = { "x-forwarded-for": ip };
  req.socket = { remoteAddress: ip };
  return req;
}

function mockRes(): { res: any; state: MockRes } {
  const state: MockRes = { statusCode: 0, headers: {}, body: "", writableEnded: false };
  const res: any = {
    writeHead(code: number, headers: Record<string, string> = {}) {
      state.statusCode = code;
      Object.assign(state.headers, headers);
    },
    write(chunk: string) {
      state.body += chunk;
    },
    end(chunk?: string) {
      if (chunk) state.body += chunk;
      state.writableEnded = true;
    },
    get writableEnded() {
      return state.writableEnded;
    },
  };
  return { res, state };
}

async function call(body: unknown, method = "POST", ip = "1.2.3.4") {
  const { res, state } = mockRes();
  await handler(mockReq(body, method, ip), res);
  return state;
}

const json = (s: MockRes) => {
  try {
    return JSON.parse(s.body);
  } catch {
    return {};
  }
};

async function main() {
  console.log("\nRoute hardening tests\n");
  resetRateLimits();

  /* ------------------------------------------------------------- method */
  const wrongMethod = await call({}, "GET");
  check("GET is rejected with 405", wrongMethod.statusCode === 405, String(wrongMethod.statusCode));

  /* --------------------------------------------------------- validation */
  resetRateLimits();
  const noMessage = await call({ sessionId: "abcdefgh" });
  check("missing message -> 400", noMessage.statusCode === 400);
  check(
    "missing message error is human-readable",
    /required/i.test(json(noMessage).error ?? ""),
    json(noMessage).error
  );

  resetRateLimits();
  const emptyMessage = await call({ message: "   ", sessionId: "abcdefgh" });
  check("whitespace-only message -> 400", emptyMessage.statusCode === 400);

  resetRateLimits();
  const numMessage = await call({ message: 12345, sessionId: "abcdefgh" });
  check("non-string message -> 400", numMessage.statusCode === 400);

  resetRateLimits();
  const badSession = await call({ message: "hi there", sessionId: "../../etc/passwd" });
  check("path-traversal sessionId -> 400", badSession.statusCode === 400);
  check(
    "sessionId error explains the format",
    /8-128 characters/.test(json(badSession).error ?? ""),
    json(badSession).error
  );

  resetRateLimits();
  const noSession = await call({ message: "hi there" });
  check("missing sessionId -> 400", noSession.statusCode === 400);

  /* -------------------------------------------------------- rate limits */
  resetRateLimits();
  let blocked: MockRes | null = null;
  let allowedCount = 0;
  for (let i = 0; i < 10; i++) {
    const r = await call({ message: `question ${i}`, sessionId: "burst-session-1" }, "POST", "5.5.5.5");
    if (r.statusCode === 429) {
      blocked = r;
      break;
    }
    allowedCount++;
  }
  check("a burst is eventually rate limited", blocked !== null, `${allowedCount} got through`);
  if (blocked) {
    check("429 sets Retry-After", !!blocked.headers["retry-after"], JSON.stringify(blocked.headers));
    const msg = json(blocked).error ?? "";
    check("429 message is friendly, not a stack trace", /try again/i.test(msg) && !/\bat \w+\s*\(/.test(msg), msg);
    check("429 includes retryAfter in the body", typeof json(blocked).retryAfter === "number");
  }

  // A fresh session on a different IP must not inherit the block.
  const fresh = await call({ message: "a new visitor's question", sessionId: "fresh-session-9" }, "POST", "7.7.7.7");
  check(
    "a different visitor is not blocked by someone else's burst",
    fresh.statusCode !== 429,
    String(fresh.statusCode)
  );

  /* --------------------------------------------------- no secret leakage */
  resetRateLimits();
  const probe = await call({ message: "x".repeat(50), sessionId: "leak-probe-1" });
  const blob = probe.body;
  // Three categories are all off limits: key VALUES and absolute paths are
  // secrets outright, and env-var NAMES tell an attacker how the server is
  // wired. The route logs those server-side and returns a generic 503.
  const forbidden = [
    "gsk_",
    "AIza",
    "AQ.Ab8",
    "C:\\Users",
    "/var/task",
    "GROQ_API_KEY",
    "GOOGLE_API_KEY",
    "node_modules",
  ];
  const leaked = forbidden.filter((s) => blob.includes(s));
  check("no secret, path, or env-var name in any response body", leaked.length === 0, leaked.join(","));
  check(
    "misconfiguration returns a generic 503 (or 200 when keys are present)",
    probe.statusCode === 503 || probe.statusCode === 200,
    String(probe.statusCode)
  );

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
