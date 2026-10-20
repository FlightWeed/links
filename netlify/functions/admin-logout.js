const { json, requireSameOrigin } = require("./_shared");
exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" }, { allow: "POST" });
  if (!requireSameOrigin(event)) return json(403, { error: "Origin rejected" });
  return json(200, { ok: true }, {
    "set-cookie": "rotator_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"
  });
};
