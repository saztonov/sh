/**
 * Seed schedule script.
 * Parses OLD/расписание.xlsx and inserts data into Supabase schedule_slots table.
 *
 * Usage: npm run seed
 */
import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

/** Map Russian day names to numeric day-of-week (1=Monday ... 5=Friday) */
const DAY_MAP: Record<string, number> = {
  'Понедельник': 1,
  'Вторник': 2,
  'Среда': 3,
  'Четверг': 4,
  'Пятница': 5,
};

interface RawRow {
  день?: string;
  номер?: string | number;
  время?: string;
  урок?: string;
}

interface ScheduleSlotInsert {
  day_of_week: number;
  lesson_number: number;
  time_start: string | null;
  time_end: string | null;
  subject: string;
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('Reading OLD/расписание.xlsx...');
  const workbook = xlsx.readFile('OLD/расписание.xlsx');
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    console.error('No sheets found in workbook');
    process.exit(1);
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    console.error(`Sheet "${sheetName}" not found`);
    process.exit(1);
  }

  const rows = xlsx.utils.sheet_to_json<RawRow>(sheet);
  console.log(`Parsed ${rows.length} rows from sheet "${sheetName}"`);

  const slots: ScheduleSlotInsert[] = [];
  let currentDay = 0;

  for (const row of rows) {
    const dayVal = row['день']?.toString().trim();
    const lessonNum = row['номер'];
    const time = row['время']?.toString().trim();
    const subject = row['урок']?.toString().trim();

    // Update current day when we encounter a day name
    if (dayVal && DAY_MAP[dayVal]) {
      currentDay = DAY_MAP[dayVal];
    }

    // Skip blank separator rows or rows without required data
    if (!subject || lessonNum === undefined || lessonNum === null || !currentDay) {
      continue;
    }

    let timeStart: string | null = null;
    let timeEnd: string | null = null;

    if (time) {
      // Handle various dash characters: en-dash, hyphen, em-dash
      const parts = time.split(/[\u2013\u002D\u2014]/);
      if (parts.length === 2) {
        timeStart = parts[0].trim();
        timeEnd = parts[1].trim();
      }
    }

    slots.push({
      day_of_week: currentDay,
      lesson_number: Number(lessonNum),
      time_start: timeStart,
      time_end: timeEnd,
      subject,
    });
  }

  if (slots.length === 0) {
    console.error('No schedule slots parsed from the spreadsheet');
    process.exit(1);
  }

  console.log(`Parsed ${slots.length} schedule slots`);

  // Log a summary by day
  const byDay = new Map<number, number>();
  for (const slot of slots) {
    byDay.set(slot.day_of_week, (byDay.get(slot.day_of_week) ?? 0) + 1);
  }
  const dayNames = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'];
  for (const [day, count] of byDay.entries()) {
    console.log(`  ${dayNames[day]}: ${count} lessons`);
  }

  // Clear existing slots using a condition that matches all rows
  console.log('Clearing existing schedule_slots...');
  const { error: deleteError } = await supabase
    .from('schedule_slots')
    .delete()
    .gte('day_of_week', 1);

  if (deleteError) {
    console.error('Error clearing schedule_slots:', deleteError);
    process.exit(1);
  }

  // Insert new slots in batches of 50 to avoid payload limits
  console.log('Inserting new schedule slots...');
  const BATCH_SIZE = 50;
  let inserted = 0;

  for (let i = 0; i < slots.length; i += BATCH_SIZE) {
    const batch = slots.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('schedule_slots').insert(batch);

    if (error) {
      console.error(`Error inserting batch ${i / BATCH_SIZE + 1}:`, error);
      process.exit(1);
    }

    inserted += batch.length;
  }

  console.log(`Successfully seeded ${inserted} schedule slots`);
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
