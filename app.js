/* ===== SUPABASE AUTH ===== */
const SUPABASE_URL = 'https://qyiojnhaqgrmfsnyewcn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5aW9qbmhhcWdybWZzbnlld2NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE2ODk5MzgsImV4cCI6MjA1NzI2NTkzOH0.yfyMFMBe3co-vXynryBVbaBY6YqEU';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  }
});

async function signInWithGoogle() {
  await _supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { 
      redirectTo: 'https://hireai-a.vercel.app',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      }
    }
  });
}

async function signOut() {
  await _supabase.auth.signOut();
  location.reload();
}

function updateUI(user) {
  const appWrapper = document.getElementById('appWrapper');
  const gateScreen = document.getElementById('gateScreen');
  const userInfo = document.getElementById('userInfo');
  const logoutBtn = document.getElementById('logoutBtn');

  if (user) {
    gateScreen.style.display = 'none';
    appWrapper.style.display = 'flex';
    appWrapper.style.flexDirection = 'column';
    userInfo.textContent = user.email;
    const newBtn = logoutBtn.cloneNode(true);
    logoutBtn.parentNode.replaceChild(newBtn, logoutBtn);
    newBtn.addEventListener('click', signOut);
  } else {
    gateScreen.style.display = '';
    appWrapper.style.display = 'none';
  }
}

_supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth event:', event, session?.user?.email);
  updateUI(session?.user ?? null);
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginBtn2').addEventListener('click', signInWithGoogle);
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) loginBtn.addEventListener('click', signInWithGoogle);
});

/* ===== APP LOGIC ===== */
const $ = (sel) => document.querySelector(sel);

let lastResults = [];

function setStatus(text, type = '') {
  const chip = $('#statusChip');
  chip.textContent = text;
  chip.style.color = type === 'error' ? '#ff4d6d' : type === 'success' ? '#00e5a0' : '';
  chip.style.borderColor = type === 'error' ? 'rgba(255,77,109,0.3)' : type === 'success' ? 'rgba(0,229,160,0.3)' : '';
}

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
  const exportBtn = $('#exportBtn');
  const resultsEl = $('#results');
  const emptyState = $('#emptyState');

  if (exportBtn) exportBtn.disabled = !lastResults.length;

  if (!lastResults.length) {
    if (resultsEl) resultsEl.hidden = true;
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (resultsEl) {
    resultsEl.hidden = false;
    resultsEl.innerHTML = lastResults.map((r, i) => `
      <div class="card">
        <div class="row">
          <div class="rank">#${i+1}</div>
          <div class="left">
            <div class="filename">${escapeHtml(r.filename || "CV")}</div>
            <div class="subline">
              <span class="badge badgeStrong">${escapeHtml(r.recommendation)}</span>
            </div>
          </div>
          <div class="score ${scoreClass(r.matchScore)}">${r.matchScore}</div>
          <svg class="chevron" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
        </div>
        <div class="details">
          <div class="grid2">
            <div class="box">
              <div class="boxTitle">Strengths</div>
              <ol class="list">${(r.strengths||[]).map(s=>`<li>${escapeHtml(s)}</li>`).join("")}</ol>
            </div>
            <div class="box">
              <div class="boxTitle">Weaknesses</div>
              <ol class="list">${(r.weaknesses||[]).map(s=>`<li>${escapeHtml(s)}</li>`).join("")}</ol>
            </div>
          </div>
        </div>
      </div>
    `).join("");

    resultsEl.querySelectorAll(".row").forEach(row => {
      row.addEventListener("click", () => row.closest(".card").classList.toggle("open"));
    });
  }
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
  const jobDescription = $('#jobDescription')?.value.trim();
  const cvFiles = $('#cvFiles');
  const files = Array.from(cvFiles?.files || []);

  if (!jobDescription || jobDescription.length < 30) { setStatus("Job description too short", "error"); return; }
  if (!files.length) { setStatus("Select at least one CV", "error"); return; }

  const analyzeBtn = $('#analyzeBtn');
  if (analyzeBtn) analyzeBtn.disabled = true;
  setStatus("Extracting CVs...");

  try {
    const cvs = [];
    for (let i = 0; i < files.length; i++) {
      setStatus(`Extracting ${i+1}/${files.length}...`);
      cvs.push(await extractCvText(files[i]));
    }
    setStatus("Analyzing with AI...");
    const resp = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobDescription, cvs })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "Request failed");
    renderResults(data.results || []);
    setStatus(`Done — ${data.results?.length || 0} candidates ranked`, "success");
  } catch (e) {
    setStatus(e.message || "Something went wrong", "error");
  } finally {
    if (analyzeBtn) analyzeBtn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const cvFiles = $('#cvFiles');
  const uploadArea = $('#uploadArea');
  const analyzeBtn = $('#analyzeBtn');
  const exportBtn = $('#exportBtn');

  if (cvFiles) {
    cvFiles.addEventListener("change", () => {
      const count = cvFiles.files?.length || 0;
      const chip = $('#fileCountChip');
      if (chip) {
        chip.textContent = `${count} file${count === 1 ? "" : "s"} selected`;
        chip.classList.toggle('visible', count > 0);
      }
    });
  }

  if (uploadArea) {
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.style.borderColor = 'var(--accent)'; });
    uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = ''; });
    uploadArea.addEventListener('drop', e => {
      e.preventDefault();
      uploadArea.style.borderColor = '';
      if (cvFiles && e.dataTransfer.files.length) {
        cvFiles.files = e.dataTransfer.files;
        cvFiles.dispatchEvent(new Event('change'));
      }
    });
    uploadArea.addEventListener('click', () => cvFiles?.click());
  }

  if (analyzeBtn) analyzeBtn.addEventListener("click", analyze);

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      if (!lastResults.length) return;
      const header = "Rank,Filename,Score,Recommendation,Strength1,Strength2,Strength3,Weakness1,Weakness2,Weakness3";
      const rows = lastResults.map((r,i) => [i+1, r.filename, r.matchScore, r.recommendation, ...(r.strengths||[]), ...(r.weaknesses||[])].join(","));
      const blob = new Blob([[header,...rows].join("\n")], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "hireai-results.csv";
      a.click();
    });
  }

  renderResults([]);
  setStatus("Ready");
});
