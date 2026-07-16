// ==========================================
// STEP TEST - MAIN APPLICATION
// ==========================================
let supabaseClient = null;
let stepState = {
  currentView: "dashboard", // 'dashboard', 'quiz', 'results'
  questions: [],             // Current session questions
  currentIndex: 0,
  answers: {},               // question_id -> selected answer
  currentSection: null,      // 'grammar', 'reading', 'comprehensive_150'
  currentTopic: null,
  checkedAnswers: new Set(),
  sessionStartTime: null,
  progress: {                // Per-section progress from Supabase
    grammar: { total: 0, answered: 0, correct: 0 },
    reading: { total: 0, answered: 0, correct: 0 },
    comprehensive_150: { total: 0, answered: 0, correct: 0 }
  }
};

// Section definitions
const STEP_SECTIONS = {
  grammar: {
    id: "grammar",
    title: "تأسيس القواعد",
    titleEn: "Grammar Foundations",
    icon: "📘",
    desc: "أساسيات القواعد الإنجليزية: الأزمنة، حروف الجر، الشرطية، المقارنة والتفضيل، المبني للمجهول، والأسماء المعدودة وغير المعدودة.",
    color: "grammar",
    badgeClass: "badge-grammar",
    topics: [
      { id: "tenses", name: "الأزمنة (Tenses)", nameEn: "Verb Tenses" },
      { id: "prepositions", name: "حروف الجر (Prepositions)", nameEn: "Prepositions" },
      { id: "conditionals", name: "الجمل الشرطية (Conditionals)", nameEn: "Conditionals" },
      { id: "comparatives", name: "المقارنة والتفضيل", nameEn: "Comparatives & Superlatives" },
      { id: "passive_voice", name: "المبني للمجهول", nameEn: "Passive Voice" },
      { id: "modals", name: "الأفعال المساعدة (Modals)", nameEn: "Modals" },
      { id: "articles", name: "أدوات التعريف والتنكير", nameEn: "Articles (a/an/the)" },
      { id: "subject_verb", name: "التوافق بين الفاعل والفعل", nameEn: "Subject-Verb Agreement" },
      { id: "reported_speech", name: "الكلام المنقول", nameEn: "Reported Speech" },
      { id: "countable_uncountable", name: "معدود وغير معدود", nameEn: "Countable & Uncountable Nouns" }
    ],
    questionsPerGeneration: 10
  },
  reading: {
    id: "reading",
    title: "القطع والفهم",
    titleEn: "Reading Comprehension",
    icon: "📖",
    desc: "قطع نصية مشابهة لاختبار STEP مع أسئلة فهم المقروء. تتراوح النصوص بين 100 و 400 كلمة وتغطي مواضيع متنوعة.",
    color: "reading",
    badgeClass: "badge-reading",
    topics: [
      { id: "general", name: "مواضيع عامة", nameEn: "General Topics" },
      { id: "science", name: "مقالات علمية", nameEn: "Science Articles" },
      { id: "social", name: "مقالات اجتماعية", nameEn: "Social Studies" },
      { id: "technology", name: "تكنولوجيا", nameEn: "Technology" }
    ],
    questionsPerGeneration: 5 // 5 passages x 3-4 questions each
  },
  comprehensive_150: {
    id: "comprehensive_150",
    title: "الشامل 150",
    titleEn: "Comprehensive 150",
    icon: "📋",
    desc: "مزيج شامل من أسئلة القواعد والقطع والتحليل الكتابي بأسلوب اختبار STEP الحقيقي. يشمل جميع الأقسام.",
    color: "comprehensive",
    badgeClass: "badge-comprehensive",
    topics: [
      { id: "mixed", name: "أسئلة متنوعة", nameEn: "Mixed Questions" },
      { id: "writing_analysis", name: "التحليل الكتابي", nameEn: "Writing Analysis" }
    ],
    questionsPerGeneration: 15
  }
};

// ==========================================
// INIT APP
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  setupTheme();
  initSupabase();
  setupGlobalEvents();
  await loadProgressStats();
  renderDashboard();
});

// ==========================================
// THEME CONTROLLER (same as main app)
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
// SUPABASE INIT
// ==========================================
function initSupabase() {
  const config = window.SUPABASE_CONFIG || {};
  const storedUrl = localStorage.getItem("srtle-supabase-url") || config.url || "";
  const storedKey = localStorage.getItem("srtle-supabase-key") || config.anonKey || "";

  if (storedUrl && storedKey) {
    try {
      supabaseClient = supabase.createClient(storedUrl, storedKey);
      console.log("Supabase Client initialized for STEP.");
      setupAuthListener();
    } catch (e) {
      console.error("Failed to initialize Supabase:", e);
    }
  } else {
    updateProfileHeader(null);
  }
}

function setupAuthListener() {
  if (!supabaseClient) return;
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      updateProfileHeader(session.user);
      await loadProgressStats();
      if (stepState.currentView === "dashboard") renderDashboard();
    } else {
      updateProfileHeader(null);
    }
  });
}

function updateProfileHeader(user) {
  const container = document.getElementById("user-profile-area");
  if (!container) return;

  if (user) {
    const firstLetter = (user.email || "U").charAt(0).toUpperCase();
    container.innerHTML = `
      <button class="profile-avatar-btn" id="profile-menu-btn" title="حساب المستخدم">${firstLetter}</button>
      <div class="profile-menu" id="profile-dropdown-menu">
        <div class="menu-user-info">
          <div>مسجل الدخول كـ:</div>
          <div class="menu-user-email">${user.email}</div>
        </div>
        <button class="menu-item menu-item-danger" id="menu-logout">🚪 تسجيل الخروج</button>
      </div>
    `;
    document.getElementById("profile-menu-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("profile-dropdown-menu").classList.toggle("show");
    });
    document.addEventListener("click", () => {
      const menu = document.getElementById("profile-dropdown-menu");
      if (menu) menu.classList.remove("show");
    });
    document.getElementById("menu-logout").addEventListener("click", async () => {
      await supabaseClient.auth.signOut();
      window.location.reload();
    });
  } else {
    container.innerHTML = `
      <button id="btn-login-modal" class="btn btn-primary btn-sm" style="font-family: 'Cairo', sans-serif; gap: 6px;">
        <span>تسجيل الدخول</span> 🔑
      </button>
    `;
    document.getElementById("btn-login-modal").addEventListener("click", () => {
      showLoginModal();
    });
  }
}

// ==========================================
// LOGIN MODAL
// ==========================================
function showLoginModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card" style="max-width: 400px;">
      <h3 style="text-align: center; margin-bottom: 16px;">🔑 تسجيل الدخول</h3>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <input type="email" id="login-email" placeholder="البريد الإلكتروني" dir="ltr" style="padding: 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.9rem;">
        <input type="password" id="login-password" placeholder="كلمة المرور" dir="ltr" style="padding: 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.9rem;">
        <button class="btn btn-primary" id="btn-do-login" style="font-family: 'Cairo', sans-serif;">دخول</button>
        <button class="btn btn-secondary" id="btn-do-signup" style="font-family: 'Cairo', sans-serif;">تسجيل جديد</button>
        <button class="btn btn-secondary" id="btn-close-login" style="font-family: 'Cairo', sans-serif;">إلغاء</button>
      </div>
      <div id="login-error" style="color: var(--danger); font-size: 0.8rem; margin-top: 8px; display: none;"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("btn-do-login").addEventListener("click", async () => {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    if (!email || !password) return;
    try {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      overlay.remove();
    } catch (e) {
      const errDiv = document.getElementById("login-error");
      errDiv.style.display = "block";
      errDiv.innerText = e.message;
    }
  });

  document.getElementById("btn-do-signup").addEventListener("click", async () => {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    if (!email || !password) return;
    try {
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      const errDiv = document.getElementById("login-error");
      errDiv.style.display = "block";
      errDiv.style.color = "var(--success)";
      errDiv.innerText = "تم إنشاء الحساب! تحقق من بريدك الإلكتروني للتفعيل.";
    } catch (e) {
      const errDiv = document.getElementById("login-error");
      errDiv.style.display = "block";
      errDiv.innerText = e.message;
    }
  });

  document.getElementById("btn-close-login").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
}

// ==========================================
// GLOBAL EVENTS
// ==========================================
function setupGlobalEvents() {
  document.getElementById("go-home").addEventListener("click", () => {
    if (stepState.currentView === "quiz") {
      if (confirm("هل تريد الخروج من الاختبار الحالي؟ سيتم فقدان تقدمك.")) {
        switchView("dashboard");
      }
    } else {
      switchView("dashboard");
    }
  });
}

function switchView(viewName) {
  stepState.currentView = viewName;
  if (viewName === "dashboard") {
    renderDashboard();
  } else if (viewName === "quiz") {
    renderQuizView();
  } else if (viewName === "results") {
    renderResultsView();
  }
}

// ==========================================
// LOAD PROGRESS STATS FROM SUPABASE
// ==========================================
async function loadProgressStats() {
  if (!supabaseClient) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // Count questions per section
    const { data: questionCounts } = await supabaseClient
      .from("step_questions")
      .select("section");

    if (questionCounts) {
      const counts = { grammar: 0, reading: 0, comprehensive_150: 0 };
      questionCounts.forEach(q => { if (counts[q.section] !== undefined) counts[q.section]++; });
      stepState.progress.grammar.total = counts.grammar;
      stepState.progress.reading.total = counts.reading;
      stepState.progress.comprehensive_150.total = counts.comprehensive_150;
    }

    // Count user progress
    const { data: progressData } = await supabaseClient
      .from("step_user_progress")
      .select("question_id, is_correct, step_questions(section)")
      .eq("user_id", user.id);

    if (progressData) {
      // Reset
      Object.keys(stepState.progress).forEach(k => {
        stepState.progress[k].answered = 0;
        stepState.progress[k].correct = 0;
      });
      progressData.forEach(p => {
        const section = p.step_questions?.section;
        if (section && stepState.progress[section]) {
          stepState.progress[section].answered++;
          if (p.is_correct) stepState.progress[section].correct++;
        }
      });
    }
  } catch (e) {
    console.error("Error loading STEP progress:", e);
  }
}

// ==========================================
// DASHBOARD VIEW
// ==========================================
function renderDashboard() {
  const container = document.getElementById("app-view");

  const totalQuestions = stepState.progress.grammar.total + stepState.progress.reading.total + stepState.progress.comprehensive_150.total;
  const totalAnswered = stepState.progress.grammar.answered + stepState.progress.reading.answered + stepState.progress.comprehensive_150.answered;
  const totalCorrect = stepState.progress.grammar.correct + stepState.progress.reading.correct + stepState.progress.comprehensive_150.correct;
  const overallAccuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  container.innerHTML = `
    <div class="step-dashboard step-page">

      <!-- Hero Banner -->
      <section class="step-hero">
        <h2>📝 محاكي اختبار STEP - كفايات اللغة الإنجليزية</h2>
        <p>تدرّب على أسئلة مشابهة لاختبار كفايات اللغة الإنجليزية (STEP) من المركز الوطني للقياس. أسئلة مُولّدة بالذكاء الاصطناعي تغطي القواعد والقطع والتحليل الكتابي.</p>
      </section>

      <!-- Stats Row -->
      <section class="step-stats-row">
        <div class="step-stat-card">
          <div class="step-stat-icon" style="background: rgba(99, 102, 241, 0.1);">📚</div>
          <div class="step-stat-details">
            <h4>إجمالي الأسئلة المتاحة</h4>
            <div class="stat-value">${totalQuestions}</div>
          </div>
        </div>
        <div class="step-stat-card">
          <div class="step-stat-icon" style="background: rgba(16, 163, 74, 0.1);">✅</div>
          <div class="step-stat-details">
            <h4>أسئلة تم حلها</h4>
            <div class="stat-value">${totalAnswered}</div>
          </div>
        </div>
        <div class="step-stat-card">
          <div class="step-stat-icon" style="background: rgba(234, 179, 8, 0.1);">📈</div>
          <div class="step-stat-details">
            <h4>نسبة الإجابات الصحيحة</h4>
            <div class="stat-value">${overallAccuracy}%</div>
          </div>
        </div>
      </section>

      <!-- Sections Grid -->
      <section>
        <h2 style="font-size: 1.2rem; margin-bottom: 16px;">اختر القسم للتدريب</h2>
        <div class="step-sections-grid">
          ${Object.values(STEP_SECTIONS).map(sec => {
            const prog = stepState.progress[sec.id];
            const progressPercent = prog.total > 0 ? Math.round((prog.answered / prog.total) * 100) : 0;
            return `
              <div class="step-section-card ${sec.color}" data-section="${sec.id}">
                <div class="card-accent"></div>
                <div class="card-body">
                  <div class="card-icon">${sec.icon}</div>
                  <div class="card-title">${sec.title}</div>
                  <div class="card-desc">${sec.desc}</div>
                  <div class="step-progress-mini">
                    <div class="fill ${sec.color}" style="width: ${progressPercent}%;"></div>
                  </div>
                  <div class="card-meta">
                    <span>${prog.answered} / ${prog.total} سؤال</span>
                    <span class="badge ${sec.badgeClass}">${sec.titleEn}</span>
                  </div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </section>
    </div>
  `;

  // Bind section card clicks
  document.querySelectorAll(".step-section-card").forEach(card => {
    card.addEventListener("click", () => {
      const sectionId = card.dataset.section;
      showSectionStartModal(sectionId);
    });
  });
}

// ==========================================
// SECTION START MODAL
// ==========================================
function showSectionStartModal(sectionId) {
  const sec = STEP_SECTIONS[sectionId];
  if (!sec) return;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:1000;";
  overlay.innerHTML = `
    <div class="modal-card" style="max-width: 550px; background: var(--bg-secondary); border-radius: var(--border-radius-lg); padding: 32px; border: 1px solid var(--border-color); box-shadow: var(--shadow-lg);">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="font-size: 3rem;">${sec.icon}</div>
        <h3 style="margin-top: 8px;">${sec.title}</h3>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 8px;">${sec.desc}</p>
      </div>

      <div style="margin-bottom: 16px;">
        <h4 style="font-size: 0.9rem; margin-bottom: 8px;">اختر الموضوع (اختياري):</h4>
        <div class="topic-chips" id="topic-chips-container">
          <button class="topic-chip active" data-topic="all">الكل</button>
          ${sec.topics.map(t => `<button class="topic-chip" data-topic="${t.id}">${t.name}</button>`).join("")}
        </div>
      </div>

      <div style="display: flex; gap: 10px; flex-direction: column;">
        <button class="btn btn-primary" id="btn-start-section" style="font-family: 'Cairo', sans-serif; padding: 12px;">
          ابدأ التدريب ✨
        </button>
        <button class="btn btn-secondary" id="btn-generate-new" style="font-family: 'Cairo', sans-serif;">
          🤖 توليد أسئلة جديدة بالذكاء الاصطناعي
        </button>
        <button class="btn btn-secondary" id="btn-cancel-section" style="font-family: 'Cairo', sans-serif;">
          إلغاء
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Topic chip selection
  let selectedTopic = "all";
  overlay.querySelectorAll(".topic-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      overlay.querySelectorAll(".topic-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      selectedTopic = chip.dataset.topic;
    });
  });

  // Start training with existing questions
  document.getElementById("btn-start-section").addEventListener("click", async () => {
    overlay.remove();
    const topic = selectedTopic === "all" ? null : selectedTopic;
    await startQuizSession(sectionId, topic, false);
  });

  // Generate new questions
  document.getElementById("btn-generate-new").addEventListener("click", async () => {
    overlay.remove();
    const topic = selectedTopic === "all" ? null : selectedTopic;
    await startQuizSession(sectionId, topic, true);
  });

  document.getElementById("btn-cancel-section").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
}

// ==========================================
// QUIZ SESSION START
// ==========================================
async function startQuizSession(sectionId, topic, forceGenerate) {
  stepState.currentSection = sectionId;
  stepState.currentTopic = topic;
  stepState.currentIndex = 0;
  stepState.answers = {};
  stepState.checkedAnswers = new Set();
  stepState.sessionStartTime = Date.now();

  const container = document.getElementById("app-view");

  // Show loading
  container.innerHTML = `
    <div class="ai-gen-overlay" style="position: relative; min-height: 60vh;">
      <div class="ai-gen-card">
        <div class="pulse-icon">🧠</div>
        <h3>جاري تحضير الأسئلة...</h3>
        <p id="gen-status-text">يتم تحميل الأسئلة من قاعدة البيانات</p>
        <div class="ai-gen-progress"><div class="bar" style="width: 100%;"></div></div>
      </div>
    </div>
  `;

  let questions = [];

  if (!forceGenerate) {
    // Try loading from Supabase first
    questions = await loadQuestionsFromDb(sectionId, topic);
  }

  if (questions.length === 0 || forceGenerate) {
    // Generate with AI
    const statusText = document.getElementById("gen-status-text");
    if (statusText) statusText.innerText = "يتم توليد أسئلة جديدة بالذكاء الاصطناعي... قد يستغرق ذلك بضع ثوان ⏳";

    questions = await generateQuestionsWithAI(sectionId, topic);

    if (questions.length === 0) {
      container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 50vh; gap: 16px; text-align: center; padding: 24px;">
          <span style="font-size: 3rem;">⚠️</span>
          <h3>فشل توليد الأسئلة</h3>
          <p style="color: var(--text-secondary);">تأكد من إعداد مفتاح Gemini API واتصال الإنترنت</p>
          <button class="btn btn-primary" onclick="switchView('dashboard')" style="font-family: 'Cairo', sans-serif;">العودة للوحة التحكم</button>
        </div>
      `;
      return;
    }
  }

  // Shuffle questions
  stepState.questions = questions.sort(() => Math.random() - 0.5);
  switchView("quiz");
}

// ==========================================
// LOAD QUESTIONS FROM DB
// ==========================================
async function loadQuestionsFromDb(section, topic) {
  if (!supabaseClient) return [];

  try {
    let query = supabaseClient.from("step_questions").select("*").eq("section", section);
    if (topic) query = query.eq("topic", topic);
    query = query.limit(50);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error("Error loading STEP questions:", e);
    return [];
  }
}

// ==========================================
// AI QUESTION GENERATION
// ==========================================
async function generateQuestionsWithAI(section, topic) {
  const apiKey = localStorage.getItem("srtle-gemini-api-key") || window.GEMINI_API_KEY || "";

  if (!apiKey) {
    alert("يرجى إعداد مفتاح Gemini API أولاً. يمكنك إدخاله من صفحة اختبار الهيئة الرئيسية.");
    return [];
  }

  const sec = STEP_SECTIONS[section];
  let prompt = "";

  if (section === "grammar") {
    const topicName = topic
      ? sec.topics.find(t => t.id === topic)?.nameEn || topic
      : "all grammar topics (Tenses, Prepositions, Conditionals, Comparatives & Superlatives, Passive Voice, Modals, Articles, Subject-Verb Agreement, Reported Speech, Countable & Uncountable Nouns)";

    prompt = `You are an expert English language test creator specializing in the Saudi STEP (Standardized Test of English Proficiency) exam.

Generate exactly ${sec.questionsPerGeneration} multiple-choice grammar questions similar to the STEP exam format.

Topic focus: ${topicName}

Requirements:
1. Each question must test practical English grammar knowledge
2. Use fill-in-the-blank format (e.g., "She _______ to school every day.")
3. Each question must have exactly 4 options (a, b, c, d)
4. Only ONE correct answer
5. Include a brief explanation for the correct answer (2-3 sentences in English)
6. Vary difficulty (mix of easy, medium, hard)
7. Questions should be realistic and match STEP exam style
8. Use contexts relevant to Saudi students where appropriate

Return the response as a valid JSON array with this EXACT structure (no markdown, no code blocks, just pure JSON):
[
  {
    "question": "The question text with _______ for blanks",
    "topic": "${topic || 'mixed'}",
    "difficulty": "easy|medium|hard",
    "options": {"a": "option A", "b": "option B", "c": "option C", "d": "option D"},
    "answer": "a|b|c|d",
    "explanation": "Brief explanation in English"
  }
]`;
  } else if (section === "reading") {
    prompt = `You are an expert English language test creator specializing in the Saudi STEP (Standardized Test of English Proficiency) exam.

Generate exactly ${sec.questionsPerGeneration} reading comprehension passages with questions, similar to the STEP exam.

Requirements:
1. Each passage should be 150-300 words on diverse topics (science, technology, history, health, environment)
2. Each passage must have 3-4 multiple-choice comprehension questions
3. Questions should test: main idea, vocabulary in context, inference, specific details
4. Each question has exactly 4 options (a, b, c, d) with ONE correct answer
5. Include a brief explanation for each correct answer
6. Match STEP exam difficulty level

Return the response as a valid JSON array (no markdown, no code blocks, just pure JSON).
Each item represents ONE question (passage is repeated for questions from the same passage):
[
  {
    "question": "What is the main idea of the passage?",
    "passage": "The full passage text here...",
    "topic": "science|technology|social|general",
    "difficulty": "medium",
    "options": {"a": "option A", "b": "option B", "c": "option C", "d": "option D"},
    "answer": "a|b|c|d",
    "explanation": "Brief explanation in English"
  }
]`;
  } else if (section === "comprehensive_150") {
    prompt = `You are an expert English language test creator specializing in the Saudi STEP (Standardized Test of English Proficiency) exam.

Generate exactly ${sec.questionsPerGeneration} mixed-type questions similar to the comprehensive STEP exam format.

Include a mix of:
- Grammar fill-in-the-blank questions (tenses, prepositions, conditionals, etc.)
- Writing analysis questions (punctuation, capitalization, sentence ordering)
- Error identification questions ("Which underlined part contains an error?")

Requirements:
1. Each question has exactly 4 options (a, b, c, d) with ONE correct answer
2. Include a brief explanation for each correct answer
3. Vary difficulty levels
4. Match STEP exam style exactly

Return the response as a valid JSON array (no markdown, no code blocks, just pure JSON):
[
  {
    "question": "The question text",
    "topic": "mixed|writing_analysis",
    "difficulty": "easy|medium|hard",
    "options": {"a": "option A", "b": "option B", "c": "option C", "d": "option D"},
    "answer": "a|b|c|d",
    "explanation": "Brief explanation in English"
  }
]`;
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `HTTP ${response.status}`);
    }

    const resData = await response.json();
    let text = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Clean markdown wrappers if any
    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    const questions = JSON.parse(text);

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("Invalid response format from AI");
    }

    // Save to Supabase
    const savedQuestions = await saveQuestionsToDb(questions, section);
    return savedQuestions;
  } catch (e) {
    console.error("AI generation failed:", e);
    alert("فشل توليد الأسئلة: " + e.message);
    return [];
  }
}

// ==========================================
// SAVE GENERATED QUESTIONS TO DB
// ==========================================
async function saveQuestionsToDb(questions, section) {
  if (!supabaseClient) {
    // If not connected, return with temporary UUIDs
    return questions.map((q, i) => ({
      id: `temp-${Date.now()}-${i}`,
      section: section,
      ...q
    }));
  }

  try {
    const rows = questions.map(q => ({
      section: section,
      topic: q.topic || null,
      difficulty: q.difficulty || "medium",
      question: q.question,
      passage: q.passage || null,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation || null
    }));

    const { data, error } = await supabaseClient
      .from("step_questions")
      .insert(rows)
      .select();

    if (error) throw error;

    // Update progress totals
    if (stepState.progress[section]) {
      stepState.progress[section].total += data.length;
    }

    return data;
  } catch (e) {
    console.error("Error saving questions:", e);
    // Return with temporary IDs if save fails
    return questions.map((q, i) => ({
      id: `temp-${Date.now()}-${i}`,
      section: section,
      ...q
    }));
  }
}

// ==========================================
// QUIZ VIEW RENDERER
// ==========================================
function renderQuizView() {
  const container = document.getElementById("app-view");
  const sec = STEP_SECTIONS[stepState.currentSection];
  const q = stepState.questions[stepState.currentIndex];
  if (!q) return;

  const isChecked = stepState.checkedAnswers.has(stepState.currentIndex);
  const selectedAnswer = stepState.answers[q.id];

  container.innerHTML = `
    <div class="step-quiz-container step-page">

      <!-- Quiz Header -->
      <div class="step-quiz-header">
        <span class="section-badge ${sec.badgeClass}">${sec.icon} ${sec.title}</span>
        <span class="q-counter">سؤال ${stepState.currentIndex + 1} من ${stepState.questions.length}</span>
      </div>

      ${q.passage ? `<div class="passage-box">${q.passage}</div>` : ""}

      <!-- Question Card -->
      <div class="step-question-card">
        <div class="q-text">${q.question.replace(/_{3,}/g, '<span style="display: inline-block; width: 100px; border-bottom: 2px solid var(--text-primary); margin: 0 4px;"></span>')}</div>

        <div class="step-options-list" id="options-list">
          ${Object.keys(q.options).map(key => {
            let extraClass = "";
            if (isChecked) {
              if (key === q.answer) extraClass = "correct";
              else if (key === selectedAnswer && key !== q.answer) extraClass = "incorrect";
            } else if (key === selectedAnswer) {
              extraClass = "selected";
            }
            return `
              <div class="step-option ${extraClass}" data-key="${key}" ${isChecked ? "" : ""}>
                <span class="option-letter">${key.toUpperCase()}</span>
                <span>${q.options[key]}</span>
              </div>
            `;
          }).join("")}
        </div>

        ${!isChecked ? `
          <div style="margin-top: 12px;">
            <button class="btn btn-primary" id="btn-check-answer" style="font-family: 'Cairo', sans-serif;" ${!selectedAnswer ? "disabled" : ""}>
              تحقق من الإجابة ✅
            </button>
          </div>
        ` : `
          <div class="step-explanation">
            <div class="explain-header">💡 الشرح:</div>
            <div>${q.explanation || "لا يوجد شرح متاح لهذا السؤال."}</div>
          </div>
        `}
      </div>

      <!-- Navigation Footer -->
      <div class="step-quiz-footer">
        <button class="btn btn-secondary" id="btn-prev" style="font-family: 'Cairo', sans-serif;" ${stepState.currentIndex === 0 ? "disabled" : ""}>
          ← السابق
        </button>
        <div class="footer-right">
          <button class="btn btn-danger" id="btn-finish" style="font-family: 'Cairo', sans-serif;">
            إنهاء الاختبار
          </button>
          <button class="btn btn-primary" id="btn-next" style="font-family: 'Cairo', sans-serif;" ${stepState.currentIndex >= stepState.questions.length - 1 ? "disabled" : ""}>
            التالي →
          </button>
        </div>
      </div>
    </div>
  `;

  // Bind option clicks (only if not checked)
  if (!isChecked) {
    document.querySelectorAll(".step-option").forEach(opt => {
      opt.addEventListener("click", () => {
        stepState.answers[q.id] = opt.dataset.key;
        renderQuizView(); // Re-render to show selection
      });
    });
  }

  // Check answer button
  const checkBtn = document.getElementById("btn-check-answer");
  if (checkBtn) {
    checkBtn.addEventListener("click", async () => {
      stepState.checkedAnswers.add(stepState.currentIndex);
      // Save progress to DB
      await saveAnswerToDb(q);
      renderQuizView();
    });
  }

  // Navigation
  document.getElementById("btn-prev").addEventListener("click", () => {
    if (stepState.currentIndex > 0) {
      stepState.currentIndex--;
      renderQuizView();
    }
  });

  document.getElementById("btn-next").addEventListener("click", () => {
    if (stepState.currentIndex < stepState.questions.length - 1) {
      stepState.currentIndex++;
      renderQuizView();
    }
  });

  document.getElementById("btn-finish").addEventListener("click", () => {
    if (confirm("هل أنت متأكد من إنهاء الاختبار وعرض النتائج؟")) {
      finishQuiz();
    }
  });
}

// ==========================================
// SAVE ANSWER TO DB
// ==========================================
async function saveAnswerToDb(question) {
  if (!supabaseClient) return;
  if (String(question.id).startsWith("temp-")) return; // Skip temp questions

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const selectedAnswer = stepState.answers[question.id];
    const isCorrect = selectedAnswer === question.answer;

    await supabaseClient.from("step_user_progress").upsert({
      user_id: user.id,
      question_id: question.id,
      selected_answer: selectedAnswer,
      is_correct: isCorrect,
      time_spent_seconds: 0
    }, { onConflict: "user_id,question_id" });
  } catch (e) {
    console.error("Error saving answer:", e);
  }
}

// ==========================================
// FINISH QUIZ & SHOW RESULTS
// ==========================================
function finishQuiz() {
  switchView("results");
}

function renderResultsView() {
  const container = document.getElementById("app-view");
  const sec = STEP_SECTIONS[stepState.currentSection];

  let correctCount = 0;
  let answeredCount = 0;
  const totalQuestions = stepState.questions.length;

  stepState.questions.forEach(q => {
    if (stepState.answers[q.id]) {
      answeredCount++;
      if (stepState.answers[q.id] === q.answer) correctCount++;
    }
  });

  const scorePercent = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
  const isPassing = scorePercent >= 60;
  const durationMs = Date.now() - (stepState.sessionStartTime || Date.now());
  const durationMin = Math.round(durationMs / 60000);

  // Save session to DB
  saveSessionToDb(sec.id, totalQuestions, correctCount, scorePercent);

  container.innerHTML = `
    <div class="step-results-container step-page">

      <!-- Results Hero -->
      <div class="step-results-hero ${isPassing ? "pass" : "fail"}">
        <span style="font-size: 4rem;">${isPassing ? "🎉" : "💪"}</span>
        <div class="score-big" style="color: var(--${isPassing ? "success" : "danger"});">${scorePercent}%</div>
        <h2>${isPassing ? "أداء ممتاز! استمر!" : "تحتاج مزيد من التدريب"}</h2>
        <p style="color: var(--text-secondary);">قسم ${sec.title} - ${sec.titleEn}</p>
      </div>

      <!-- Breakdown -->
      <div class="step-results-breakdown">
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
          <span class="label">إجابات صحيحة</span>
          <span class="value" style="color: var(--success);">${correctCount}</span>
        </div>
        <div class="results-stat-row">
          <span class="label">إجابات خاطئة</span>
          <span class="value" style="color: var(--danger);">${answeredCount - correctCount}</span>
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
        <button class="btn btn-primary" id="btn-review" style="flex: 1; font-family: 'Cairo', sans-serif;">
          📝 مراجعة الأسئلة والأجوبة
        </button>
        <button class="btn btn-secondary" id="btn-back-dashboard" style="flex: 1; font-family: 'Cairo', sans-serif;">
          🏠 العودة للوحة التحكم
        </button>
      </div>
    </div>
  `;

  document.getElementById("btn-review").addEventListener("click", () => {
    // Reset to first question with all checked
    stepState.questions.forEach((q, i) => {
      if (stepState.answers[q.id]) {
        stepState.checkedAnswers.add(i);
      }
    });
    stepState.currentIndex = 0;
    switchView("quiz");
  });

  document.getElementById("btn-back-dashboard").addEventListener("click", async () => {
    await loadProgressStats();
    switchView("dashboard");
  });
}

async function saveSessionToDb(section, total, correct, scorePercent) {
  if (!supabaseClient) return;
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    await supabaseClient.from("step_exam_sessions").insert({
      user_id: user.id,
      section: section,
      total_questions: total,
      correct_count: correct,
      score_percent: scorePercent,
      completed_at: new Date().toISOString()
    });
  } catch (e) {
    console.error("Error saving session:", e);
  }
}
