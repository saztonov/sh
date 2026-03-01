import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

STATE_FILE = Path(__file__).parent.parent / "secrets" / "classroom_state.json"
OUTPUT_FILE = Path(__file__).parent.parent / "data" / "classroom_courses.json"

EXCLUDED_TITLES = {"Календарь", "Список заданий", "Архив курсов", "Настройки"}
ALLOWED_SECTIONS = ["На этой неделе", "Следующая неделя"]

def clean_due(due_raw: str) -> str:
    due_raw = due_raw.strip()
    m = re.match(
        r"^(Сегодня(?:,\s*\d{1,2}:\d{2})?|Завтра|"
        r"(?:пн|вт|ср|чт|пт|сб|вс),\s*\d{1,2}\s*[а-яё]+\.?|"
        r"(?:понедельник|вторник|среда|среду|четверг|пятница|суббота|воскресенье)"
        r"(?:,\s*\d{1,2}\s*[а-яё]+\.?\s*(?:\d{4}\s*г\.?)?)?)",
        due_raw, re.IGNORECASE
    )
    return m.group(1).strip() if m else due_raw

def collect_section_items(page) -> list[str]:
    """Собирает li.MHxtic из всех сейчас раскрытых нужных секций."""
    return page.evaluate("""
        (allowedSections) => {
            const results = [];
            const sections = Array.from(document.querySelectorAll("div.ovsVve.jlxRme"));
            for (const sec of sections) {
                const text = sec.innerText || "";
                if (!allowedSections.some(s => text.includes(s))) continue;
                if (sec.getAttribute("aria-expanded") !== "true") continue;
                sec.querySelectorAll("li.MHxtic").forEach(item => {
                    const t = item.innerText.trim();
                    if (t && !results.includes(t)) results.push(t);
                });
            }
            return results;
        }
    """, ALLOWED_SECTIONS)

def fetch_courses():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(storage_state=str(STATE_FILE))
        page = context.new_page()

        # ── Курсы ──────────────────────────────────────────────────────────
        print("Открываю Google Classroom...")
        page.goto("https://classroom.google.com/u/0/h")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)

        course_cards = page.query_selector_all("div.GRvzhf.YVvGBb")
        seen = set()
        courses = []
        for card in course_cards:
            title = card.inner_text().strip()
            if title and title not in EXCLUDED_TITLES and title not in seen:
                seen.add(title)
                courses.append({"title": title})
        course_titles = [c["title"] for c in courses]
        print(f"Найдено курсов: {len(courses)}")

        # ── Задания ────────────────────────────────────────────────────────
        print("\nЗагружаю невыполненные задания...")
        page.goto("https://classroom.google.com/u/0/a/not-turned-in/all")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(4000)

        all_raw_items = []

        # Сначала собираем уже раскрытые нужные секции
        already_open = collect_section_items(page)
        if already_open:
            print(f"  Уже раскрыто: {len(already_open)} заданий")
            all_raw_items.extend(already_open)

        # Затем по очереди раскрываем каждую свёрнутую нужную секцию
        # и сразу собираем — до того как аккордеон свернёт её обратно
        section_divs = page.query_selector_all("div.ovsVve.jlxRme")
        for div in section_divs:
            try:
                text = div.inner_text().strip()
                expanded = div.get_attribute("aria-expanded")
                is_needed = any(s in text for s in ALLOWED_SECTIONS)
                if not is_needed or expanded == "true":
                    continue

                btn = div.query_selector("button")
                if not btn:
                    continue

                print(f"  Раскрываю секцию: {text[:30].strip()}")
                btn.click()
                page.wait_for_timeout(1000)

                # Собираем сразу пока секция открыта
                items = collect_section_items(page)
                new_items = [i for i in items if i not in all_raw_items]
                print(f"    → найдено новых заданий: {len(new_items)}")
                all_raw_items.extend(new_items)

            except Exception as e:
                print(f"  Ошибка: {e}")

        print(f"\n  Итого li: {len(all_raw_items)}")

        # Парсим каждый элемент
        assignments = []
        for raw in all_raw_items:
            matched_course = next((c for c in course_titles if c in raw), None)
            if not matched_course:
                continue

            course_pos = raw.index(matched_course)
            title = raw[:course_pos].strip()
            after_course = raw[course_pos + len(matched_course):].strip()
            first_line = after_course.split("\n")[0].strip()
            due = clean_due(first_line)

            if title:
                assignments.append({
                    "title": title,
                    "course": matched_course,
                    "due": due,
                    "status": "not_turned_in"
                })

        print(f"\nНайдено заданий (эта + след. неделя): {len(assignments)}")
        for a in assignments:
            print(f"  [{a['course']}] {a['title']} | {a['due']}")

        # ── Сохраняем ─────────────────────────────────────────────────────
        OUTPUT_FILE.parent.mkdir(exist_ok=True)
        result = {"courses": courses, "assignments": assignments}
        OUTPUT_FILE.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nСохранено: {OUTPUT_FILE}")

        browser.close()

if __name__ == "__main__":
    fetch_courses()
