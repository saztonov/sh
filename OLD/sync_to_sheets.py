import json
import os
import re
from pathlib import Path
from datetime import datetime, timedelta
from dotenv import load_dotenv
import gspread
from google.oauth2.service_account import Credentials

load_dotenv()

SA_FILE        = os.getenv("GOOGLE_SA_FILE")
SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")
SHEET_NAME     = os.getenv("SCHEDULE_SHEET_NAME", "Расписание")
DATA_FILE      = Path(__file__).parent.parent / "data" / "classroom_courses.json"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

COURSE_MAP = {
    "литература":       "Литература",
    "русский язык":     "Русский язык",
    "биология":         "Биология",
    "физика":           "Физика",
    "химия":            "Химия",
    "алгебра":          "Алгебра",
    "геометрия":        "Геометрия",
    "история":          "История",
    "география":        "География",
    "обществознание":   "Обществознание",
    "английский":       "Англ. яз.",
    "немецкий":         "Немец. яз.",
    "deutsch":          "Немец. яз.",
    "информатика":      "Инф. и ИКТ",
    "икт":              "Инф. и ИКТ",
    "право":            "Право",
    "экономика":        "Экономика",
    "мхк":              "МХК",
    "физкультура":      "Физкультура",
    "физическая":       "Физкультура",
    "ров":              "РоВ",
    "россия":           "РоВ",
    "твис":             "ТВиС",
    "вероятность":      "ТВиС",
    "психолог":         None,
    "старшая школа":    None,
    "архив":            None,
}

MONTH_MAP = {
    "янв": 1, "фев": 2, "мар": 3, "апр": 4, "май": 5, "июн": 6,
    "июл": 7, "авг": 8, "сен": 9, "окт": 10, "ноя": 11, "дек": 12,
}

def course_to_subject(course: str) -> str | None:
    course_l = course.lower()
    for keyword, subject in COURSE_MAP.items():
        if keyword in course_l:
            return subject
    return None

def parse_due_date(due_str: str) -> datetime | None:
    """Возвращает datetime объект дедлайна."""
    s = due_str.strip().lower()
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    if s.startswith("сегодня"):
        return today
    if s.startswith("завтра"):
        return today + timedelta(days=1)

    m = re.search(r"(\d{1,2})\s+([а-яё]+)", s)
    if m:
        day = int(m.group(1))
        month = MONTH_MAP.get(m.group(2)[:3])
        if month:
            year = today.year
            dt = datetime(year, month, day)
            # Если дата уже прошла в этом году — берём следующий
            if dt < today - timedelta(days=1):
                dt = datetime(year + 1, month, day)
            return dt

    return None

def parse_sheet_date(date_str: str, ref_year: int) -> datetime | None:
    """Парсит дату из таблицы формата 'ДД.ММ' в datetime."""
    s = date_str.strip()
    m = re.match(r"(\d{1,2})\.(\d{1,2})", s)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        try:
            return datetime(ref_year, month, day)
        except ValueError:
            return None
    return None

def sync():
    print("Читаю данные из classroom_courses.json...")
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    assignments = data.get("assignments", [])
    print(f"  Заданий из Classroom: {len(assignments)}")

    print("Подключаюсь к Google Sheets...")
    creds = Credentials.from_service_account_file(SA_FILE, scopes=SCOPES)
    client = gspread.authorize(creds)
    sheet = client.open_by_key(SPREADSHEET_ID).worksheet(SHEET_NAME)

    all_rows = sheet.get_all_values()
    print(f"  Строк в таблице: {len(all_rows)}")

    COL_DATE    = 2  # C — дата
    COL_SUBJECT = 5  # F — урок
    COL_ASSIGN  = 6  # G — задания (0-based)

    today = datetime.now()
    ref_year = today.year

    updated = 0
    skipped = 0

    for a in assignments:
        subject = course_to_subject(a["course"])
        if subject is None:
            known = any(kw in a["course"].lower() for kw in COURSE_MAP)
            if known:
                print(f"  – Пропускаю (нет предмета): '{a['course']}'")
            else:
                print(f"  ⚠ Неизвестный курс: '{a['course']}' — добавь в COURSE_MAP")
            skipped += 1
            continue

        due_dt = parse_due_date(a["due"])
        if not due_dt:
            print(f"  ⚠ Не распознана дата '{a['due']}' для '{a['title']}' — пропуск")
            skipped += 1
            continue

        # Ищем ВСЕ строки с нужным предметом до даты дедлайна включительно
        # Берём последнюю подходящую строку (ближайший урок перед дедлайном)
        best_row = None
        best_date = None

        for i, row in enumerate(all_rows):
            if len(row) <= COL_SUBJECT:
                continue
            if row[COL_SUBJECT].strip() != subject:
                continue

            row_dt = parse_sheet_date(row[COL_DATE].strip(), ref_year)
            if row_dt is None:
                continue

            # Строка подходит если дата урока <= дедлайна
            if row_dt <= due_dt:
                if best_date is None or row_dt > best_date:
                    best_date = row_dt
                    best_row = (i + 1, row)

        if not best_row:
            print(f"  ⚠ Урок не найден до {due_dt.strftime('%d.%m')}: предмет='{subject}' | '{a['title']}'")
            skipped += 1
            continue

        row_num, row = best_row
        existing = row[COL_ASSIGN].strip() if len(row) > COL_ASSIGN else ""

        if existing and a["title"] in existing:
            print(f"  = [{row_num}] уже есть: '{a['title']}'")
            continue

        new_value = (existing + "\n" + a["title"]).strip() if existing else a["title"]
        sheet.update_cell(row_num, COL_ASSIGN + 1, new_value)
        print(f"  ✓ [{row_num}] {best_date.strftime('%d.%m')} {subject} → '{a['title']}' (дедлайн: {due_dt.strftime('%d.%m')})")
        updated += 1

    print(f"\nГотово. Обновлено ячеек: {updated}, пропущено: {skipped}")

if __name__ == "__main__":
    sync()
