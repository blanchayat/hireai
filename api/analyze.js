async function callClaude({ jobDescription, cvText }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw Object.assign(new Error("Missing ANTHROPIC_API_KEY"), { statusCode: 500 });

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 450,
      messages: [{
        role: "user",
        content: `You are a recruiter. Analyze this CV against the job description. Return ONLY valid JSON: {"matchScore":0-100,"strengths":["s1","s2","s3"],"weaknesses":["w1","w2","w3"],"recommendation":"Yes"|"Maybe"|"No"}\n\nJob:\n${jobDescription.slice(0,8000)}\n\nCV:\n${cvText.slice(0,12000)}`
      }]
    })
  });

  const data = await resp.json();
  const text = data?.content?.map(c => c.text || "").join("") || "";
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return {
    matchScore: Math.max(0, Math.min(100, Math.round(json.matchScore || 0))),
    strengths: (json.strengths || []).slice(0, 3),
    weaknesses: (json.weaknesses || []).slice(0, 3),
    recommendation: ["Yes","Maybe","No"].includes(json.recommendation) ? json.recommendation : "Maybe"
  };
}

module.exports = async (req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.method !== "POST") { res.statusCode = 405; res.end(JSON.stringify({ error: "Method Not Allowed" })); return; }
  try {
    const { jobDescription, cvs } = req.body || {};
    if (!jobDescription || jobDescription.length < 30) { res.statusCode = 400; res.end(JSON.stringify({ error: "Job description too short" })); return; }
    if (!Array.isArray(cvs) || !cvs.length) { res.statusCode = 400; res.end(JSON.stringify({ error: "No CVs provided" })); return; }
    const results = await Promise.all(cvs.map(async cv => ({ filename: cv.filename, ...await callClaude({ jobDescription, cvText: cv.text }) })));
    results.sort((a, b) => b.matchScore - a.matchScore);
    res.statusCode = 200;
    res.end(JSON.stringify({ results }));
  } catch (e) {
    res.statusCode = e?.statusCode || 500;
    res.end(JSON.stringify({ error: e.message }));
  }
};