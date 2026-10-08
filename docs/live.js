// Live ratings strip. Opens one Envio HyperIndex subscription and shows the
// newest ratings as they are indexed. The verdict next to each rating comes
// from the published snapshot (api/agents), so an agent newer than the
// snapshot says so instead of guessing.
(function () {
  const box = document.getElementById("live-feed");
  const status = document.getElementById("live-status");
  if (!box || typeof GRAPHQL_ENDPOINT === "undefined") return;

  const WS_URL = GRAPHQL_ENDPOINT.replace(/^http/, "ws");
  const QUERY =
    "subscription{Feedback(limit:8,order_by:{timestamp:desc},where:{revoked:{_eq:false}})" +
    "{id timestamp agent{id} reviewer{id}}}";
  const verdicts = new Map();
  let retry = 0;

  function setStatus(text, on) {
    status.textContent = text;
    status.classList.toggle("live-on", !!on);
  }

  async function verdictFor(agentId) {
    if (verdicts.has(agentId)) return verdicts.get(agentId);
    let v = null;
    try {
      const res = await fetch("api/agents/" + agentId + ".json");
      if (res.ok) {
        const a = await res.json();
        v = { label: a.verdict, tone: a.tone };
      }
    } catch (e) { /* offline snapshot, fall through */ }
    verdicts.set(agentId, v);
    return v;
  }

  function ago(ts) {
    const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
    if (s < 90) return s + "s ago";
    if (s < 5400) return Math.round(s / 60) + " min ago";
    if (s < 129600) return Math.round(s / 3600) + " h ago";
    return Math.round(s / 86400) + " d ago";
  }

  async function render(rows) {
    // Collapse repeat ratings from the same wallet on the same agent into one row.
    const seen = new Map();
    for (const r of rows) {
      const k = r.agent.id + r.reviewer.id;
      if (seen.has(k)) seen.get(k).count++;
      else seen.set(k, Object.assign({}, r, { count: 1 }));
    }
    const items = await Promise.all([...seen.values()].map(async (r) => ({ r, v: await verdictFor(r.agent.id) })));
    box.replaceChildren(
      ...items.map(({ r, v }) => {
        const row = document.createElement("div");
        row.className = "live-row";
        const agent = document.createElement("span");
        agent.className = "mono live-agent";
        agent.textContent = "Agent " + r.agent.id;
        const who = document.createElement("span");
        who.className = "mono live-who";
        who.textContent = "rated by " + r.reviewer.id.slice(0, 6) + "..." + r.reviewer.id.slice(-4) +
          (r.count > 1 ? " (" + r.count + " ratings)" : "");
        const when = document.createElement("span");
        when.className = "live-when";
        when.textContent = ago(r.timestamp);
        const badge = document.createElement("span");
        if (v) {
          badge.className = "badge badge-" + v.tone + " mono";
          badge.textContent = v.label;
        } else {
          badge.className = "badge badge-mut mono";
          badge.textContent = "NEW SINCE SNAPSHOT";
        }
        const link = document.createElement("a");
        link.href = "lookup.html";
        link.textContent = "check live";
        row.append(agent, who, when, badge, link);
        return row;
      })
    );
  }

  function connect() {
    setStatus("connecting", false);
    const ws = new WebSocket(WS_URL, "graphql-transport-ws");
    ws.onopen = () => ws.send(JSON.stringify({ type: "connection_init" }));
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.type === "connection_ack") {
        retry = 0;
        ws.send(JSON.stringify({ id: "1", type: "subscribe", payload: { query: QUERY } }));
      } else if (d.type === "next" && d.payload && d.payload.data) {
        setStatus("live", true);
        render(d.payload.data.Feedback);
      } else if (d.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      }
    };
    ws.onclose = () => {
      setStatus("reconnecting", false);
      setTimeout(connect, Math.min(30000, 2000 * 2 ** retry++));
    };
  }

  connect();
})();
