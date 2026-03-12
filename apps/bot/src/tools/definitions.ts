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
      'Получить список домашних заданий. Можно фильтровать по периоду (today/tomorrow/week), конкретной дате, предмету или статусу выполнения.',
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
    description: 'Получить детальную информацию о задании, включая описание и список вложенных файлов.',
    parameters: z.object({
      id: z.string().describe('UUID задания'),
    }),
    execute: (args) => exec.getAssignmentDetails(args),
  }),

  toggle_assignment_completion: tool({
    description: 'Отметить задание выполненным или снять отметку. Переключает текущий статус.',
    parameters: z.object({
      id: z.string().describe('UUID задания'),
    }),
    execute: (args) => exec.toggleAssignmentCompletion(args),
  }),

  get_schedule: tool({
    description: 'Получить расписание уроков на неделю с домашними заданиями.',
    parameters: z.object({
      week_offset: z.number().int().default(0)
        .describe('Смещение недели: 0 — текущая, 1 — следующая, -1 — прошлая'),
    }),
    execute: (args) => exec.getSchedule(args),
  }),

  list_tutors: tool({
    description: 'Получить список всех репетиторов с их предметами.',
    parameters: z.object({}),
    execute: () => exec.listTutors(),
  }),

  create_tutor: tool({
    description: 'Добавить нового репетитора.',
    parameters: z.object({
      name: z.string().describe('Имя репетитора'),
      subjects: z.array(z.string()).optional().describe('Список предметов'),
    }),
    execute: (args) => exec.createTutor(args),
  }),

  update_tutor: tool({
    description: 'Изменить имя репетитора.',
    parameters: z.object({
      id: z.string().describe('UUID репетитора'),
      name: z.string().describe('Новое имя'),
    }),
    execute: (args) => exec.updateTutor(args),
  }),

  delete_tutor: tool({
    description: 'Удалить репетитора и все его занятия.',
    parameters: z.object({
      id: z.string().describe('UUID репетитора'),
    }),
    execute: (args) => exec.deleteTutor(args),
  }),

  get_tutor_sessions: tool({
    description: 'Получить занятия с репетиторами на неделю.',
    parameters: z.object({
      week_offset: z.number().int().default(0)
        .describe('Смещение недели: 0 — текущая, 1 — следующая'),
    }),
    execute: (args) => exec.getTutorSessions(args),
  }),

  create_tutor_session: tool({
    description: 'Создать занятие с репетитором (разовое или регулярное). Можно передать tutor_id (UUID) или tutor_name (имя) — репетитор будет найден автоматически.',
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
    description: 'Изменить время начала или длительность занятия с репетитором.',
    parameters: z.object({
      id: z.string().describe('UUID занятия'),
      time_start: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('Новое время начала HH:MM'),
      duration_hours: z.number().optional().describe('Новая длительность: 1, 1.5 или 2'),
    }),
    execute: (args) => exec.updateTutorSession(args),
  }),

  reschedule_tutor_session_once: tool({
    description: 'Перенести одно конкретное занятие с репетитором на другую дату/время (остальные не затронуты).',
    parameters: z.object({
      session_id: z.string().describe('UUID регулярного занятия'),
      original_date: z.string().describe('Исходная дата занятия YYYY-MM-DD'),
      new_date: z.string().describe('Новая дата YYYY-MM-DD'),
      new_time: z.string().regex(/^\d{2}:\d{2}$/).describe('Новое время HH:MM'),
    }),
    execute: (args) => exec.rescheduleTutorSessionOnce(args),
  }),

  delete_tutor_session: tool({
    description: 'Удалить занятие с репетитором.',
    parameters: z.object({
      id: z.string().describe('UUID занятия'),
    }),
    execute: (args) => exec.deleteTutorSession(args),
  }),

  get_file_info: tool({
    description: 'Получить информацию о файле-вложении задания, включая ссылку для скачивания.',
    parameters: z.object({
      attachment_id: z.string().describe('UUID вложения'),
    }),
    execute: (args) => exec.getFileInfo(args),
  }),

  trigger_scraper: tool({
    description: 'Запустить парсинг домашних заданий из Google Classroom или Eljur.',
    parameters: z.object({
      source: z.enum(['google', 'eljur', 'all'])
        .describe('Источник: google, eljur или all (оба)'),
    }),
    execute: (args) => exec.triggerScraper(args),
  }),
};
