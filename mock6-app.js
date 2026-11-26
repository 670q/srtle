// ==========================================
// MOCK EXAM 6TH EDITION - MAIN APPLICATION
// ==========================================
let allQuestions = [];
let mock6State = {
  currentView: "loading",    // 'loading', 'dashboard', 'quiz', 'results'
  quiz: {
    chapterId: null,
    chapterName: "",
    questions: [],
    currentIndex: 0,
    answers: {},              // global_id -> selected answer
    checkedAnswers: new Set(),
    sessionStartTime: null,
    mode: "practice"          // 'practice' or 'exam'
  },
  progress: {},               // chapter_id -> { answered: {id: true/false}, correct: 0, wrong: 0 }
  filterChapter: "all"
};

// Chapter definitions
const MOCK6_CHAPTERS = {
  "3.1": { title: "Monthly Questions - Set 1", titleEn: "Set 1", icon: "📅", category: "monthly", questions: 210 },
  "3.2": { title: "Monthly Questions - Set 2", titleEn: "Set 2", icon: "📅", category: "monthly", questions: 210 },
  "3.3": { title: "Monthly Questions - Set 3", titleEn: "Set 3", icon: "📅", category: "monthly", questions: 210 },
  "1.1": { title: "أساسيات الفيزياء الإشعاعية", titleEn: "Essentials of Radiologic Physics", icon: "⚡", category: "modality" },
  "1.2": { title: "التصوير الإشعاعي والمواقع", titleEn: "Positioning in Radiography", icon: "🦴", category: "modality" },
  "1.3": { title: "التصوير المقطعي المحوسب", titleEn: "CT Imaging", icon: "🔬", category: "modality" },
  "1.4": { title: "التصوير بالرنين المغناطيسي", titleEn: "MR Imaging", icon: "🧲", category: "modality" },
  "1.5": { title: "التصوير بالموجات فوق الصوتية", titleEn: "US Imaging", icon: "📡", category: "modality" },
  "1.6": { title: "التصوير بالطب النووي", titleEn: "NM Imaging", icon: "☢️", category: "modality" },
  "2.1": { title: "رعاية المرضى في التصوير الطبي", titleEn: "Patient Care", icon: "🏥", category: "misc" },
  "2.2": { title: "إدارة الجودة والجرعة", titleEn: "Quality & Dose", icon: "📊", category: "misc" },
  "2.3": { title: "الأدوية ومواد التباين", titleEn: "Contrast Media & Meds", icon: "💉", category: "misc" },
  "2.4": { title: "البيولوجيا الإشعاعية والوقاية", titleEn: "Radiobiology & Protection", icon: "🛡️", category: "misc" },
  "2.5": { title: "الإحصاء الحيوي ومنهجية البحث", titleEn: "Biostatistics", icon: "📈", category: "misc" },
  "4.1": { title: "الملحق أ: صور الأشعة في SRTLE", titleEn: "Appendix A: Images in SRTLE", icon: "🖼️", category: "appendix" },
  "4.2": { title: "الملحق ب: المعادلات والحسابات", titleEn: "Appendix B: Equations in SRTLE", icon: "🧮", category: "appendix" },
  "4.3": { title: "الملحق ج: التشريح والأمراض", titleEn: "Appendix C: Anatomy & Pathology", icon: "🫀", category: "appendix" }
};

// ==========================================
// INIT APP
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  setupTheme();
  setupGlobalEvents();
  loadProgressFromStorage();
  await loadQuestionsData();
});

// ==========================================
// THEME CONTROLLER
// ==========================================
function setupTheme() {
  const themeToggle = document.getElementById("theme-toggle");
  const savedScheme = localStorage.getItem("color-scheme") || "light dark";
  setScheme(savedScheme);
  themeToggle.addEventListener("click", () => {
    const currentScheme = document.querySelector('meta[name="color-scheme"]').content;
    const newScheme = currentScheme === "dark" ? "light" : "dark";
    setScheme(newScheme);
  });
}

function setScheme(scheme) {
  const metaColorScheme = document.querySelector('meta[name="color-scheme"]');
  metaColorScheme.content = scheme;
  localStorage.setItem("color-scheme", scheme);
  if (scheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else if (scheme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }
}

// ==========================================
// DATA LOADING
// ==========================================
async function loadQuestionsData() {
  try {
    const response = await fetch("mock6-questions.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    allQuestions = await response.json();
    switchView("dashboard");
  } catch (error) {
    console.error("Error loading questions:", error);
    document.getElementById("app-view").innerHTML = `
      <div class="loading-screen">
        <span style="font-size: 3rem;">⚠️</span>
        <h3>فشل تحميل بنك الأسئلة</h3>
        <p>يرجى التأكد من وجود ملف mock6-questions.json</p>
        <button class="btn btn-primary" onclick="window.location.reload()" style="font-family: 'Cairo', sans-serif;">إعادة المحاولة</button>
      </div>
    `;
  }
}

// ==========================================
// PROGRESS PERSISTENCE
// ==========================================
function loadProgressFromStorage() {
  const saved = localStorage.getItem("mock6-progress");
  if (saved) {
    mock6State.progress = JSON.parse(saved);
  }
}

function saveProgressToStorage() {
  localStorage.setItem("mock6-progress", JSON.stringify(mock6State.progress));
}

function getChapterProgress(chapterId) {
  if (!mock6State.progress[chapterId]) {
    mock6State.progress[chapterId] = { answered: {}, correct: 0, wrong: 0 };
  }
  return mock6State.progress[chapterId];
}

// ==========================================
// VIEW ROUTER
// ==========================================
function switchView(viewName) {
  mock6State.currentView = viewName;
  if (viewName === "dashboard") renderDashboard();
  else if (viewName === "quiz") renderQuizView();
  else if (viewName === "results") renderResultsView();
}

function setupGlobalEvents() {
  document.getElementById("go-home").addEventListener("click", () => {
    if (mock6State.currentView === "quiz") {
      if (confirm("هل تريد الخروج من الاختبار الحالي؟")) {
        switchView("dashboard");
      }
    } else {
      switchView("dashboard");
    }
  });
}

// ==========================================
// DASHBOARD VIEW
// ==========================================
function renderDashboard() {
  const container = document.getElementById("app-view");

  // Calculate overall stats
  const totalQuestions = allQuestions.length;
  const withAnswers = allQuestions.filter(q => q.answer).length;
  let totalAnswered = 0;
  let totalCorrect = 0;
  Object.values(mock6State.progress).forEach(p => {
    totalAnswered += Object.keys(p.answered).length;
    totalCorrect += p.correct;
  });
  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  // Build chapter cards
  const chapterCardsHTML = Object.entries(MOCK6_CHAPTERS).map(([chId, ch]) => {
    const chQuestions = allQuestions.filter(q => q.chapter_id === chId);
    const chWithAnswers = chQuestions.filter(q => q.answer).length;
    const prog = getChapterProgress(chId);
    const answeredCount = Object.keys(prog.answered).length;
    const progressPercent = chQuestions.length > 0 ? Math.round((answeredCount / chQuestions.length) * 100) : 0;

    return `
      <div class="mock6-chapter-card ${ch.category}" data-chapter="${chId}">
        <div class="card-accent"></div>
        <div class="card-body">
          <div class="card-header-row">
            <div class="card-icon">${ch.icon}</div>
            <span class="chapter-badge">${chId}</span>
          </div>
          <div class="card-title">${ch.titleEn}</div>
          <div class="card-subtitle">${ch.title}</div>
          <div class="mock6-progress-mini">
            <div class="fill ${ch.category}" style="width: ${progressPercent}%;"></div>
          </div>
          <div class="card-meta">
            <span>${chQuestions.length} سؤال${chWithAnswers < chQuestions.length ? ` (${chWithAnswers} مع إجابة)` : ''}</span>
            <span>${answeredCount > 0 ? `✅ ${answeredCount} تم حلها` : ''}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="step-dashboard mock6-page" style="max-width: 1200px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 24px;">

      <!-- Hero Banner -->
      <section class="mock6-hero">
        <div class="hero-badge">📋 SRTLE 6th Edition · ${totalQuestions.toLocaleString()} سؤال</div>
        <h2>Mock Exam 6th Edition — A Survival Guide</h2>
        <p>تدرب على أكثر من 4,000 سؤال من الإصدار السادس لاختبار الهيئة السعودية للتخصصات الصحية. أسئلة مقسمة حسب الفصول مع الإجابات.</p>
      </section>

      <!-- Stats Row -->
      <section class="mock6-stats-row">
        <div class="mock6-stat-card">
          <div class="mock6-stat-icon" style="background: rgba(230, 81, 0, 0.1);">📚</div>
          <div class="mock6-stat-details">
            <h4>إجمالي الأسئلة</h4>
            <div class="stat-value">${totalQuestions.toLocaleString()}</div>
          </div>
        </div>
        <div class="mock6-stat-card">
          <div class="mock6-stat-icon" style="background: rgba(16, 163, 74, 0.1);">✅</div>
          <div class="mock6-stat-details">
            <h4>أسئلة مع إجابة</h4>
            <div class="stat-value">${withAnswers.toLocaleString()}</div>
          </div>
        </div>
        <div class="mock6-stat-card">
          <div class="mock6-stat-icon" style="background: rgba(99, 102, 241, 0.1);">📝</div>
          <div class="mock6-stat-details">
            <h4>تم حلها</h4>
            <div class="stat-value">${totalAnswered}</div>
          </div>
        </div>
        <div class="mock6-stat-card">
          <div class="mock6-stat-icon" style="background: rgba(234, 179, 8, 0.1);">📈</div>
          <div class="mock6-stat-details">
            <h4>نسبة الصحة</h4>
            <div class="stat-value">${accuracy}%</div>
          </div>
        </div>
      </section>

      <!-- Filter Bar -->
      <section class="mock6-filter-bar">
        <button class="filter-chip ${mock6State.filterChapter === 'all' ? 'active' : ''}" data-filter="all">الكل</button>
        <button class="filter-chip ${mock6State.filterChapter === 'monthly' ? 'active' : ''}" data-filter="monthly">📅 الامتحانات الشهرية</button>
        <button class="filter-chip ${mock6State.filterChapter === 'modality' ? 'active' : ''}" data-filter="modality">🔬 Modalities</button>
        <button class="filter-chip ${mock6State.filterChapter === 'misc' ? 'active' : ''}" data-filter="misc">🏥 Miscellaneous</button>
        <button class="filter-chip ${mock6State.filterChapter === 'appendix' ? 'active' : ''}" data-filter="appendix">📎 الملاحق (Appendices)</button>
      </section>

      <!-- Chapter Cards Grid -->
      <section>
        <h2 style="font-size: 1.2rem; margin-bottom: 16px;">اختر الفصل للتدريب</h2>
        <div class="mock6-chapters-grid" id="chapters-grid">
          ${chapterCardsHTML}
        </div>
      </section>

      <!-- Reset Progress -->
      <section style="text-align: center; padding: 12px 0;">
        <button class="btn btn-secondary" id="btn-reset-progress" style="font-family: 'Cairo', sans-serif; font-size: 0.8rem;">
          🗑️ مسح تقدم التدريب
        </button>
      </section>
    </div>
  `;

  // Apply filter
  applyFilter(mock6State.filterChapter);

  // Bind filter chips
  document.querySelectorAll(".filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      mock6State.filterChapter = chip.dataset.filter;
      document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      applyFilter(mock6State.filterChapter);
    });
  });

  // Bind chapter card clicks
  document.querySelectorAll(".mock6-chapter-card").forEach(card => {
    card.addEventListener("click", () => {
      const chId = card.dataset.chapter;
      showChapterStartModal(chId);
    });
  });

  // Reset progress
  document.getElementById("btn-reset-progress").addEventListener("click", () => {
    if (confirm("هل أنت متأكد من مسح جميع بيانات التدريب؟ لا يمكن التراجع عن هذا.")) {
      mock6State.progress = {};
      saveProgressToStorage();
      renderDashboard();
    }
  });
}

function applyFilter(filter) {
  document.querySelectorAll(".mock6-chapter-card").forEach(card => {
    if (filter === "all") {
      card.style.display = "";
    } else {
      card.style.display = card.classList.contains(filter) ? "" : "none";
    }
  });
}

// ==========================================
// CHAPTER START MODAL
// ==========================================
function showChapterStartModal(chapterId) {
  const ch = MOCK6_CHAPTERS[chapterId];
  if (!ch) return;

  const chQuestions = allQuestions.filter(q => q.chapter_id === chapterId);
  const withAnswers = chQuestions.filter(q => q.answer).length;
  const prog = getChapterProgress(chapterId);
  const answeredCount = Object.keys(prog.answered).length;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;";
  overlay.innerHTML = `
    <div class="modal-card" style="max-width: 500px; background: var(--bg-secondary); border-radius: var(--border-radius-lg); padding: 32px; border: 1px solid var(--border-color); box-shadow: var(--shadow-lg); width: 100%;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="font-size: 3rem;">${ch.icon}</div>
        <h3 style="margin-top: 8px;">${ch.titleEn}</h3>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 6px;">${ch.title}</p>
        <div style="display: flex; gap: 12px; justify-content: center; margin-top: 12px; font-size: 0.8rem; color: var(--text-secondary);">
          <span>📚 ${chQuestions.length} سؤال</span>
          <span>✅ ${withAnswers} مع إجابة</span>
          <span>📝 ${answeredCount} تم حلها</span>
        </div>
      </div>

      <div style="margin-bottom: 16px;">
        <h4 style="font-size: 0.9rem; margin-bottom: 10px;">اختر نوع التدريب:</h4>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="radio" name="quiz-mode" value="all" checked>
            <span>جميع الأسئلة (${chQuestions.length})</span>
          </label>
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="radio" name="quiz-mode" value="with-answers">
            <span>فقط الأسئلة مع إجابات (${withAnswers})</span>
          </label>
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="radio" name="quiz-mode" value="unanswered">
            <span>الأسئلة التي لم تحل بعد (${chQuestions.length - answeredCount})</span>
          </label>
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="radio" name="quiz-mode" value="wrong">
            <span>الأسئلة الخاطئة فقط (${prog.wrong})</span>
          </label>
        </div>
      </div>

      <div style="margin-bottom: 16px;">
        <h4 style="font-size: 0.9rem; margin-bottom: 8px;">عدد الأسئلة:</h4>
        <select id="quiz-count" style="width: 100%; padding: 8px 12px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); font-family: 'Cairo', sans-serif;">
          <option value="10">10 أسئلة</option>
          <option value="25">25 سؤال</option>
          <option value="50" selected>50 سؤال</option>
          <option value="100">100 سؤال</option>
          <option value="0">جميع الأسئلة</option>
        </select>
      </div>

      <div style="display: flex; gap: 10px; flex-direction: column;">
        <button class="btn btn-primary" id="btn-start-quiz" style="font-family: 'Cairo', sans-serif; padding: 12px; background: #e65100; border-color: #e65100;">
          ابدأ التدريب 🚀
        </button>
        <button class="btn btn-secondary" id="btn-cancel-modal" style="font-family: 'Cairo', sans-serif;">
          إلغاء
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Start quiz
  document.getElementById("btn-start-quiz").addEventListener("click", () => {
    const mode = document.querySelector('input[name="quiz-mode"]:checked').value;
    const count = parseInt(document.getElementById("quiz-count").value);
    overlay.remove();
    startQuiz(chapterId, mode, count);
  });

  document.getElementById("btn-cancel-modal").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
}

// ==========================================
// START QUIZ
// ==========================================
function startQuiz(chapterId, mode, count) {
  const ch = MOCK6_CHAPTERS[chapterId];
  let questions = allQuestions.filter(q => q.chapter_id === chapterId);
  const prog = getChapterProgress(chapterId);

  // Apply mode filter
  if (mode === "with-answers") {
    questions = questions.filter(q => q.answer);
  } else if (mode === "unanswered") {
    questions = questions.filter(q => !prog.answered[q.id]);
  } else if (mode === "wrong") {
    questions = questions.filter(q => prog.answered[q.id] === false);
  }

  if (questions.length === 0) {
    alert("لا توجد أسئلة متاحة لهذا الفلتر.");
    return;
  }

  // Shuffle
  questions = questions.sort(() => Math.random() - 0.5);

  // Limit count
  if (count > 0 && count < questions.length) {
    questions = questions.slice(0, count);
  }

  mock6State.quiz = {
    chapterId: chapterId,
    chapterName: ch.titleEn,
    questions: questions,
    currentIndex: 0,
    answers: {},
    checkedAnswers: new Set(),
    sessionStartTime: Date.now(),
    mode: "practice"
  };

  switchView("quiz");
}

// ==========================================
// QUIZ VIEW
// ==========================================
function renderQuizView() {
  const container = document.getElementById("app-view");
  const quiz = mock6State.quiz;
  const q = quiz.questions[quiz.currentIndex];
  if (!q) return;

  const isChecked = quiz.checkedAnswers.has(quiz.currentIndex);
  const selectedAnswer = quiz.answers[q.id];
  const ch = MOCK6_CHAPTERS[quiz.chapterId];
  const hasAnswer = !!q.answer;

  // Build question navigator dots
  const dotsHTML = quiz.questions.map((qItem, idx) => {
    let dotClass = "";
    if (idx === quiz.currentIndex) dotClass = "current";
    else if (quiz.checkedAnswers.has(idx)) {
      const sel = quiz.answers[qItem.id];
      if (qItem.answer && sel === qItem.answer) dotClass = "correct-dot";
      else if (qItem.answer && sel && sel !== qItem.answer) dotClass = "wrong-dot";
      else dotClass = "answered";
    } else if (quiz.answers[qItem.id]) {
      dotClass = "answered";
    }
    return `<div class="q-dot ${dotClass}" data-idx="${idx}">${idx + 1}</div>`;
  }).join("");

  // Build options HTML
  const optionsHTML = Object.keys(q.options).map(key => {
    let extraClass = "";
    if (isChecked && hasAnswer) {
      if (key === q.answer) extraClass = "correct";
      else if (key === selectedAnswer && key !== q.answer) extraClass = "incorrect";
    } else if (key === selectedAnswer) {
      extraClass = "selected";
    }
    return `
      <div class="mock6-option ${extraClass}" data-key="${key}">
        <span class="option-letter">${key.toUpperCase()}</span>
        <span>${q.options[key]}</span>
      </div>
    `;
  }).join("");

  // Answer/explanation section
  let answerSection = "";
  if (!isChecked) {
    if (!hasAnswer) {
      answerSection = `
        <div style="margin-top: 12px; padding: 12px; background: var(--bg-tertiary); border-radius: var(--border-radius-sm); font-size: 0.85rem; color: var(--text-secondary);">
          ⚠️ هذا السؤال لا يوجد له إجابة محفوظة في المصدر
        </div>
      `;
    }
  } else {
    const correctOptionText = q.answer ? q.options[q.answer] : "";
    answerSection = `
      <div class="mock6-explanation">
        <div class="explain-header">💡 الإجابة الصحيحة: <strong>${q.answer ? q.answer.toUpperCase() : 'N/A'}</strong></div>
        <div class="correct-answer-text" style="font-weight: 600; margin: 6px 0 12px 0;">${correctOptionText}</div>
        
        ${q.rule ? `
          <div class="mock6-rule-card">
            <div class="rule-title">⚡ قاعدة حل السؤال (Golden Rule):</div>
            <div class="rule-content">${q.rule}</div>
          </div>
        ` : ''}

        ${q.explanation ? `
          <div class="mock6-explanation-card">
            <div class="explanation-title">📖 الشرح والتعليل العلمي (Detailed Explanation):</div>
            <div class="explanation-content">${q.explanation}</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // Question Image markup
  const imageHTML = q.image ? `
    <div class="mock6-q-image-container">
      <img src="${q.image}" alt="صورة السؤال ${q.original_num}" class="mock6-q-image" onclick="openMock6ImageModal('${q.image}')" />
      <div class="image-zoom-hint">🔍 انقر على الصورة لتكبيرها وفحص التفاصيل بدقة عالية</div>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="mock6-quiz-container mock6-page">

      <!-- Quiz Header -->
      <div class="mock6-quiz-header">
        <span class="section-badge">${ch.icon} ${ch.titleEn} (${quiz.chapterId})</span>
        <span class="q-counter">سؤال ${quiz.currentIndex + 1} من ${quiz.questions.length}</span>
      </div>

      <!-- Question Navigator -->
      <div class="mock6-q-navigator" id="q-navigator">
        ${dotsHTML}
      </div>

      <!-- Question Card -->
      <div class="mock6-question-card">
        <div class="q-text">
          <span class="q-num-badge">${q.original_num}</span>
          ${q.question}
        </div>

        ${imageHTML}

        <div class="mock6-options-list" id="options-list">
          ${optionsHTML}
        </div>

        ${answerSection}
      </div>

      <!-- Navigation Footer -->
      <div class="mock6-quiz-footer">
        <button class="btn btn-secondary" id="btn-prev" style="font-family: 'Cairo', sans-serif;" ${quiz.currentIndex === 0 ? "disabled" : ""}>
          ← السابق
        </button>
        <div class="footer-right">
          <button class="btn btn-secondary" id="btn-finish" style="font-family: 'Cairo', sans-serif; color: var(--danger, #ef4444); border-color: var(--danger, #ef4444);">
            إنهاء الاختبار
          </button>
          <button class="btn btn-primary" id="btn-next" style="font-family: 'Cairo', sans-serif; background: #e65100; border-color: #e65100;" ${quiz.currentIndex >= quiz.questions.length - 1 ? "disabled" : ""}>
            التالي →
          </button>
        </div>
      </div>
    </div>
  `;

  // Bind navigator dots
  document.querySelectorAll(".q-dot").forEach(dot => {
    dot.addEventListener("click", () => {
      quiz.currentIndex = parseInt(dot.dataset.idx);
      renderQuizView();
    });
  });

  // Bind option clicks — auto-reveal answer immediately on click
  if (!isChecked) {
    document.querySelectorAll(".mock6-option").forEach(opt => {
      opt.addEventListener("click", () => {
        const selectedKey = opt.dataset.key;
        quiz.answers[q.id] = selectedKey;
        // Immediately mark as checked (no "Check Answer" button needed)
        quiz.checkedAnswers.add(quiz.currentIndex);
        // Record progress
        const isCorrect = selectedKey === q.answer;
        const prog = getChapterProgress(quiz.chapterId);
        prog.answered[q.id] = isCorrect;
        if (isCorrect) {
          prog.correct++;
        } else {
          prog.wrong++;
        }
        saveProgressToStorage();
        renderQuizView();
      });
    });
  }

  // Navigation
  document.getElementById("btn-prev").addEventListener("click", () => {
    if (quiz.currentIndex > 0) {
      quiz.currentIndex--;
      renderQuizView();
    }
  });

  document.getElementById("btn-next").addEventListener("click", () => {
    if (quiz.currentIndex < quiz.questions.length - 1) {
      quiz.currentIndex++;
      renderQuizView();
    }
  });

  document.getElementById("btn-finish").addEventListener("click", () => {
    if (confirm("هل أنت متأكد من إنهاء الاختبار وعرض النتائج؟")) {
      switchView("results");
    }
  });

  // Scroll navigator to show current dot
  const currentDot = document.querySelector(".q-dot.current");
  if (currentDot) {
    currentDot.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }
}

// ==========================================
// RESULTS VIEW
// ==========================================
function renderResultsView() {
  const container = document.getElementById("app-view");
  const quiz = mock6State.quiz;
  const ch = MOCK6_CHAPTERS[quiz.chapterId];

  let correctCount = 0;
  let answeredCount = 0;
  let answeredWithKey = 0;
  const totalQuestions = quiz.questions.length;

  quiz.questions.forEach(q => {
    if (quiz.answers[q.id]) {
      answeredCount++;
      if (q.answer) {
        answeredWithKey++;
        if (quiz.answers[q.id] === q.answer) correctCount++;
      }
    }
  });

  const scorePercent = answeredWithKey > 0 ? Math.round((correctCount / answeredWithKey) * 100) : 0;
  const isPassing = scorePercent >= 60;
  const durationMs = Date.now() - (quiz.sessionStartTime || Date.now());
  const durationMin = Math.round(durationMs / 60000);

  container.innerHTML = `
    <div class="mock6-results-container mock6-page">

      <!-- Results Hero -->
      <div class="mock6-results-hero ${isPassing ? "pass" : "fail"}">
        <span style="font-size: 4rem;">${isPassing ? "🎉" : "💪"}</span>
        <div class="score-big" style="color: var(--${isPassing ? "success" : "danger"});">${scorePercent}%</div>
        <h2>${isPassing ? "أداء ممتاز! استمر!" : "تحتاج مزيد من التدريب"}</h2>
        <p style="color: var(--text-secondary);">${ch.titleEn} — ${ch.title}</p>
      </div>

      <!-- Breakdown -->
      <div class="mock6-results-breakdown">
        <h3>📊 تفاصيل النتيجة</h3>
        <div class="results-stat-row">
          <span class="label">إجمالي الأسئلة</span>
          <span class="value">${totalQuestions}</span>
        </div>
        <div class="results-stat-row">
          <span class="label">أسئلة تمت الإجابة عليها</span>
          <span class="value">${answeredCount}</span>
        </div>
        <div class="results-stat-row">
          <span class="label">أسئلة مع مفتاح إجابة</span>
          <span class="value">${answeredWithKey}</span>
        </div>
        <div class="results-stat-row">
          <span class="label">إجابات صحيحة</span>
          <span class="value" style="color: var(--success);">${correctCount}</span>
        </div>
        <div class="results-stat-row">
          <span class="label">إجابات خاطئة</span>
          <span class="value" style="color: var(--danger);">${answeredWithKey - correctCount}</span>
        </div>
        <div class="results-stat-row">
          <span class="label">أسئلة لم تُجَب</span>
          <span class="value">${totalQuestions - answeredCount}</span>
        </div>
        <div class="results-stat-row">
          <span class="label">المدة</span>
          <span class="value">${durationMin} دقيقة</span>
        </div>
      </div>

      <!-- Actions -->
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="btn btn-primary" id="btn-review" style="flex: 1; font-family: 'Cairo', sans-serif; background: #e65100; border-color: #e65100;">
          📝 مراجعة الأسئلة والأجوبة
        </button>
        <button class="btn btn-secondary" id="btn-back-dashboard" style="flex: 1; font-family: 'Cairo', sans-serif;">
          🏠 العودة للوحة التحكم
        </button>
      </div>
    </div>
  `;

  document.getElementById("btn-review").addEventListener("click", () => {
    // Check all answered questions
    quiz.questions.forEach((q, i) => {
      if (quiz.answers[q.id]) {
        quiz.checkedAnswers.add(i);
      }
    });
    quiz.currentIndex = 0;
    switchView("quiz");
  });

  document.getElementById("btn-back-dashboard").addEventListener("click", () => {
    switchView("dashboard");
  });
}

// ==========================================
// IMAGE MODAL / LIGHTBOX
// ==========================================
window.openMock6ImageModal = function(src) {
  let modal = document.getElementById("mock6-img-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "mock6-img-modal";
    modal.className = "mock6-image-modal";
    modal.innerHTML = `
      <div class="mock6-modal-backdrop" onclick="closeMock6ImageModal()"></div>
      <div class="mock6-modal-content">
        <button class="mock6-modal-close" onclick="closeMock6ImageModal()" title="إغلاق (Esc)">✕</button>
        <img id="mock6-modal-img" src="" alt="صورة مكبرة" />
      </div>
    `;
    document.body.appendChild(modal);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMock6ImageModal();
    });
  }
  document.getElementById("mock6-modal-img").src = src;
  modal.classList.add("active");
};

window.closeMock6ImageModal = function() {
  const modal = document.getElementById("mock6-img-modal");
  if (modal) modal.classList.remove("active");
};
