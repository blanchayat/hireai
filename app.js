const SUPABASE_URL = 'https://qyiojnhaqgrmfsnyewcn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5aW9qbmhhcWdybWZzbnlld2NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE2ODk5MzgsImV4cCI6MjA1NzI2NTkzOH0.yfyMFMBe3co-vXynryBVbaBY6YqEU';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function signInWithGoogle() {
  await _supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
}

async function signOut() {
  await _supabase.auth.signOut();
  location.reload();
}

_supabase.auth.onAuthStateChange((event, session) => {
  const user = session?.user;
  const loginBtn = document.getElementById('loginBtn');
  const loginBtn2 = document.getElementById('loginBtn2');
  const logoutBtn = document.getElementById('logoutBtn');
  const userInfo = document.getElementById('userInfo');
  const appMain = document.getElementById('appMain');
  const gateScreen = document.getElementById('gateScreen');
  if (user) {
    loginBtn.hidden = true;
    logoutBtn.hidden = false;
    userInfo.hidden = false;
    userInfo.textContent = user.email;
    appMain.hidden = false;
    gateScreen.style.display = 'none';
  } else {
    loginBtn.hidden = false;
    logoutBtn.hidden = true;
    userInfo.hidden = true;
    appMain.hidden = true;
    gateScreen.style.display = 'flex';
  }
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginBtn').addEventListener('click', signInWithGoogle);
  document.getElementById('loginBtn2').addEventListener('click', signInWithGoogle);
  document.getElementById('logoutBtn').addEventListener('click', signOut);
});

const $ = (sel) => document.querySelector(sel);

const els = {
  jobDescription: $("#jobDescription"),
  cvFiles: $("#cvFiles"),
  analyzeBtn: $("#analyzeBtn"),
  exportBtn: $("#exportBtn"),
  results: $("#results"),
  emptyState: $("#emptyState"),
  fileCountChip: $("#fileCountChip"),
  statusChip: $("#statusChip")
};

let lastResults = [];

function setStatus(text) { els.statusChip.textContent = text; }

function scoreClass(score) {
  if (score >= 75) return "scoreGreen";
  if (score >= 50) return "scoreYellow";
  return "scoreRed";
}

function escapeHtml(s) {
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function renderResults(results) {
  lastResults = results || [];
  els.exportBtn.disabled = !lastResults.length;
  if (!lastResults.length) { els.results.hidden = true; els.emptyState.hidden = false; return; }
  els.emptyState.hidden = true;
  els.results.hidden = false;
  els.results.innerHTML = lastResults.map((r, i) => `
    <div class="card">
      <div class="row">
        <div class="left">
          <div class="filename">${escapeHtml(r.filename || "CV")}</div>
          <div class="subline">
            <span class="badge badgeStrong">#${i+1}</span>
            <span class="badge">${escapeHtml(r.recommendation)}</span>
          </div>
        </div>
        <div class="score ${scoreClass(r.matchScore)}">${r.matchScore}</div>
      </div>
      <div class="details">
        <div class="grid2">
          <div class="box"><div class="boxTitle">Strengths</div><ol class="list">${(r.strengths||[]).map(s=>`<li>${escapeHtml(s)}</li>`).join("")}</ol></div>
          <div class="box"><div class="boxTitle">Weaknesses</div><ol class="list">${(r.weaknesses||[]).map(s=>`<li>${escapeHtml(s)}</li>`).join("")}</ol></div>
        </div>
      </div>
    </div>
  `).join("");
  els.results.querySelectorAll(".row").forEach(row => {
    row.addEventListener("click", () => row.closest(".card").classList.toggle("open"));
  });
}

async function extractTextFromPdf(file) {
  if (!window.pdfjsLib) return "";
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js";
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(it => it.str).join(" "));
  }
  return pages.join("\n\n");
}

async function extractCvText(file) {
  const name = file.name || "cv";
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    return { filename: name, text: await extractTextFromPdf(file) };
  }
  return { filename: name, text: await file.text() };
}

async function analyze() {
  const jobDescription = els.jobDescription.value.trim();
  const files = Array.from(els.cvFiles.files || []);
  if (jobDescription.length < 30) { setStatus("Job description too short"); return; }
  if (!files.length) { setStatus("Select at least one CV"); return; }

  els.analyzeBtn.disabled = true;
  setStatus("Extracting CVs...");

  try {
    const cvs = [];
    for (let i = 0; i < files.length; i++) {
      setStatus(`Extracting ${i+1}/${files.length}...`);
      cvs.push(await extractCvText(files[i]));
    }
    setStatus("Analyzing...");
    const resp = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobDescription, cvs })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "Request failed");
    renderResults(data.results || []);
    setStatus("Done!");
  } catch (e) {
    setStatus(e.message || "Something went wrong");
  } finally {
    els.analyzeBtn.disabled = false;
  }
}

els.cvFiles.addEventListener("change", () => {
  const count = els.cvFiles.files?.length || 0;
  els.fileCountChip.textContent = `${count} file${count === 1 ? "" : "s"} selected`;
});

els.analyzeBtn.addEventListener("click", analyze);

els.exportBtn.addEventListener("click", () => {
  if (!lastResults.length) return;
  const header = "Rank,Filename,Score,Recommendation,Strength1,Strength2,Strength3,Weakness1,Weakness2,Weakness3";
  const rows = lastResults.map((r,i) => [i+1, r.filename, r.matchScore, r.recommendation, ...(r.strengths||[]), ...(r.weaknesses||[])].join(","));
  const blob = new Blob([[header,...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "hireai-results.csv";
  a.click();
});

renderResults([]);
setStatus("Ready");
