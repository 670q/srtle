// ==========================================
// CORE STATE MANAGEMENT & APP INITIALIZATION
// ==========================================
let allQuestions = [];
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
          <div class="quiz-timer" id="quiz-timer-box" style="display: none;">
            ⏱️ <span id="timer-display">04:00:00</span>
          </div>
        </div>
        
        <div class="questions-nav-grid" id="q-nav-grid">
          <!-- Button navigations will be generated here -->
        </div>
        
        <div style="font-size: 0.8rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--border-color); padding-top: 12px;">
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
        document.getElementById("q-explanation-text").innerHTML = `الإجابة الصحيحة هي: (${q.answer.toUpperCase()})`;
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
  // If exam, clear auto-save
  if (appState.quiz.mode === "exam") {
    clearExamStateLocally();
    
    // Save exam score
    const correctCount = appState.quiz.questions.filter(q => appState.quiz.answers[q.id] === q.answer).length;
    const scaledScore = Math.round(200 + (correctCount / appState.quiz.questions.length) * 600);
    appState.history.lastExamScore = scaledScore;
    localStorage.setItem("srtle-last-exam-score", scaledScore);
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
          ${q.explanation ? q.explanation.replace(/\n/g, "<br>") : `الإجابة الصحيحة هي: (${q.answer.toUpperCase()})`}
        </div>
      </div>
    `;
    
    container.appendChild(card);
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
