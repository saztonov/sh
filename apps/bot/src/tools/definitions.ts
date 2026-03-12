/**
 * Tool definitions for the AI agent (Vercel AI SDK format).
 * Each tool wraps a corresponding executor function.
 */
import { tool } from 'ai';
import { z } from 'zod';
import * as exec from './executor.js';

export const agentTools = {
  get_assignments: tool({
    description:
      '[ШКОЛА] Получить список школьных домашних заданий (без вложений). Для получения вложений используй get_assignment_details. Фильтры: период (today/tomorrow/week), дата, предмет, статус выполнения.',
    parameters: z.object({
      period: z.enum(['today', 'tomorrow', 'week']).optional()
        .describe('Период: today — сегодня, tomorrow — завтра, week — текущая неделя'),
      date: z.string().optional()
        .describe('Конкретная дата в формате YYYY-MM-DD'),
      subject: z.string().optional()
        .describe('Название предмета (например: Математика, Физика)'),
      is_completed: z.boolean().optional()
        .describe('Фильтр по выполнению: true — только выполненные, false — только невыполненные'),
    }),
    execute: (args) => exec.getAssignments(args),
  }),

  get_assignment_details: tool({
    description: '[ШКОЛА] Детали школьного задания: описание и вложенные файлы.',
    parameters: z.object({
      id: z.string().describe('UUID задания'),
    }),
    execute: (args) => exec.getAssignmentDetails(args),
  }),

  toggle_assignment_completion: tool({
    description: '[ШКОЛА] Отметить школьное задание выполненным или снять отметку.',
    parameters: z.object({
      id: z.string().describe('UUID задания'),
    }),
    execute: (args) => exec.toggleAssignmentCompletion(args),
  }),

  get_schedule: tool({
    description: '[ШКОЛА] Расписание уроков в школе на неделю с привязанными домашними заданиями.',
    parameters: z.object({
      week_offset: z.number().int().default(0)
        .describe('Смещение недели: 0 — текущая, 1 — следующая, -1 — прошлая'),
    }),
    execute: (args) => exec.getSchedule(args),
  }),

  list_tutors: tool({
    description: '[РЕПЕТИТОРЫ] Список всех репетиторов и их предметов.',
    parameters: z.object({}),
    execute: () => exec.listTutors(),
  }),

  create_tutor: tool({
    description: '[РЕПЕТИТОРЫ] Добавить нового репетитора.',
    parameters: z.object({
      name: z.string().describe('Имя репетитора'),
      subjects: z.array(z.string()).optional().describe('Список предметов'),
    }),
    execute: (args) => exec.createTutor(args),
  }),

  update_tutor: tool({
    description: '[РЕПЕТИТОРЫ] Изменить имя репетитора.',
    parameters: z.object({
      id: z.string().describe('UUID репетитора'),
      name: z.string().describe('Новое имя'),
    }),
    execute: (args) => exec.updateTutor(args),
  }),

  delete_tutor: tool({
    description: '[РЕПЕТИТОРЫ] Удалить репетитора и все его занятия.',
    parameters: z.object({
      id: z.string().describe('UUID репетитора'),
    }),
    execute: (args) => exec.deleteTutor(args),
  }),

  get_tutor_sessions: tool({
    description: '[РЕПЕТИТОРЫ] Получить занятия с репетиторами на неделю. НЕ школьное расписание.',
    parameters: z.object({
      week_offset: z.number().int().default(0)
        .describe('Смещение недели: 0 — текущая, 1 — следующая'),
    }),
    execute: (args) => exec.getTutorSessions(args),
  }),

  create_tutor_session: tool({
    description: '[РЕПЕТИТОРЫ] Создать занятие с репетитором (разовое или регулярное). Можно передать tutor_id (UUID) или tutor_name (имя) — репетитор будет найден автоматически.',
    parameters: z.object({
      tutor_id: z.string().optional().describe('UUID репетитора (если известен)'),
      tutor_name: z.string().optional().describe('Имя репетитора (например: Алексей). Используй, если UUID неизвестен'),
      subject: z.string().describe('Предмет'),
      day_of_week: z.number().int().min(1).max(7)
        .describe('День недели: 1 — пн, 2 — вт, ..., 7 — вс'),
      time_start: z.string().regex(/^\d{2}:\d{2}$/).describe('Время начала HH:MM'),
      duration_hours: z.number().refine((v) => [1, 1.5, 2].includes(v))
        .describe('Длительность в часах: 1, 1.5 или 2'),
      is_recurring: z.boolean().describe('true — регулярное, false — разовое'),
      specific_date: z.string().optional().describe('Дата разового занятия YYYY-MM-DD'),
      effective_from: z.string().optional().describe('Дата начала регулярного расписания YYYY-MM-DD'),
    }),
    execute: (args) => exec.createTutorSession(args),
  }),

  update_tutor_session: tool({
    description: '[РЕПЕТИТОРЫ] Изменить время или длительность занятия с репетитором.',
    parameters: z.object({
      id: z.string().describe('UUID занятия'),
      time_start: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('Новое время начала HH:MM'),
      duration_hours: z.number().optional().describe('Новая длительность: 1, 1.5 или 2'),
    }),
    execute: (args) => exec.updateTutorSession(args),
  }),

  reschedule_tutor_session_once: tool({
    description: '[РЕПЕТИТОРЫ] Перенести одно занятие с репетитором на другую дату/время (остальные не затронуты).',
    parameters: z.object({
      session_id: z.string().describe('UUID регулярного занятия'),
      original_date: z.string().describe('Исходная дата занятия YYYY-MM-DD'),
      new_date: z.string().describe('Новая дата YYYY-MM-DD'),
      new_time: z.string().regex(/^\d{2}:\d{2}$/).describe('Новое время HH:MM'),
    }),
    execute: (args) => exec.rescheduleTutorSessionOnce(args),
  }),

  delete_tutor_session: tool({
    description: '[РЕПЕТИТОРЫ] Удалить занятие с репетитором.',
    parameters: z.object({
      id: z.string().describe('UUID занятия'),
    }),
    execute: (args) => exec.deleteTutorSession(args),
  }),

  get_file_info: tool({
    description: '[ФАЙЛЫ] Получить ссылку для скачивания файла-вложения. Принимает UUID вложения из attachments[].id (полученного через get_assignment_details). Возвращает download_url.',
    parameters: z.object({
      attachment_id: z.string().describe('UUID вложения'),
    }),
    execute: (args) => exec.getFileInfo(args),
  }),

  trigger_scraper: tool({
    description: '[СЛУЖЕБНОЕ] Запустить парсинг школьных заданий из Google Classroom или Eljur.',
    parameters: z.object({
      source: z.enum(['google', 'eljur', 'all'])
        .describe('Источник: google, eljur или all (оба)'),
    }),
    execute: (args) => exec.triggerScraper(args),
  }),
};
