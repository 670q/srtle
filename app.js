// ==========================================
// CORE STATE MANAGEMENT & APP INITIALIZATION
// ==========================================
let allQuestions = [];
let supabaseClient = null;
let appState = {
  currentView: "loading", // 'loading', 'dashboard', 'quiz', 'results'
  quiz: {
    mode: null,          // 'practice' or 'exam'
    chapterId: null,     // Selected chapter ID (for practice)
    questions: [],       // Array of question objects in this session
    currentIndex: 0,     // Current active question index
    answers: {},         // question_id (numeric string key) -> selected option ('a', 'b', 'c', 'd')
    flags: new Set(),    // Set of flagged question indices
    timeRemaining: 0,    // Time left in seconds (for exam mode)
    timerInterval: null, // Timer interval reference
    checkedAnswers: new Set() // Set of question indices where "Check Answer" was clicked (for practice mode)
  },
  history: {
    practiceProgress: {}, // chapter_id -> { answeredCount: X, totalCount: Y, correctAnswers: Z }
    lastExamScore: null   // Scaled score of last exam
  }
};

const CHAPTERS_INFO = {
  "1.1": "Essentials of Radiologic Physics",
  "1.2": "Positioning in radiography",
  "1.3": "CT imaging for Radiologic Technologist",
  "1.4": "MR Imaging for Radiologic Technologist",
  "1.5": "US imaging for Radiologic Technologist",
  "1.6": "NM Imagining for Radiologic Technologist",
  "2.1": "Patient Care in Medical Imaging",
  "2.2": "Quality Management and Dose in Medical Imaging",
  "2.3": "Contrast Media and Medication in Medical Imaging",
  "2.4": "Radiobiology and Radiation Protection",
  "2.5": "Biostatistics and Research Methodology",
  "3": "Monthly questions"
};

// ==========================================
// INIT APP
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  setupTheme();
  setupGlobalEvents();
  initSupabase(); // Initialize Supabase Client
  await loadQuestionsData();
});

// ==========================================
// THEME & STYLING CONTROLLER
// ==========================================
function setupTheme() {
  const themeToggle = document.getElementById("theme-toggle");
  
  // Set initial theme
  const savedScheme = localStorage.getItem("color-scheme") || "light dark";
  setScheme(savedScheme);

  themeToggle.addEventListener("click", () => {
    const currentScheme = document.querySelector('meta[name="color-scheme"]').content;
    const newScheme = currentScheme === "dark" ? "light" : "dark";
    setScheme(newScheme);
  });

  // Listen to OS theme changes if theme is not pinned
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem("color-scheme") || localStorage.getItem("color-scheme") === "light dark") {
      setScheme("light dark");
    }
  });
}

function setScheme(scheme) {
  const metaColorScheme = document.querySelector('meta[name="color-scheme"]');
  metaColorScheme.content = scheme;
  localStorage.setItem("color-scheme", scheme);

  // Apply styling hook to document element
  if (scheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else if (scheme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    // System default
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }
}

// ==========================================
// DATA LOADING
// ==========================================
async function loadQuestionsData() {
  try {
    const response = await fetch("questions.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    allQuestions = await response.ok ? await response.json() : [];
    
    // Load progress stats
    loadProgressFromStorage();
    
    // Switch to dashboard
    switchView("dashboard");
  } catch (error) {
    console.error("Error loading questions database:", error);
    document.getElementById("app-view").innerHTML = `
      <div class="loading-screen">
        <span style="font-size: 3rem;">⚠️</span>
        <h3>عذراً، فشل تحميل بنك الأسئلة</h3>
        <p>يرجى التأكد من وجود ملف questions.json في المجلد الرئيسي للمشروع.</p>
        <button class="btn btn-primary" onclick="window.location.reload()">إعادة المحاولة</button>
      </div>
    `;
  }
}

// Load practice statistics from localStorage
function loadProgressFromStorage() {
  const savedProgress = localStorage.getItem("srtle-practice-progress");
  if (savedProgress) {
    appState.history.practiceProgress = JSON.parse(savedProgress);
  } else {
    // Initialize empty stats
    Object.keys(CHAPTERS_INFO).forEach(chapId => {
      appState.history.practiceProgress[chapId] = {
        correct: 0,
        wrong: 0,
        answered: {} // question_id -> true/false (correct/incorrect)
      };
    });
  }
  appState.history.lastExamScore = localStorage.getItem("srtle-last-exam-score");
}

function saveProgressToStorage() {
  localStorage.setItem("srtle-practice-progress", JSON.stringify(appState.history.practiceProgress));
  saveProgressToCloud(false); // Sync in background if authenticated
}

// ==========================================
// VIEW ROUTER
// ==========================================
function switchView(viewName) {
  appState.currentView = viewName;
  const mainView = document.getElementById("app-view");
  
  // Clear any running timers
  if (appState.quiz.timerInterval) {
    clearInterval(appState.quiz.timerInterval);
    appState.quiz.timerInterval = null;
  }
  
  if (viewName === "dashboard") {
    renderDashboard(mainView);
  } else if (viewName === "quiz") {
    renderQuizView(mainView);
  } else if (viewName === "results") {
    renderResultsView(mainView);
  }
}

function setupGlobalEvents() {
  // Logo home navigation
  document.getElementById("go-home").addEventListener("click", () => {
    // If in mid-exam, confirm before going home
    if (appState.currentView === "quiz" && appState.quiz.mode === "exam") {
      showConfirmationModal(
        "الخروج إلى الرئيسية",
        "هل أنت متأكد من رغبتك في الخروج إلى لوحة التحكم؟ سيتم فقدان تقدمك في المحاكاة الحالية.",
        () => switchView("dashboard")
      );
    } else {
      switchView("dashboard");
    }
  });
}

// ==========================================
// VIEW RENDERER: DASHBOARD
// ==========================================
function renderDashboard(container) {
  // Calculate general statistics
  const totalQuestionsCount = allQuestions.length;
  
  // Calculate completed questions count in practice
  let totalPracticed = 0;
  let totalCorrectPracticed = 0;
  Object.keys(appState.history.practiceProgress).forEach(chapId => {
    const chapData = appState.history.practiceProgress[chapId];
    totalPracticed += Object.keys(chapData.answered).length;
    totalCorrectPracticed += chapData.correct;
  });
  
  const practicePercent = totalQuestionsCount > 0 
    ? Math.round((totalPracticed / totalQuestionsCount) * 100) 
    : 0;

  let lastExamText = appState.history.lastExamScore 
    ? `${appState.history.lastExamScore} / 800 (${appState.history.lastExamScore >= 530 ? 'ناجح' : 'راسب'})`
    : "لا يوجد اختبارات سابقة";

  container.innerHTML = `
    <div class="dashboard-container">
      
      <!-- Welcome Banner -->
      <section class="welcome-banner">
        <div>
          <h2>أهلاً بك في منصة التدريب الذكية للاختبار المهني</h2>
          <p>تدرب على الأسئلة الحقيقية والشروحات المنهجية لاجتياز اختبار ترخيص الهيئة لتقنيي الأشعة (SRTLE).</p>
        </div>
      </section>

      <!-- Stats Grid -->
      <section class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">📚</div>
          <div class="stat-details">
            <h3>بنك الأسئلة الشامل</h3>
            <div class="stat-number">${totalQuestionsCount} سؤالاً</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon">📈</div>
          <div class="stat-details">
            <h3>نسبة إنجاز التدريب</h3>
            <div class="stat-number">${practicePercent}%</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">🏆</div>
          <div class="stat-details">
            <h3>آخر اختبار محاكي</h3>
            <div class="stat-number" style="font-size: 1.25rem;">${lastExamText}</div>
          </div>
        </div>
      </section>

      <!-- Quick Start Mode Selector -->
      <section class="quick-start-section">
        
        <!-- Practice Mode Card -->
        <div class="start-card">
          <h3>وضع التدريب حسب الفصول</h3>
          <p>اختر أحد فصول المنهج المحددة للتدرب على جميع الأسئلة الخاصة به. يعرض هذا الوضع الإجابة الصحيحة والتعليل فوراً بعد الإجابة لمساعدتك في الاستيعاب.</p>
          <button class="btn btn-primary" id="btn-start-practice">ابدأ التدريب الفوري</button>
        </div>
        
        <!-- Exam Simulator Card -->
        <div class="start-card">
          <h3>محاكي اختبار الهيئة الحقيقي</h3>
          <p>اختبر جاهزيتك من خلال محاكاة حقيقية لبيئة الاختبار المعتمد من الهيئة: 200 سؤال عشوائي، ومدة زمنية قدرها 4 ساعات (240 دقيقة)، دون عرض الإجابات حتى نهاية الاختبار.</p>
          <button class="btn btn-success" id="btn-start-exam">دخول محاكي الاختبار</button>
        </div>

      </section>

      <!-- Chapters Section -->
      <section class="chapters-section">
        <div class="chapters-header">
          <h2>فصول المنهج والاختبار (${Object.keys(CHAPTERS_INFO).length} فصلاً)</h2>
        </div>
        
        <div class="chapters-grid" id="chapters-list-container">
          <!-- Chapters cards will be inserted here -->
        </div>
      </section>

    </div>
  `;

  // Render Chapters list
  const chaptersContainer = document.getElementById("chapters-list-container");
  Object.keys(CHAPTERS_INFO).forEach(chapId => {
    const chapName = CHAPTERS_INFO[chapId];
    const chapQuestions = allQuestions.filter(q => q.chapter_id === chapId);
    const totalCount = chapQuestions.length;
    
    // Get progress
    const chapProgress = appState.history.practiceProgress[chapId] || { correct: 0, wrong: 0, answered: {} };
    const answeredCount = Object.keys(chapProgress.answered).length;
    const progressPercent = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;
    
    const card = document.createElement("div");
    card.className = "chapter-card";
    card.innerHTML = `
      <div>
        <div class="chapter-title">
          <span class="chapter-number">${chapId}</span>
          <span>${chapName}</span>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
        </div>
        <div class="chapter-meta">
          <span>تم حل: ${answeredCount} / ${totalCount} سؤال</span>
          <span>${progressPercent}%</span>
        </div>
      </div>
    `;
    
    card.addEventListener("click", () => {
      startPracticeSession(chapId);
    });
    
    chaptersContainer.appendChild(card);
  });

  // Start Exam simulator click handler
  document.getElementById("btn-start-exam").addEventListener("click", () => {
    startExamSession();
  });

  // Scroll to Chapters list on "Start Practice" click
  document.getElementById("btn-start-practice").addEventListener("click", () => {
    document.querySelector(".chapters-section").scrollIntoView({ behavior: "smooth" });
  });
}

// ==========================================
// SESSION CONTROLLERS
// ==========================================
function startPracticeSession(chapterId) {
  // Filter questions for the selected chapter
  const chapQuestions = allQuestions.filter(q => q.chapter_id === chapterId);
  
  if (chapQuestions.length === 0) {
    alert("هذا الفصل لا يحتوي على أسئلة حالياً.");
    return;
  }

  // Set quiz state
  appState.quiz.mode = "practice";
  appState.quiz.chapterId = chapterId;
  // Load questions in sequential order as requested ("وتظهر لي كل الاسىلة حقته")
  appState.quiz.questions = [...chapQuestions].sort((a, b) => a.id - b.id);
  appState.quiz.currentIndex = 0;
  appState.quiz.answers = {};
  appState.quiz.flags = new Set();
  appState.quiz.timeRemaining = 0;
  appState.quiz.checkedAnswers = new Set();

  // Switch to quiz view
  switchView("quiz");
}

function startExamSession() {
  if (allQuestions.length < 200) {
    alert("لا توجد أسئلة كافية في بنك الأسئلة لإنشاء اختبار 200 سؤال.");
    return;
  }

  // Set quiz state
  appState.quiz.mode = "exam";
  appState.quiz.chapterId = null;
  
  // Select 200 questions randomly from all questions
  const shuffled = [...allQuestions].sort(() => 0.5 - Math.random());
  appState.quiz.questions = shuffled.slice(0, 200);
  
  appState.quiz.currentIndex = 0;
  appState.quiz.answers = {};
  appState.quiz.flags = new Set();
  appState.quiz.timeRemaining = 240 * 60; // 240 minutes (4 hours)
  appState.quiz.checkedAnswers = new Set();

  // Try to load any auto-saved exam from localStorage if exists
  const savedExam = localStorage.getItem("srtle-active-exam");
  if (savedExam) {
    const examData = JSON.parse(savedExam);
    showConfirmationModal(
      "استئناف اختبار سابق",
      "تم العثور على اختبار محاكي غير مكتمل. هل ترغب في استئنافه أم بدء اختبار جديد تماماً؟",
      () => {
        // Resume
        appState.quiz.questions = examData.questions;
        appState.quiz.currentIndex = examData.currentIndex;
        appState.quiz.answers = examData.answers;
        appState.quiz.flags = new Set(examData.flags);
        appState.quiz.timeRemaining = examData.timeRemaining;
        switchView("quiz");
      },
      () => {
        // Start fresh
        localStorage.removeItem("srtle-active-exam");
        switchView("quiz");
      },
      "استئناف السابق",
      "بدء جديد"
    );
  } else {
    switchView("quiz");
  }
}

function saveExamStateLocally() {
  if (appState.quiz.mode === "exam") {
    const examData = {
      questions: appState.quiz.questions,
      currentIndex: appState.quiz.currentIndex,
      answers: appState.quiz.answers,
      flags: Array.from(appState.quiz.flags),
      timeRemaining: appState.quiz.timeRemaining
    };
    localStorage.setItem("srtle-active-exam", JSON.stringify(examData));
  }
}

function clearExamStateLocally() {
  localStorage.removeItem("srtle-active-exam");
}

// ==========================================
// VIEW RENDERER: QUIZ / TEST WINDOW
// ==========================================
function renderQuizView(container) {
  container.innerHTML = `
    <div class="quiz-container">
      
      <!-- Collapsible Sidebar Question Grid -->
      <aside class="quiz-sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title" id="quiz-sidebar-title">قائمة الأسئلة</h3>
          <button class="btn btn-secondary btn-sm toggle-nav-btn" id="btn-toggle-nav" style="display: none; padding: 4px 10px; font-size: 0.8rem; font-family: 'Cairo', sans-serif;">أظهر القائمة</button>
          <div class="quiz-timer" id="quiz-timer-box" style="display: none;">
            ⏱️ <span id="timer-display">04:00:00</span>
          </div>
        </div>
        
        <div class="questions-nav-grid" id="q-nav-grid">
          <!-- Button navigations will be generated here -->
        </div>
        
        <div class="quiz-nav-legend" style="font-size: 0.8rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--border-color); padding-top: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 12px; height: 12px; border-radius: 2px; background-color: var(--primary-rgba); border: 1px solid var(--primary);"></span>
            <span>أسئلة تمت إجابتها</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 12px; height: 12px; border-radius: 2px; background-color: var(--warning-bg); border: 1px solid var(--warning);"></span>
            <span>أسئلة مميزة للمراجعة</span>
          </div>
        </div>
      </aside>

      <!-- Main Question Details -->
      <section class="quiz-main">
        <div class="chapter-info-badge" id="q-chapter-badge">
          📁 <span>الفصل: </span>
        </div>
        
        <!-- Question Card -->
        <div class="question-card">
          <div class="question-header">
            <span class="question-number-display" id="q-num-lbl">سؤال 1 من 200</span>
            <div class="question-actions-top">
              <button class="btn btn-secondary" id="btn-flag-question" style="font-size: 0.85rem; padding: 6px 12px;">
                🚩 تمييز للمراجعة
              </button>
            </div>
          </div>
          
          <div class="question-text-box en-text" id="q-text-box">
            <!-- Question text -->
          </div>
          
          <div class="options-list" id="q-options-list">
            <!-- Multiple options -->
          </div>
          
          <!-- Immediate Check / Explanation Area (Practice Mode Only) -->
          <div id="practice-actions-container" style="display: none; justify-content: flex-start; margin-top: 10px;">
            <button class="btn btn-primary" id="btn-check-answer">تحقق من الإجابة</button>
          </div>
          
          <div class="explanation-box" id="q-explanation-box" style="display: none;">
            <div class="explanation-title">💡 الشرح والتوضيح:</div>
            <div class="explanation-text en-text" id="q-explanation-text">
              <!-- Explanation text -->
            </div>
          </div>
        </div>

        <!-- Navigation buttons footer -->
        <div class="quiz-footer">
          <button class="btn btn-secondary" id="btn-prev-question">السابق</button>
          
          <div class="quiz-footer-right">
            <button class="btn btn-danger" id="btn-submit-quiz">إنهاء الاختبار</button>
            <button class="btn btn-primary" id="btn-next-question">التالي</button>
          </div>
        </div>
      </section>

    </div>
  `;

  // Start timer if in Exam mode
  if (appState.quiz.mode === "exam") {
    const timerBox = document.getElementById("quiz-timer-box");
    timerBox.style.display = "flex";
    
    updateTimerDisplay();
    
    appState.quiz.timerInterval = setInterval(() => {
      appState.quiz.timeRemaining--;
      updateTimerDisplay();
      
      // Auto-save every 10 seconds
      if (appState.quiz.timeRemaining % 10 === 0) {
        saveExamStateLocally();
      }
      
      if (appState.quiz.timeRemaining <= 0) {
        clearInterval(appState.quiz.timerInterval);
        alert("انتهى وقت الاختبار! سيتم تقديم الإجابات تلقائياً.");
        submitQuizAnswers();
      }
    }, 1000);
  }

  // Bind footer buttons
  document.getElementById("btn-prev-question").addEventListener("click", () => navigateQuestion(-1));
  document.getElementById("btn-next-question").addEventListener("click", () => navigateQuestion(1));
  document.getElementById("btn-submit-quiz").addEventListener("click", () => confirmSubmitQuiz());
  document.getElementById("btn-flag-question").addEventListener("click", () => toggleQuestionFlag());

  // Bind toggle button for mobile navigation grid
  const btnToggleNav = document.getElementById("btn-toggle-nav");
  if (btnToggleNav) {
    btnToggleNav.addEventListener("click", () => {
      const sidebar = document.querySelector(".quiz-sidebar");
      if (sidebar) {
        const isExpanded = sidebar.classList.toggle("nav-expanded");
        btnToggleNav.innerText = isExpanded ? "أخفِ القائمة" : "أظهر القائمة";
      }
    });
  }

  if (appState.quiz.mode === "practice") {
    document.getElementById("btn-submit-quiz").innerText = "إنهاء التدريب";
    document.getElementById("practice-actions-container").style.display = "none";
  } else {
    document.getElementById("btn-submit-quiz").innerText = "إنهاء الاختبار";
  }

  // Populate sidebar question list buttons
  generateSidebarGrid();
  
  // Render the current question
  showQuestion(appState.quiz.currentIndex);
}

function updateTimerDisplay() {
  const display = document.getElementById("timer-display");
  const timerBox = document.getElementById("quiz-timer-box");
  
  const time = appState.quiz.timeRemaining;
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = time % 60;
  
  display.innerText = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  // Dynamic color warning triggers
  if (time <= 600) { // 10 minutes
    timerBox.className = "quiz-timer timer-critical";
  } else if (time <= 1800) { // 30 minutes
    timerBox.className = "quiz-timer timer-warn";
  } else {
    timerBox.className = "quiz-timer";
  }
}

function generateSidebarGrid() {
  const grid = document.getElementById("q-nav-grid");
  grid.innerHTML = "";
  
  appState.quiz.questions.forEach((q, idx) => {
    const btn = document.createElement("button");
    btn.className = "q-nav-btn";
    btn.innerText = idx + 1;
    btn.id = `q-nav-btn-${idx}`;
    
    // Add dynamic classes
    updateNavButtonStyles(idx, btn);
    
    btn.addEventListener("click", () => {
      saveExamStateLocally();
      showQuestion(idx);
      // Auto-collapse grid on mobile when a question is clicked
      if (window.innerWidth <= 992) {
        const sidebar = document.querySelector(".quiz-sidebar");
        const btnToggleNav = document.getElementById("btn-toggle-nav");
        if (sidebar && btnToggleNav) {
          sidebar.classList.remove("nav-expanded");
          btnToggleNav.innerText = "أظهر القائمة";
        }
      }
    });
    
    grid.appendChild(btn);
  });

  const sidebarTitle = document.getElementById("quiz-sidebar-title");
  if (appState.quiz.mode === "practice") {
    sidebarTitle.innerText = "فصل " + appState.quiz.chapterId;
  } else {
    sidebarTitle.innerText = "أسئلة المحاكاة";
  }
}

function updateNavButtonStyles(index, element = null) {
  const btn = element || document.getElementById(`q-nav-btn-${index}`);
  if (!btn) return;
  
  const q = appState.quiz.questions[index];
  
  // Remove existing state classes
  btn.classList.remove("active", "answered", "flagged");
  
  if (index === appState.quiz.currentIndex) {
    btn.classList.add("active");
  } else if (appState.quiz.flags.has(index)) {
    btn.classList.add("flagged");
  } else if (appState.quiz.answers[q.id] !== undefined) {
    btn.classList.add("answered");
  }
}

function showQuestion(index) {
  // Update old index button styling
  const prevIndex = appState.quiz.currentIndex;
  appState.quiz.currentIndex = index;
  updateNavButtonStyles(prevIndex);
  updateNavButtonStyles(index);
  
  // Scroll side navigation button into view
  const activeBtn = document.getElementById(`q-nav-btn-${index}`);
  if (activeBtn) {
    activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const q = appState.quiz.questions[index];
  
  // Set headers
  document.getElementById("q-num-lbl").innerText = `سؤال ${index + 1} من ${appState.quiz.questions.length}`;
  document.getElementById("q-chapter-badge").querySelector("span").innerText = `الفصل ${q.chapter_id}: ${q.chapter_name}`;
  
  // Set question text (using innerHTML since it might have raw markup or newlines)
  const questionTextBox = document.getElementById("q-text-box");
  questionTextBox.innerHTML = q.question.replace(/\n/g, "<br>");
  
  // Manage Flag state text
  const flagBtn = document.getElementById("btn-flag-question");
  if (appState.quiz.flags.has(index)) {
    flagBtn.innerText = "🚩 إلغاء التمييز";
    flagBtn.className = "btn btn-secondary";
  } else {
    flagBtn.innerText = "🏳️ تمييز للمراجعة";
    flagBtn.className = "btn btn-secondary";
  }

  // Populate options
  const optionsList = document.getElementById("q-options-list");
  optionsList.innerHTML = "";
  
  // Check if this question's answer is already checked (Practice Mode only)
  const isAnswerChecked = appState.quiz.checkedAnswers.has(index);
  const selectedAns = appState.quiz.answers[q.id];
  
  Object.keys(q.options).forEach(optKey => {
    const optVal = q.options[optKey];
    if (!optVal) return;
    
    const optionDiv = document.createElement("div");
    optionDiv.className = "option-item";
    if (selectedAns === optKey) {
      optionDiv.classList.add("selected");
    }
    
    // In practice mode, show correctness styles if checked
    if (isAnswerChecked) {
      if (optKey === q.answer) {
        optionDiv.classList.add("correct");
      } else if (selectedAns === optKey) {
        optionDiv.classList.add("incorrect");
      }
    }
    
    optionDiv.innerHTML = `
      <input type="radio" name="quiz-options" value="${optKey}" ${selectedAns === optKey ? 'checked' : ''} ${isAnswerChecked ? 'disabled' : ''}>
      <span class="option-key">${optKey.toUpperCase()}</span>
      <span class="option-text en-text">${optVal}</span>
    `;
    
    if (!isAnswerChecked) {
      optionDiv.addEventListener("click", () => {
        selectOption(optKey);
      });
    }
    
    optionsList.appendChild(optionDiv);
  });

  // Manage Explanation box
  const expBox = document.getElementById("q-explanation-box");
  
  if (appState.quiz.mode === "practice") {
    if (isAnswerChecked) {
      if (q.explanation) {
        expBox.style.display = "block";
        document.getElementById("q-explanation-text").innerHTML = q.explanation.replace(/\n/g, "<br>");
      } else {
        expBox.style.display = "block";
        document.getElementById("q-explanation-text").innerHTML = `
          <div>الإجابة الصحيحة هي: (${q.answer.toUpperCase()})</div>
          <div class="ai-explanation-box" id="ai-explain-container-${q.id}">
            ${getAiExplanationHtml(q)}
          </div>
        `;
        bindAiExplainButton(q);
      }
    } else {
      expBox.style.display = "none";
    }
  } else {
    expBox.style.display = "none";
  }

  // Manage navigation footer buttons disabled states
  document.getElementById("btn-prev-question").disabled = (index === 0);
  document.getElementById("btn-next-question").disabled = (index === appState.quiz.questions.length - 1);
}

function selectOption(optionKey) {
  const q = appState.quiz.questions[appState.quiz.currentIndex];
  appState.quiz.answers[q.id] = optionKey;
  
  // Highlight selected DOM element
  const items = document.querySelectorAll(".option-item");
  items.forEach(item => {
    const radio = item.querySelector("input");
    if (radio.value === optionKey) {
      item.classList.add("selected");
      radio.checked = true;
    } else {
      item.classList.remove("selected");
    }
  });

  // In practice mode, check and grade immediately
  if (appState.quiz.mode === "practice") {
    const idx = appState.quiz.currentIndex;
    appState.quiz.checkedAnswers.add(idx);
    
    // Save progress stats to localStorage
    const chapProgress = appState.history.practiceProgress[q.chapter_id];
    
    // Track if this is a first-time answer
    if (!(q.id in chapProgress.answered)) {
      const isCorrect = (optionKey === q.answer);
      chapProgress.answered[q.id] = isCorrect;
      if (isCorrect) {
        chapProgress.correct++;
      } else {
        chapProgress.wrong++;
      }
      saveProgressToStorage();
    }
    
    // Re-render question to apply highlight and show explanation immediately
    showQuestion(idx);
  }
  
  saveExamStateLocally();
}

function toggleQuestionFlag() {
  const idx = appState.quiz.currentIndex;
  if (appState.quiz.flags.has(idx)) {
    appState.quiz.flags.delete(idx);
  } else {
    appState.quiz.flags.add(idx);
  }
  
  // Re-render headers/side panel state
  showQuestion(idx);
  updateNavButtonStyles(idx);
  saveExamStateLocally();
}

function navigateQuestion(direction) {
  saveExamStateLocally();
  const nextIdx = appState.quiz.currentIndex + direction;
  if (nextIdx >= 0 && nextIdx < appState.quiz.questions.length) {
    showQuestion(nextIdx);
  }
}

// Practice Mode - Immediate grading logic
function checkPracticeAnswer() {
  const idx = appState.quiz.currentIndex;
  const q = appState.quiz.questions[idx];
  const userAns = appState.quiz.answers[q.id];
  
  if (!userAns) return;
  
  appState.quiz.checkedAnswers.add(idx);
  
  // Save progress stats to localStorage
  const chapProgress = appState.history.practiceProgress[q.chapter_id];
  
  // Track if this is a first-time answer
  if (!(q.id in chapProgress.answered)) {
    const isCorrect = (userAns === q.answer);
    chapProgress.answered[q.id] = isCorrect;
    if (isCorrect) {
      chapProgress.correct++;
    } else {
      chapProgress.wrong++;
    }
    saveProgressToStorage();
  }
  
  // Re-render question to apply highlight and show explanation
  showQuestion(idx);
}

// ==========================================
// SUBMIT QUIZ
// ==========================================
function confirmSubmitQuiz() {
  const unansweredCount = appState.quiz.questions.length - Object.keys(appState.quiz.answers).length;
  
  let descText = "";
  if (appState.quiz.mode === "exam") {
    descText = `هل أنت متأكد من رغبتك في تسليم الاختبار وإنهاء المحاكاة؟`;
    if (unansweredCount > 0) {
      descText += ` ملاحظة: لديك ${unansweredCount} سؤال لم تجب عليه بعد!`;
    }
  } else {
    descText = "هل ترغب في إنهاء جلسة التدريب الحالية والرجوع للرئيسية؟";
  }

  showConfirmationModal(
    appState.quiz.mode === "exam" ? "تسليم الاختبار" : "إنهاء التدريب",
    descText,
    () => {
      submitQuizAnswers();
    }
  );
}

function submitQuizAnswers() {
  const correctCount = appState.quiz.questions.filter(q => appState.quiz.answers[q.id] === q.answer).length;
  
  // If exam, clear auto-save
  if (appState.quiz.mode === "exam") {
    clearExamStateLocally();
    
    // Save exam score
    const scaledScore = Math.round(200 + (correctCount / appState.quiz.questions.length) * 600);
    appState.history.lastExamScore = scaledScore;
    localStorage.setItem("srtle-last-exam-score", scaledScore);
    
    // Record exam results to Cloud database
    saveExamResultToCloud(scaledScore, correctCount, appState.quiz.questions.length);
  }
  
  switchView("results");
}

// ==========================================
// VIEW RENDERER: RESULTS
// ==========================================
function renderResultsView(container) {
  // Calculations
  const questionsList = appState.quiz.questions;
  const answers = appState.quiz.answers;
  const totalCount = questionsList.length;
  
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;
  
  // Chapter-wise breakdown
  const chapStats = {};
  
  questionsList.forEach(q => {
    // Initialize chapter stats
    if (!chapStats[q.chapter_id]) {
      chapStats[q.chapter_id] = { name: q.chapter_name, total: 0, correct: 0 };
    }
    chapStats[q.chapter_id].total++;
    
    const userAns = answers[q.id];
    if (userAns === undefined) {
      unansweredCount++;
    } else if (userAns === q.answer) {
      correctCount++;
      chapStats[q.chapter_id].correct++;
    } else {
      incorrectCount++;
    }
  });

  const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  
  // Scaled score details
  // SCFHS scales scores between 200 and 800. Passing is 530.
  const scaledScore = Math.round(200 + (correctCount / totalCount) * 600);
  const isPassed = appState.quiz.mode === "exam" ? (scaledScore >= 530) : (accuracy >= 66);

  container.innerHTML = `
    <div class="results-container">
      
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h2>نتائج الاختبار والتقييم التفصيلي</h2>
        <button class="btn btn-primary" id="btn-results-home">الرجوع للرئيسية</button>
      </div>

      <!-- Score Summary Grid -->
      <section class="score-summary-grid">
        
        <!-- Circle card -->
        <div class="score-donut-card">
          <div class="score-circle" style="--score-percent: ${accuracy}; --score-color: ${isPassed ? 'var(--success)' : 'var(--danger)'};">
            <span class="score-display">${scaledScore}</span>
            <span class="score-scale-lbl">من 800</span>
          </div>
          
          <div class="status-badge ${isPassed ? 'pass' : 'fail'}">
            ${isPassed ? '🎉 ناجح (مؤهل)' : '⚠️ راسب (غير مؤهل)'}
          </div>
          
          <p style="font-size: 0.9rem; color: var(--text-secondary);">
            درجة النجاح المعتمدة في الهيئة هي 530 من 800
          </p>
        </div>

        <!-- Stats details card -->
        <div class="results-details-card">
          <div>
            <h3 style="margin-bottom: 16px;">ملخص الأداء</h3>
            <div class="stats-inline">
              <div class="stat-item">
                <div class="stat-item-num" style="color: var(--success);">${correctCount}</div>
                <div class="stat-item-lbl">صحيحة</div>
              </div>
              <div class="stat-item">
                <div class="stat-item-num" style="color: var(--danger);">${incorrectCount}</div>
                <div class="stat-item-lbl">خاطئة</div>
              </div>
              <div class="stat-item">
                <div class="stat-item-num" style="color: var(--text-muted);">${unansweredCount}</div>
                <div class="stat-item-lbl">غير محلولة</div>
              </div>
            </div>
          </div>
          
          <div>
            <p style="font-size: 1rem; color: var(--text-secondary); margin-bottom: 16px;">
              لقد أجبت بشكل صحيح على <strong>${correctCount}</strong> من أصل <strong>${totalCount}</strong> سؤال بنسبة دقة بلغت <strong>${accuracy}%</strong>.
            </p>
            <div class="results-actions">
              ${appState.quiz.mode === 'exam' ? '<button class="btn btn-success" id="btn-retry-exam">إجراء محاكاة جديدة</button>' : ''}
              <button class="btn btn-secondary" id="btn-scroll-review">مراجعة الأسئلة بالتفصيل</button>
            </div>
          </div>
        </div>

      </section>

      <!-- Chapters Breakdown Section -->
      <section class="results-chapters-card">
        <h3>الأداء التفصيلي حسب فصول الاختبار</h3>
        <div class="results-chapters-list">
          <!-- Chapters list -->
          ${Object.keys(chapStats).map(chapId => {
            const stat = chapStats[chapId];
            const pct = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
            return `
              <div class="res-chap-item">
                <div class="res-chap-header">
                  <span>الفصل ${chapId}: ${stat.name}</span>
                  <span>${stat.correct} من ${stat.total} (${pct}%)</span>
                </div>
                <div class="progress-bar-container">
                  <div class="progress-bar-fill" style="width: ${pct}%; background-color: ${pct >= 66 ? 'var(--success)' : 'var(--danger)'};"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>

      <!-- Detailed Question Review Section -->
      <section class="review-section" id="detailed-review-section">
        <h2>مراجعة الأسئلة والإجابات النموذجية</h2>
        
        <div class="review-filters">
          <button class="filter-btn active" data-filter="all">الكل (${totalCount})</button>
          <button class="filter-btn" data-filter="correct" style="color: var(--success);">الإجابات الصحيحة (${correctCount})</button>
          <button class="filter-btn" data-filter="incorrect" style="color: var(--danger);">الإجابات الخاطئة (${incorrectCount})</button>
          <button class="filter-btn" data-filter="flagged" style="color: var(--warning);">المميزة للمراجعة (${appState.quiz.flags.size})</button>
        </div>

        <div class="review-list" id="review-questions-list">
          <!-- Questions review list will render dynamically -->
        </div>
      </section>

    </div>
  `;

  // Bind Events
  document.getElementById("btn-results-home").addEventListener("click", () => switchView("dashboard"));
  
  if (appState.quiz.mode === "exam") {
    document.getElementById("btn-retry-exam").addEventListener("click", () => startExamSession());
  }

  document.getElementById("btn-scroll-review").addEventListener("click", () => {
    document.getElementById("detailed-review-section").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Filter Buttons binding
  const filterBtns = document.querySelectorAll(".filter-btn");
  filterBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      filterBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderReviewList(btn.getAttribute("data-filter"));
    });
  });

  // Initial render of review questions
  renderReviewList("all");
}

function renderReviewList(filter) {
  const container = document.getElementById("review-questions-list");
  container.innerHTML = "";
  
  const questionsList = appState.quiz.questions;
  const answers = appState.quiz.answers;
  
  let renderCount = 0;

  questionsList.forEach((q, idx) => {
    const userAns = answers[q.id];
    const isCorrect = (userAns === q.answer);
    
    // Check filters
    if (filter === "correct" && (!userAns || !isCorrect)) return;
    if (filter === "incorrect" && userAns && isCorrect) return;
    if (filter === "flagged" && !appState.quiz.flags.has(idx)) return;
    
    renderCount++;
    
    const card = document.createElement("div");
    card.className = "review-item-card";
    
    // Set status badge details
    let badgeClass = "unanswered";
    let badgeText = "غير محلول";
    if (userAns !== undefined) {
      badgeClass = isCorrect ? "correct" : "incorrect";
      badgeText = isCorrect ? "إجابة صحيحة" : "إجابة خاطئة";
    }
    
    card.innerHTML = `
      <div class="review-item-header">
        <span>السؤال ${idx + 1} | الفصل ${q.chapter_id}</span>
        <div style="display: flex; gap: 8px; align-items: center;">
          ${appState.quiz.flags.has(idx) ? '<span style="font-size: 1.1rem;">🚩</span>' : ''}
          <span class="review-item-badge ${badgeClass}">${badgeText}</span>
        </div>
      </div>
      
      <div class="question-text-box en-text">${q.question.replace(/\n/g, "<br>")}</div>
      
      <div class="options-list">
        ${Object.keys(q.options).map(optKey => {
          const optVal = q.options[optKey];
          if (!optVal) return '';
          
          let optClass = "";
          if (optKey === q.answer) {
            optClass = "correct"; // Always green
          } else if (userAns === optKey) {
            optClass = "incorrect"; // User chose wrong option -> red
          }
          
          return `
            <div class="option-item ${optClass}" style="cursor: default;">
              <span class="option-key">${optKey.toUpperCase()}</span>
              <span class="option-text en-text">${optVal}</span>
            </div>
          `;
        }).join('')}
      </div>

      <div class="explanation-box" style="display: block; margin-top: 10px;">
        <div class="explanation-title">💡 الشرح والتعليل:</div>
        <div class="explanation-text en-text">
          ${q.explanation ? q.explanation.replace(/\n/g, "<br>") : `
            <div>الإجابة الصحيحة هي: (${q.answer.toUpperCase()})</div>
            <div class="ai-explanation-box" id="ai-explain-container-${q.id}">
              ${getAiExplanationHtml(q)}
            </div>
          `}
        </div>
      </div>
    `;
    
    container.appendChild(card);
    if (!q.explanation) {
      bindAiExplainButton(q);
    }
  });

  if (renderCount === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-secondary); background-color: var(--bg-secondary); border-radius: var(--border-radius-md); border: 1px solid var(--border-color);">
        لا توجد أسئلة تطابق الفلتر المختار.
      </div>
    `;
  }
}

// ==========================================
// CUSTOM DIALOG / CONFIRMATION MODAL
// ==========================================
function showConfirmationModal(title, message, onConfirm, onCancel = null, confirmText = "نعم، تأكيد", cancelText = "تراجع") {
  // Create Modal Overlay
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-title">${title}</div>
      <div class="modal-desc">${message}</div>
      <div class="modal-buttons">
        <button class="btn btn-danger" id="modal-btn-confirm">${confirmText}</button>
        <button class="btn btn-secondary" id="modal-btn-cancel">${cancelText}</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Focus confirm button
  document.getElementById("modal-btn-confirm").focus();
  
  // Bind buttons
  document.getElementById("modal-btn-confirm").addEventListener("click", () => {
    document.body.removeChild(overlay);
    if (onConfirm) onConfirm();
  });
  
  document.getElementById("modal-btn-cancel").addEventListener("click", () => {
    document.body.removeChild(overlay);
    if (onCancel) onCancel();
  });
}

// ==========================================
// SUPABASE INTEGRATION ENGINE
// ==========================================

// Initialize client
function initSupabase() {
  const config = window.SUPABASE_CONFIG || {};
  const storedUrl = localStorage.getItem("srtle-supabase-url") || config.url || "";
  const storedKey = localStorage.getItem("srtle-supabase-key") || config.anonKey || "";
  
  if (storedUrl && storedKey) {
    try {
      supabaseClient = supabase.createClient(storedUrl, storedKey);
      console.log("Supabase Client initialized successfully.");
      setupAuthListener();
    } catch (e) {
      console.error("Failed to initialize Supabase:", e);
    }
  } else {
    updateProfileHeader(null); // Offline/Disconnected state
  }
}

// Listen to Auth state changes
function setupAuthListener() {
  if (!supabaseClient) return;
  
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log("Auth State Changed:", event);
    if (session) {
      updateProfileHeader(session.user);
      // Automatically load user progress from database
      await loadProgressFromCloud();
    } else {
      updateProfileHeader(null);
      // Clear current progress cache from local state or reload
    }
  });
}

// Update the user profile UI in the top header
function updateProfileHeader(user) {
  const container = document.getElementById("user-profile-area");
  if (!container) return;
  
  if (user) {
    // Logged in: show user avatar dropdown
    const firstLetter = (user.email || "U").charAt(0).toUpperCase();
    container.innerHTML = `
      <button class="profile-avatar-btn" id="profile-menu-btn" title="حساب المستخدم">${firstLetter}</button>
      <div class="profile-menu" id="profile-dropdown-menu">
        <div class="menu-user-info">
          <div>مسجل الدخول كـ:</div>
          <div class="menu-user-email">${user.email}</div>
        </div>
        <button class="menu-item" id="menu-sync-now">🔄 مزامنة التقدم الآن</button>
        <button class="menu-item" id="menu-view-history">📊 سجل اختبارات المحاكاة</button>
        <button class="menu-item" id="menu-open-settings">⚙️ إعدادات ربط Supabase</button>
        <button class="menu-item" id="menu-open-gemini-settings">🔑 إعدادات مفتاح Gemini</button>
        <button class="menu-item menu-item-danger" id="menu-logout">🚪 تسجيل الخروج</button>
      </div>
    `;
    
    // Toggle dropdown visibility
    const btn = document.getElementById("profile-menu-btn");
    const menu = document.getElementById("profile-dropdown-menu");
    
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("show");
    });
    
    // Close dropdown on click outside
    document.addEventListener("click", () => {
      menu.classList.remove("show");
    });
    
    // Bind menu actions
    document.getElementById("menu-sync-now").addEventListener("click", async () => {
      await saveProgressToCloud(true);
    });
    document.getElementById("menu-view-history").addEventListener("click", () => {
      showExamHistoryModal();
    });
    document.getElementById("menu-open-settings").addEventListener("click", () => {
      showSupabaseSettingsModal();
    });
    document.getElementById("menu-open-gemini-settings").addEventListener("click", () => {
      showGeminiSettingsModal();
    });
    document.getElementById("menu-logout").addEventListener("click", async () => {
      showConfirmationModal(
        "تسجيل الخروج",
        "هل أنت متأكد من رغبتك في تسجيل الخروج؟",
        async () => {
          await supabaseClient.auth.signOut();
          localStorage.removeItem("srtle-practice-progress");
          window.location.reload();
        }
      );
    });
  } else {
    // Logged out / Disconnected: show Login or Setup settings button
    const hasConfig = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.anonKey) || localStorage.getItem("srtle-supabase-key");
    if (hasConfig) {
      container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 0.75rem; color: var(--success); background-color: var(--success-bg); padding: 4px 8px; border-radius: 4px; font-weight: 700; display: inline-block;">متصل بقاعدة البيانات ✅</span>
          <button id="btn-login-modal" class="btn btn-primary btn-sm" style="font-family: 'Cairo', sans-serif;">
            تسجيل الدخول 🔑
          </button>
        </div>
      `;
      document.getElementById("btn-login-modal").addEventListener("click", () => showLoginModal());
    } else {
      // Prompt user to connect Supabase
      container.innerHTML = `
        <button id="btn-setup-supabase" class="btn btn-secondary btn-sm" style="font-family: 'Cairo', sans-serif; background-color: var(--warning-bg); border-color: var(--warning); color: var(--warning);">
          ربط قاعدة البيانات ⚠️
        </button>
      `;
      document.getElementById("btn-setup-supabase").addEventListener("click", () => showSupabaseSettingsModal());
    }
  }
}

// Show the Login/Signup Modal
function showLoginModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  
  overlay.innerHTML = `
    <div class="modal-content" style="max-width: 400px; text-align: right;">
      <div class="auth-tabs">
        <button class="auth-tab active" id="tab-signin">تسجيل دخول</button>
        <button class="auth-tab" id="tab-signup">حساب جديد</button>
      </div>
      
      <div class="form-alert" id="auth-alert"></div>
      
      <div class="form-group">
        <label for="auth-email">البريد الإلكتروني</label>
        <input type="email" id="auth-email" placeholder="example@domain.com" required>
      </div>
      
      <div class="form-group">
        <label for="auth-password">كلمة المرور</label>
        <input type="password" id="auth-password" placeholder="••••••••" required>
      </div>
      
      <div style="display: flex; gap: 12px; margin-top: 8px;">
        <button class="btn btn-primary" id="btn-submit-auth" style="flex: 1; font-family: 'Cairo', sans-serif;">تسجيل الدخول</button>
        <button class="btn btn-secondary" id="btn-close-auth" style="font-family: 'Cairo', sans-serif;">إلغاء</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const tabSignin = document.getElementById("tab-signin");
  const tabSignup = document.getElementById("tab-signup");
  const btnSubmit = document.getElementById("btn-submit-auth");
  const alertBox = document.getElementById("auth-alert");
  
  let currentTab = "signin";
  
  tabSignin.addEventListener("click", () => {
    currentTab = "signin";
    tabSignin.classList.add("active");
    tabSignup.classList.remove("active");
    btnSubmit.innerText = "تسجيل الدخول";
    alertBox.className = "form-alert";
  });
  
  tabSignup.addEventListener("click", () => {
    currentTab = "signup";
    tabSignup.classList.add("active");
    tabSignin.classList.remove("active");
    btnSubmit.innerText = "إنشاء حساب";
    alertBox.className = "form-alert";
  });
  
  btnSubmit.addEventListener("click", async () => {
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    
    if (!email || !password) {
      alertBox.innerText = "يرجى تعبئة جميع الحقول.";
      alertBox.className = "form-alert error";
      return;
    }
    
    btnSubmit.disabled = true;
    btnSubmit.innerText = "جاري المعالجة...";
    alertBox.className = "form-alert";
    
    try {
      if (currentTab === "signin") {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        alertBox.innerText = "تم تسجيل الدخول بنجاح!";
        alertBox.className = "form-alert success";
        setTimeout(() => {
          document.body.removeChild(overlay);
        }, 1000);
      } else {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        
        alertBox.innerText = "تم التسجيل بنجاح! يرجى مراجعة بريدك الإلكتروني لتأكيد الحساب إذا تطلب الأمر.";
        alertBox.className = "form-alert success";
        setTimeout(() => {
          document.body.removeChild(overlay);
        }, 3000);
      }
    } catch (err) {
      console.error(err);
      alertBox.innerText = err.message || "حدث خطأ ما، يرجى المحاولة لاحقاً.";
      alertBox.className = "form-alert error";
      btnSubmit.disabled = false;
      btnSubmit.innerText = currentTab === "signin" ? "تسجيل الدخول" : "إنشاء حساب";
    }
  });
  
  document.getElementById("btn-close-auth").addEventListener("click", () => {
    document.body.removeChild(overlay);
  });
}

// Show Supabase settings configuration modal
function showSupabaseSettingsModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  
  const config = window.SUPABASE_CONFIG || {};
  const currentUrl = localStorage.getItem("srtle-supabase-url") || config.url || "";
  const currentKey = localStorage.getItem("srtle-supabase-key") || config.anonKey || "";
  
  overlay.innerHTML = `
    <div class="modal-content" style="max-width: 450px; text-align: right;">
      <h3 class="modal-title" style="margin-bottom: 8px;">إعدادات ربط قاعدة البيانات Supabase</h3>
      <p class="modal-desc" style="margin-bottom: 16px;">أدخل بيانات مشروع Supabase الخاص بك لحفظ نتائج الاختبارات وتقدم المراجعة سحابياً.</p>
      
      <div class="form-group">
        <label for="settings-url">رابط المشروع (Project URL)</label>
        <input type="url" id="settings-url" value="${currentUrl}" placeholder="https://xxxx.supabase.co" dir="ltr" required>
      </div>
      
      <div class="form-group">
        <label for="settings-key">مفتاح الوصول العام (Anon Key)</label>
        <input type="password" id="settings-key" value="${currentKey}" placeholder="eyJhbGciOi..." dir="ltr" required>
      </div>
      
      <div style="display: flex; gap: 12px; margin-top: 16px;">
        <button class="btn btn-primary" id="btn-save-settings" style="flex: 1; font-family: 'Cairo', sans-serif;">حفظ البيانات 💾</button>
        <button class="btn btn-secondary" id="btn-close-settings" style="font-family: 'Cairo', sans-serif;">إلغاء</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  document.getElementById("btn-save-settings").addEventListener("click", () => {
    const url = document.getElementById("settings-url").value.trim();
    const key = document.getElementById("settings-key").value.trim();
    
    if (url && key) {
      localStorage.setItem("srtle-supabase-url", url);
      localStorage.setItem("srtle-supabase-key", key);
      document.body.removeChild(overlay);
      
      // Re-initialize client
      initSupabase();
      
      showConfirmationModal(
        "تم الحفظ بنجاح",
        "تم تحديث إعدادات الربط بنجاح! سيتم الآن إعادة تحميل الصفحة لتفعيل الاتصال.",
        () => window.location.reload()
      );
    } else {
      alert("يرجى إدخال الرابط والمفتاح معاً.");
    }
  });
  
  document.getElementById("btn-close-settings").addEventListener("click", () => {
    document.body.removeChild(overlay);
  });
}

// Show simulated exam history modal
async function showExamHistoryModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  
  overlay.innerHTML = `
    <div class="modal-content" style="max-width: 600px; text-align: right;">
      <h3 class="modal-title" style="margin-bottom: 8px;">📊 سجل اختبارات المحاكاة (Exam History)</h3>
      <p class="modal-desc" style="margin-bottom: 16px;">قائمة بنتائج الاختبارات السابقة المحفوظة سحابياً.</p>
      
      <div class="history-table-container">
        <table class="history-table">
          <thead>
            <tr>
              <th>التاريخ والوقت</th>
              <th>الدرجة (من 800)</th>
              <th>الأسئلة الصحيحة</th>
              <th>النتيجة</th>
            </tr>
          </thead>
          <tbody id="history-rows-container">
            <tr>
              <td colspan="4" style="text-align: center; padding: 20px;">جاري تحميل السجل... ⏳</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
        <button class="btn btn-secondary" id="btn-close-history" style="font-family: 'Cairo', sans-serif;">إغلاق</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  document.getElementById("btn-close-history").addEventListener("click", () => {
    document.body.removeChild(overlay);
  });
  
  try {
    const { data: historyData, error } = await supabaseClient
      .from("exam_history")
      .select("*")
      .order("completed_at", { ascending: false });
      
    if (error) throw error;
    
    const rowsContainer = document.getElementById("history-rows-container");
    if (!historyData || historyData.length === 0) {
      rowsContainer.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted);">لا توجد اختبارات سابقة مسجلة.</td>
        </tr>
      `;
      return;
    }
    
    rowsContainer.innerHTML = historyData.map(row => {
      const date = new Date(row.completed_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });
      const pass = row.score >= 530;
      const statusBadge = `<span class="review-item-badge ${pass ? 'correct' : 'incorrect'}">${pass ? 'ناجح' : 'راسب'}</span>`;
      return `
        <tr>
          <td dir="ltr" style="text-align: right;">${date}</td>
          <td style="font-weight: 700;">${row.score}</td>
          <td>${row.correct_count} / ${row.total_questions}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join("");
    
  } catch (err) {
    console.error("Failed to load history:", err);
    document.getElementById("history-rows-container").innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 20px; color: var(--danger-light);">فشل تحميل البيانات: ${err.message}</td>
      </tr>
    `;
  }
}

// ---------------------------------------------------------------------
// DATABASE SYNC WORKFLOWS
// ---------------------------------------------------------------------

// Download practice progress from Supabase Cloud
async function loadProgressFromCloud() {
  if (!supabaseClient) return;
  
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    
    const { data, error } = await supabaseClient
      .from("user_progress")
      .select("practice_progress, last_exam_score")
      .eq("user_id", user.id)
      .maybeSingle();
      
    if (error) throw error;
    
    if (data) {
      console.log("Progress loaded from Supabase Cloud successfully.");
      
      // Merge Cloud progress with local storage progress (take union, prefer correct/new updates)
      const cloudProgress = data.practice_progress || {};
      const localProgressString = localStorage.getItem("srtle-practice-progress");
      const localProgress = localProgressString ? JSON.parse(localProgressString) : {};
      
      // Merge algorithm
      Object.keys(CHAPTERS_INFO).forEach(chapId => {
        const cloudChap = cloudProgress[chapId] || { correct: 0, wrong: 0, answered: {} };
        const localChap = localProgress[chapId] || { correct: 0, wrong: 0, answered: {} };
        
        // Merge answered map
        const mergedAnswered = { ...localChap.answered, ...cloudChap.answered };
        
        // Recalculate correct / wrong counts
        let correctCount = 0;
        let wrongCount = 0;
        Object.keys(mergedAnswered).forEach(qId => {
          if (mergedAnswered[qId] === true) {
            correctCount++;
          } else {
            wrongCount++;
          }
        });
        
        localProgress[chapId] = {
          correct: correctCount,
          wrong: wrongCount,
          answered: mergedAnswered
        };
      });
      
      // Save merged to LocalStorage & appState
      appState.history.practiceProgress = localProgress;
      localStorage.setItem("srtle-practice-progress", JSON.stringify(localProgress));
      
      if (data.last_exam_score) {
        appState.history.lastExamScore = data.last_exam_score;
        localStorage.setItem("srtle-last-exam-score", data.last_exam_score);
      }
      
      // If we are currently on the dashboard, refresh the stats
      if (appState.currentView === "dashboard") {
        switchView("dashboard");
      }
    }
  } catch (err) {
    console.error("Failed to load progress from cloud:", err);
  }
}

// Upload practice progress to Supabase Cloud
async function saveProgressToCloud(showToast = false) {
  if (!supabaseClient) {
    if (showToast) alert("Supabase غير متصل. يرجى تسجيل الدخول أولاً.");
    return;
  }
  
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    
    const progress = appState.history.practiceProgress;
    const score = appState.history.lastExamScore ? parseInt(appState.history.lastExamScore) : null;
    
    const { error } = await supabaseClient
      .from("user_progress")
      .upsert({
        user_id: user.id,
        practice_progress: progress,
        last_exam_score: score,
        updated_at: new Date().toISOString()
      });
      
    if (error) throw error;
    
    console.log("Progress saved to Supabase Cloud successfully.");
    if (showToast) {
      alert("تمت مزامنة تقدمك وحفظه سحابياً بنجاح! 💾✨");
    }
  } catch (err) {
    console.error("Failed to save progress to cloud:", err);
    if (showToast) {
      alert("عذراً، فشل المزامنة السحابية: " + err.message);
    }
  }
}

// Log simulated exam score to Cloud History
async function saveExamResultToCloud(score, correctCount, totalQuestions) {
  if (!supabaseClient) return;
  
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    
    // 1. Insert into history
    const { error: histError } = await supabaseClient
      .from("exam_history")
      .insert({
        user_id: user.id,
        score: score,
        correct_count: correctCount,
        total_questions: totalQuestions,
        completed_at: new Date().toISOString()
      });
      
    if (histError) throw histError;
    
    // 2. Also update overall profile progress
    await saveProgressToCloud(false);
    console.log("Exam score recorded in Cloud successfully.");
  } catch (err) {
    console.error("Failed to log exam score to cloud:", err);
  }
}

// ==========================================
// GEMINI AI EXPLAINER ENGINE
// ==========================================

// Get HTML content for AI explanation container
function getAiExplanationHtml(q) {
  const cachedExplanation = sessionStorage.getItem(`srtle-ai-explain-${q.id}`);
  if (cachedExplanation) {
    return `
      <div class="ai-explanation-content">
        <div style="font-size: 0.8rem; color: var(--primary); font-weight: 700; margin-bottom: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; display: flex; align-items: center; gap: 4px;">
          ✨ شرح طبي مولد بالذكاء الاصطناعي (Gemini):
        </div>
        <div>${cachedExplanation}</div>
      </div>
    `;
  }
  return `<button class="btn-ai-explain" id="btn-ai-explain-${q.id}">✨ شرح الإجابة بالذكاء الاصطناعي (Gemini)</button>`;
}

// Bind click listener to the explain button
function bindAiExplainButton(q) {
  setTimeout(() => {
    const btn = document.getElementById(`btn-ai-explain-${q.id}`);
    if (btn) {
      btn.addEventListener("click", () => {
        generateAiExplanation(q);
      });
    }
  }, 50); // slight delay to ensure it is rendered in DOM
}

// Show Gemini key settings modal
function showGeminiSettingsModal(onSuccess = null) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  
  const currentKey = localStorage.getItem("srtle-gemini-api-key") || window.GEMINI_API_KEY || "";
  
  overlay.innerHTML = `
    <div class="modal-content" style="max-width: 400px; text-align: right;">
      <h3 class="modal-title" style="margin-bottom: 8px;">🔑 إدخال مفتاح Gemini API</h3>
      <p class="modal-desc" style="margin-bottom: 16px;">يرجى إدخال مفتاح Google Gemini API لتوليد شرح طبي مفصل وعالي الدقة للأسئلة.
      <br><br>
      <a href="https://aistudio.google.com/" target="_blank" style="color: var(--primary); font-weight: 700; text-decoration: underline;">اضغط هنا للحصول على مفتاح مجاني من Google AI Studio</a></p>
      
      <div class="form-group">
        <label for="gemini-key-input">Gemini API Key</label>
        <input type="password" id="gemini-key-input" value="${currentKey}" placeholder="AIzaSy..." dir="ltr" required>
      </div>
      
      <div style="display: flex; gap: 12px; margin-top: 16px;">
        <button class="btn btn-primary" id="btn-save-gemini-key" style="flex: 1; font-family: 'Cairo', sans-serif;">تفعيل 🚀</button>
        <button class="btn btn-secondary" id="btn-close-gemini" style="font-family: 'Cairo', sans-serif;">إلغاء</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  document.getElementById("btn-save-gemini-key").addEventListener("click", () => {
    const key = document.getElementById("gemini-key-input").value.trim();
    if (key) {
      localStorage.setItem("srtle-gemini-api-key", key);
      window.GEMINI_API_KEY = key;
      document.body.removeChild(overlay);
      if (onSuccess) onSuccess(key);
      
      showConfirmationModal(
        "تم تفعيل المفتاح",
        "تم حفظ مفتاح Gemini API بنجاح! يمكنك الآن الضغط على زر الشرح للحصول على الشرح الطبي فوراً.",
        null,
        null,
        "موافق"
      );
    } else {
      alert("يرجى إدخال المفتاح أولاً.");
    }
  });
  
  document.getElementById("btn-close-gemini").addEventListener("click", () => {
    document.body.removeChild(overlay);
  });
}

// Generate the explanation from Gemini API
async function generateAiExplanation(q) {
  const container = document.getElementById(`ai-explain-container-${q.id}`);
  if (!container) return;
  
  const apiKey = localStorage.getItem("srtle-gemini-api-key") || window.GEMINI_API_KEY || "";
  
  if (!apiKey) {
    showGeminiSettingsModal(() => {
      generateAiExplanation(q); // retry
    });
    return;
  }
  
  // Show Loading Shimmer
  container.innerHTML = `
    <div class="ai-loading-shimmer">
      <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
        <span>جاري توليد الشرح بالذكاء الاصطناعي (Gemini)...</span>
        <span class="spinner" style="width: 14px; height: 14px; border-width: 2px; display: inline-block;"></span>
      </div>
      <div class="shimmer-line"></div>
      <div class="shimmer-line medium"></div>
      <div class="shimmer-line short"></div>
    </div>
  `;
  
  const optionsText = Object.keys(q.options)
    .map(key => `${key.toUpperCase()}) ${q.options[key]}`)
    .join("\n");
  const correctAnswerText = `${q.answer.toUpperCase()}) ${q.options[q.answer]}`;
  
  const prompt = `You are an expert radiologist and radiography professor explaining questions for the Saudi Commission for Health Specialties (SCFHS) SRTLE licensing exam.

Explain the following radiography exam question in a very simple, concise, and easy-to-understand way in Arabic (شرح مبسط ومباشر). 

Your explanation MUST include two parts:
1. **الشرح المبسط:** A simple explanation of why the correct answer is correct and why other choices are incorrect.
2. **💡 قاعدة ذهبية للحفظ السريع:** A memorable rule, mnemonic, simple comparison, or shorthand trick to remember the core concept easily.

Question:
${q.question}

Options:
${optionsText}

Correct Answer:
${correctAnswerText}

Provide the explanation in clean HTML formatting (use paragraphs with <p>, strong tags like <strong> for emphasis, and bullet points if needed). Do not include any markdown code blocks, backticks, or wrapper tags. Respond only in Arabic.`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });
    
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `HTTP error! status: ${response.status}`);
    }
    
    const resData = await response.json();
    let explanationHtml = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    if (!explanationHtml) {
      throw new Error("لم يتم إرجاع أي شرح من الذكاء الاصطناعي.");
    }
    
    // Clean up markdown HTML code block markers if returned
    explanationHtml = explanationHtml.replace(/```html/g, "").replace(/```/g, "").trim();
    
    // Cache
    sessionStorage.setItem(`srtle-ai-explain-${q.id}`, explanationHtml);
    
    // Display
    container.innerHTML = `
      <div class="ai-explanation-content">
        <div style="font-size: 0.8rem; color: var(--primary); font-weight: 700; margin-bottom: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; display: flex; align-items: center; gap: 4px;">
          ✨ شرح طبي مولد بالذكاء الاصطناعي (Gemini):
        </div>
        <div>${explanationHtml}</div>
      </div>
    `;
  } catch (err) {
    console.error("AI Explain failed:", err);
    container.innerHTML = `
      <div style="color: var(--danger-light); font-size: 0.85rem; padding: 10px; background-color: var(--danger-bg); border-radius: var(--border-radius-sm); border: 1px solid var(--danger-border); display: flex; flex-direction: column; gap: 6px; text-align: right;">
        <div>❌ فشل توليد الشرح بالذكاء الاصطناعي: ${err.message}</div>
        <button class="btn btn-secondary btn-sm" id="btn-retry-ai-${q.id}" style="align-self: flex-end; padding: 4px 10px; font-size: 0.75rem; font-family: 'Cairo', sans-serif;">إعادة المحاولة 🔄</button>
      </div>
    `;
    
    const retryBtn = document.getElementById(`btn-retry-ai-${q.id}`);
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        generateAiExplanation(q);
      });
    }
  }
}
