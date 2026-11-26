import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

def has_arabic(text):
    return bool(re.search(r"[\u0600-\u06FF]", str(text or "")))

def norm_text(text):
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", str(text or "").lower())).strip()

def is_enriched(q):
    exp = str(q.get("explanation") or "").strip()
    rule = str(q.get("rule") or "").strip()
    return bool(rule and exp and exp.lower() != "none" and has_arabic(rule) and has_arabic(exp))

API_KEY = os.environ.get("GEMINI_API_KEY", "")  # Set via: export GEMINI_API_KEY=your_key
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={API_KEY}"
CACHE_FILE = "questions_cache.json"

CHAPTER_CONTEXT = {
    "1.1": "أساسيات فيزياء الأشعة: إنتاج الأشعة السينية، أنبوب الأشعة، الكاثود والأنود، بؤرة التركيز، تأثير عقب الأنود (Anode Heel Effect)، عوامل التعريض (kVp, mAs, 15% rule)، قانون التربيع العكسي، تفاعلات الأشعة مع المادة (التأثير الكهروضوئي، تشتت كومبتون)، الترشيح، الشبيكات (Grids)، وأجهزة الكشف الرقمية (CR, DR).",
    "1.2": "أوضاع التصوير الإشعاعي (Positioning): الأطراف العلوية والسفلية، الجمجمة وعظام الوجه (Caldwell, Towne, Waters, SMV)، الصدر والبطن، العمود الفقري (C-spine, T-spine, L-spine, Scotty dog)، الحوض ومفصل الورك (AP pelvis, Frog-leg, Judet)، والمسالك البولية والجهاز الهضمي.",
    "1.3": "الأشعة المقطعية (CT): أجيال أجهزة CT، الكواشف وحلقات الانزلاق، مرشح ربطة العنق (Bow-tie)، أرقام هونسفيلد (HU)، عرض النافذة ومستوى النافذة (WW & WL)، معامل الخطوة (Pitch)، تقنيات إعادة البناء (FBP vs Iterative)، المعالجة البعدية (MIP, MPR, MinIP)، المصنوعات والتكلسات (Artifacts)، وجرعات الإشعاع (CTDI, DLP).",
    "1.4": "الرنين المغناطيسي (MRI): المغناطيسية النووية، ذرة الهيدروجين، معادلة لارمور، زمن الاسترخاء T1 وT2 وT2*، المتواليات النبضية (SE, FSE, GRE, STIR, FLAIR, DWI/ADC)، الترميز المكاني، فضاء كيه (k-space)، المصنوعات الصورية (Chemical shift, Aliasing, Susceptibility)، وإجراءات السلامة ومناطق الرنين (SAR limits, Cryogen quench).",
    "1.5": "الموجات فوق الصوتية (US): فيزياء الموجات فوق الصوتية، التأثير الكهروإجهادي (Piezoelectric effect)، أنواع المحولات (Linear, Convex, Phased array)، التوهين والانعكاس والانكسار، الدقة المحورية والجانبية، أنماط العرض (A-mode, B-mode, M-mode)، تقنيات الدوبلر (Color, Spectral, Power Doppler, Nyquist limit)، والمصنوعات الصورية (Shadowing, Enhancement, Reverberation, Mirror).",
    "1.6": "الطب النووي (NM): الاضمحلال الإشعاعي (ألفا، بيتا، غاما)، النظائر الصيدلانية المشعة (Tc-99m, I-123, I-131, F-18 FDG)، كاميرا غاما والموازيات (Collimators)، أجهزة SPECT وPET، مراقبة الجودة (Uniformity, Spatial resolution)، والتطبيقات السريرية كمسح العظام والتروية القلبية.",
    "2.1": "رعاية المرضى في التصوير الطبي: الأخلاقيات المهنية والموافقة المستنيرة، العلامات الحيوية (الضغط، النبض، الحرارة، التنفس)، مكافحة العدوى والاحتياطات القياسية واحتياطات العزل، ميكانيكا الجسم ونقل المريض، إدارة الطوارئ والحساسية والإنعاش القلبي الرئوي (CPR)، والتعامل مع القساطر والأنابيب الوريدية.",
    "2.2": "إدارة الجودة والجرعة في التصوير الطبي: ضمان ومراقبة الجودة (QA/QC)، اختبارات الأجهزة الدورية (المحاذاة، دقة kVp والوقت، الخطية والتكرارية)، تقييم بؤرة التركيز، شاشات العرض واختبار SMPTE، تحليل الإعادة (Reject analysis)، ومقاييس جرعة المريض (ESD, DAP/KAP).",
    "2.3": "صبغات التباين والأدوية: وسائط التباين الإيجابية (الباريوم، اليود الأيوني وغير الأيوني) والسلبية (الهواء، CO2)، الأسمولية واللزوجة، التفاعلات التحسسية الخفيفة والمتوسطة والشديدة وطرق علاجها، الاعتلال الكلوي الناجم عن التباين وإدارة الميتفورمين، والتسرب الموضعي (Extravasation).",
    "2.4": "البيولوجيا الإشعاعية والوقاية: التأثيرات المباشرة وغير المباشرة، التأثيرات الحتمية (Deterministic) والعشوائية (Stochastic)، قانون بيرغوني وتريبوندو، وحدات القياس الإشعاعي (Gy, Sv, C/kg)، مبادئ الوقاية الإشعاعية (ALARA، الوقت، المسافة، التدريع)، الحدود الجرعية المهنية والعامة وللحوامل، وأجهزة قياس الجرعات الشخصية (TLD, OSL).",
    "2.5": "الإحصاء الحيوي ومنهجية البحث: أنواع المتغيرات (الاسمية، الترتيبية، الكمية)، مقاييس النزعة المركزية (المتوسط، الوسيط، المنوال) والتشتت، مقاييس الاختبارات التشخيصية (الحساسية Sensitivity، النوعية Specificity، القيمة التنبؤية الموجبة والسالبة)، تصاميم الدراسات، واختبارات الفرضيات ومستوى المعنوية (p-value).",
    "3.1": "أسئلة شهرية شاملة لاختبار الهيئة SRTLE تغطي كافة تخصصات الأشعة والتصوير الطبي والفيزياء الإشعاعية ورعاية المرضى.",
    "3.2": "أسئلة شهرية شاملة لاختبار الهيئة SRTLE تغطي الحالات السريرية والتشخيصية وتطبيقات الأشعة المتقدمة.",
    "3.3": "أسئلة شهرية شاملة لاختبار الهيئة SRTLE تحاكي أسئلة الاختبار الفعلي للهيئة السعودية للتخصصات الصحية.",
    "4.1": "ملحق صور الأشعة في SRTLE: تشريح عظمي، صور أشعة سينية، رنين مغناطيسي، أشعة مقطعية، موجات صوتية، مصنوعات، وكسور.",
    "4.2": "ملحق المعادلات والفيزياء الرياضية في SRTLE: حسابات عوامل التعريض، قوانين التربيع، وحدات الحرارة، والجرعات الإشعاعية.",
    "4.3": "ملحق التشريح المرضي والأمراض في التصوير الطبي: علامات الأمراض الشعاعية، المسميات التشريحية، وأنماط الكسور."
}

def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_cache(cache):
    temp_file = CACHE_FILE + ".tmp"
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    os.replace(temp_file, CACHE_FILE)

def call_gemini_batch(batch, chapter_context=""):
    items = []
    for q in batch:
        opts = {k: v for k, v in (q.get("options") or {}).items() if v}
        items.append({
            "id": q["id"],
            "question": q["question"],
            "options": opts,
            "answer": q.get("answer", ""),
            "correct_text": opts.get(q.get("answer", ""), ""),
            "existing_explanation": "" if str(q.get("explanation") or "").strip().lower() == "none" else (q.get("explanation", "") or "")
        })

    prompt = f"""أنت خبير معتمد ومؤلف رسمي لاختبار الهيئة السعودية للتخصصات الصحية (SRTLE) لأخصائيي الأشعة والتكنولوجيا الطبية.
سياق المحاضرات والمنهج الدراسي لهذا القسم المستخرج من حقيبة SRTLE Survival Guide:
{chapter_context}

المطلوب: لكل سؤال من الأسئلة الطبية التالية، قدم:
1. rule: "💡 قاعدة ذهبية لحل السؤال" - قاعدة مباشرة وموجزة وسريعة تلخص المفهوم الأساسي أو القانون الرياضي أو المعيار السريري بالعربي.
2. explanation: "📖 الشرح والحل التفصيلي" - شرح علمي رصين ومفصل بالعربي يوضح:
   - لماذا هذا الخيار هو الصحيح علمياً وإشعاعياً.
   - تفنيد سريع لعدم صحة الخيارات الأخرى مع كتابة المصطلحات الطبية بالإنجليزية بين قوسين لتعزيز الفهم.

الأسئلة:
{json.dumps(items, ensure_ascii=False)}

أرجع النتيجة حصراً كمصفوفة JSON صحيحة وفق البنية التالية:
[
  {{
    "id": 1,
    "rule": "...",
    "explanation": "..."
  }}
]
"""
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"response_mime_type": "application/json"}
    }
    
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                API_URL,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                txt = res["candidates"][0]["content"]["parts"][0]["text"]
                return json.loads(txt)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_time = (attempt + 1) * 5
                time.sleep(wait_time)
            elif e.code >= 500:
                time.sleep(2)
            else:
                print(f"HTTP Error {e.code}: {e.read().decode('utf-8', errors='ignore')[:160]}", flush=True)
                break
        except Exception:
            time.sleep(2)
            
    return None

def update_json_files(mock6, cache, q_data=None):
    # Apply cache to mock6
    for q in mock6:
        qid_str = str(q["id"])
        if qid_str in cache:
            q["rule"] = cache[qid_str]["rule"]
            q["explanation"] = cache[qid_str]["explanation"]
            
    with open("mock6-questions.json", "w", encoding="utf-8") as f:
        json.dump(mock6, f, ensure_ascii=False, indent=2)
        
    # Also update questions.json (exact + normalized match + direct q_ cache)
    if os.path.exists("questions.json"):
        if q_data is None:
            with open("questions.json", "r", encoding="utf-8") as f:
                q_data = json.load(f)
            
        mock6_exact = {q["question"].strip().lower(): q for q in mock6}
        mock6_norm = {norm_text(q["question"]): q for q in mock6}
        for q in q_data:
            raw_txt = q.get("question", "").strip().lower()
            m_q = mock6_exact.get(raw_txt) or mock6_norm.get(norm_text(raw_txt))
            if m_q:
                if m_q.get("rule"):
                    q["rule"] = m_q["rule"]
                if m_q.get("explanation") and str(m_q["explanation"]).lower() != "none":
                    q["explanation"] = m_q["explanation"]
                if m_q.get("image") and not q.get("image"):
                    q["image"] = m_q["image"]
            q_cache_key = f"qs_{q.get('chapter_id', '0')}_{q.get('id')}"
            if q_cache_key in cache:
                q["rule"] = cache[q_cache_key]["rule"]
                q["explanation"] = cache[q_cache_key]["explanation"]
                    
        with open("questions.json", "w", encoding="utf-8") as f:
            json.dump(q_data, f, ensure_ascii=False, indent=2)
    return q_data

def run_batches(items, cache, key_fn, mock6, q_data, batch_size=12, label="mock6"):
    batches = [items[i:i + batch_size] for i in range(0, len(items), batch_size)]
    print(f"[{label}] تقسيم {len(items)} سؤال إلى {len(batches)} دفعة (حجم الدفعة {batch_size})", flush=True)
    completed_count = 0

    def process_batch(batch):
        ch_id = str(batch[0].get("chapter_id", "1.1"))
        context = CHAPTER_CONTEXT.get(ch_id, "")
        # Ensure clean numeric/string IDs matching batch lookup
        results = call_gemini_batch(batch, context)
        return batch, results

    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_batch = {executor.submit(process_batch, b): b for b in batches}
        for future in as_completed(future_to_batch):
            batch, results = future.result()
            if results and isinstance(results, list):
                res_by_id = {str(r.get("id")): r for r in results if isinstance(r, dict)}
                matched_in_batch = 0
                for q in batch:
                    res = res_by_id.get(str(q["id"]))
                    if not res:
                        continue
                    rule = str(res.get("rule", "")).strip()
                    explanation = str(res.get("explanation", "")).strip()
                    if rule and explanation:
                        cache[key_fn(q)] = {"rule": rule, "explanation": explanation}
                        q["rule"] = rule
                        q["explanation"] = explanation
                        matched_in_batch += 1
                completed_count += matched_in_batch
                print(f"[{label}] [{completed_count}/{len(items)}] ({completed_count*100/len(items):.1f}%) حفظ دفعة ({matched_in_batch}/{len(batch)})", flush=True)
                save_cache(cache)
                if completed_count % 60 < batch_size or completed_count >= len(items):
                    update_json_files(mock6, cache, q_data)
            else:
                print(f"[{label}] تنبيه: فشلت دفعة مكونة من {len(batch)} أسئلة، ستُعاد في الجولة التالية.", flush=True)

def main():
    if not API_KEY:
        print("ERROR: GEMINI_API_KEY environment variable is not set.", flush=True)
        sys.exit(1)

    print("=== بدء معالجة وتوليد شروحات وقواعد أسئلة اختبار الهيئة (SRTLE) ===", flush=True)
    
    with open("mock6-questions.json", "r", encoding="utf-8") as f:
        mock6 = json.load(f)
    print(f"تم تحميل {len(mock6)} سؤال من mock6-questions.json", flush=True)
    
    cache = load_cache()
    print(f"تم تحميل {len(cache)} شرح وقاعدة من الذاكرة المؤقتة (Cache)", flush=True)

    # Apply existing cache first
    for q in mock6:
        qid_str = str(q["id"])
        if qid_str in cache and cache[qid_str].get("rule") and cache[qid_str].get("explanation"):
            q["rule"] = cache[qid_str]["rule"]
            q["explanation"] = cache[qid_str]["explanation"]

    # Pass loop for mock6-questions.json
    for attempt_pass, bsize in [(1, 12), (2, 6), (3, 3)]:
        pending = [q for q in mock6 if not is_enriched(q)]
        if not pending:
            break
        print(f"--- [mock6 جولة {attempt_pass}] الأسئلة المتبقية: {len(pending)} ---", flush=True)
        run_batches(pending, cache, lambda q: str(q["id"]), mock6, None, batch_size=bsize, label="mock6")

    # Sync to questions.json and enrich any remaining unique questions in questions.json
    q_data = update_json_files(mock6, cache)
    if q_data is not None:
        for attempt_pass, bsize in [(1, 12), (2, 6), (3, 3)]:
            pending_qs = [q for q in q_data if not is_enriched(q)]
            if not pending_qs:
                break
            print(f"--- [questions.json جولة {attempt_pass}] الأسئلة المتبقية: {len(pending_qs)} ---", flush=True)
            run_batches(pending_qs, cache, lambda q: f"qs_{q.get('chapter_id', '0')}_{q.get('id')}", mock6, q_data, batch_size=bsize, label="questions.json")
            update_json_files(mock6, cache, q_data)

    save_cache(cache)
    update_json_files(mock6, cache, q_data)
    print("\n✅ تم الانتهاء بنجاح من توليد وتحديث كافة الأسئلة والشروحات والقواعد!", flush=True)

if __name__ == "__main__":
    main()
