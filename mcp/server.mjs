#!/usr/bin/env node
// Headwater as a tool an agent can call before it trusts another agent.
//
// Monad's own ERC-8004 documentation tells agents to check reputation before a
// high-value transaction. The registry answers "what is the score". It cannot
// answer "is that score worth anything", and on Monad that second question is
// the one that matters: of 10,254 registered agents only 84 have ever been
// rated, and the single most-rated agent had every one of its 7,665 raters
// funded by its own owner.
//
// This speaks MCP over stdio with no dependencies. The protocol here is a few
// JSON-RPC methods over newline-delimited JSON, and pulling in an SDK to send
// three message shapes would add a dependency tree to a tool whose whole point
// is that a reviewer can read it.
//
// Run it directly, or register it with any MCP client:
//   { "mcpServers": { "headwater": { "command": "node",
//     "args": ["/absolute/path/to/headwater/mcp/server.mjs"] } } }
import { createInterface } from "node:readline";
import { checkAgent, ENDPOINT } from "../tools/lib.mjs";

const PROTOCOL_VERSION = "2024-11-05";

const TOOLS = [
  {
    name: "check_agent_reputation",
    description:
      "Given an ERC-8004 agent id on Monad, report what that agent's reputation " +
      "score is actually made of: whether its raters were funded by the agent's " +
      "own owner (directly or through one intermediary wallet), whether the owner " +
      "rated itself, whether the raters are people or application contracts, and " +
      "whether there is any rating at all. Returns a verdict of NO EVIDENCE, THIN, " +
      "SELF REVIEWED, APP GENERATED, OWNER FUNDED or NO LINK FOUND, with the " +
      "evidence behind it. This describes where money came from. It is not a " +
      "judgement of anyone's intent, and a funded campaign can be legitimate.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "The ERC-8004 agent id, for example \"153\".",
        },
      },
      required: ["agentId"],
    },
  },
];

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function result(id, payload) {
  send({ jsonrpc: "2.0", id, result: payload });
}

function failure(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params } = msg;

  // Notifications carry no id and must never be answered. Replying to one is
  // a protocol error that some clients treat as fatal.
  if (id === undefined || id === null) return;

  if (method === "initialize") {
    return result(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "headwater", version: "1.0.0" },
    });
  }

  if (method === "tools/list") return result(id, { tools: TOOLS });

  if (method === "ping") return result(id, {});

  if (method === "tools/call") {
    const name = params?.name;
    if (name !== "check_agent_reputation") {
      return failure(id, -32602, `Unknown tool: ${name}`);
    }
    const agentId = String(params?.arguments?.agentId ?? "").trim();
    if (!/^\d+$/.test(agentId)) {
      return failure(id, -32602, "agentId must be a decimal agent id, for example \"153\".");
    }
    try {
      const report = await checkAgent(agentId);
      if (report === null) {
        return result(id, {
          content: [
            {
              type: "text",
              text:
                `No agent with id ${agentId} is registered in the ERC-8004 identity ` +
                `registry on Monad. This is not the same as an agent with no reputation.`,
            },
          ],
        });
      }
      // The text block carries the headline so a model reading the response
      // does not have to parse JSON to act on it, and the structured block
      // carries the evidence for anything that wants to check the reasoning.
      return result(id, {
        content: [
          {
            type: "text",
            text: `${report.verdict}: ${report.summary}${
              report.findings.length ? `\n\n- ${report.findings.join("\n- ")}` : ""
            }`,
          },
        ],
        structuredContent: report,
      });
    } catch (err) {
      // Reported as a tool failure rather than a protocol error, so the caller
      // sees that the check did not run instead of receiving something that
      // reads like a clean result.
      return result(id, {
        isError: true,
        content: [
          {
            type: "text",
            text:
              `The provenance check for agent ${agentId} did not complete: ${err.message}. ` +
              `Treat this as no answer, not as a clean one. Source: ${ENDPOINT}`,
          },
        ],
      });
    }
  }

  return failure(id, -32601, `Method not found: ${method}`);
}

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return failure(null, -32700, "Parse error");
  }
  try {
    await handle(msg);
  } catch (err) {
    failure(msg?.id ?? null, -32603, err.message);
  }
});
