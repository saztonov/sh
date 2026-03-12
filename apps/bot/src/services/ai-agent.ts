/**
 * AI Agent Service.
 * Manages per-user conversation history and runs the agentic tool-use loop
 * via Vercel AI SDK (provider configurable via AI_PROVIDER env var).
 */
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import type { CoreMessage } from 'ai';
import dayjs from 'dayjs';
import 'dayjs/locale/ru.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { supabase } from '../db.js';
import { agentTools } from '../tools/definitions.js';

dayjs.locale('ru');

// ── Provider setup ─────────────────────────────────────────────────────────────

const DEFAULT_MODELS = {
  cerebras: 'glm-4-32b',
  google: 'gemini-2.0-flash',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'google/gemini-2.0-flash-001',
} as const;

function buildModel() {
  const { provider, model, cerebrasApiKey, googleApiKey, groqApiKey, openrouterApiKey } = config.ai;
  const modelId = model ?? DEFAULT_MODELS[provider];

  switch (provider) {
    case 'cerebras': {
      if (!cerebrasApiKey) throw new Error('CEREBRAS_API_KEY is required for provider=cerebras');
      const cerebras = createOpenAI({
        apiKey: cerebrasApiKey,
        baseURL: 'https://api.cerebras.ai/v1',
        name: 'cerebras',
      });
      return cerebras(modelId);
    }
    case 'google': {
      if (!googleApiKey) throw new Error('GOOGLE_AI_API_KEY is required for provider=google');
      const google = createGoogleGenerativeAI({ apiKey: googleApiKey });
      return google(modelId);
    }
    case 'groq': {
      if (!groqApiKey) throw new Error('GROQ_API_KEY is required for provider=groq');
      const groq = createGroq({ apiKey: groqApiKey });
      return groq(modelId);
    }
    case 'openrouter': {
      if (!openrouterApiKey) throw new Error('OPENROUTER_API_KEY is required for provider=openrouter');
      const openrouter = createOpenAI({
        apiKey: openrouterApiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        name: 'openrouter',
      });
      return openrouter(modelId);
    }
    default:
      throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
}

// Lazy singleton — built on first call to runAgent, not at module load time
let aiModel: ReturnType<typeof buildModel> | null = null;

function getModel(): ReturnType<typeof buildModel> {
  if (!aiModel) {
    aiModel = buildModel();
  }
  return aiModel;
}

// ── Conversation history ───────────────────────────────────────────────────────

interface ConversationEntry {
  sessionId: string;
  messages: CoreMessage[];
  lastActivity: number;
}

/** In-memory store: telegram_id → conversation state */
const conversations = new Map<number, ConversationEntry>();

const MAX_HISTORY = 40;     // messages kept per user (includes tool call/result messages)
const TTL_MS = 30 * 60 * 1000; // 30 min inactivity → reset

function getOrCreateConversation(telegramId: number): ConversationEntry {
  const existing = conversations.get(telegramId);
  if (existing && Date.now() - existing.lastActivity < TTL_MS) {
    return existing;
  }
  const entry: ConversationEntry = {
    sessionId: crypto.randomUUID(),
    messages: [],
    lastActivity: Date.now(),
  };
  conversations.set(telegramId, entry);
  return entry;
}

export function resetConversation(telegramId: number): void {
  conversations.delete(telegramId);
}

// ── System prompt ──────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `Ты — помощник по управлению учебным порталом. Сегодня ${dayjs().format('D MMMM YYYY, dddd')}.

В системе есть ДВА отдельных раздела:

1. ШКОЛА — расписание уроков и домашние задания из Google Classroom.
   Расписание показывает уроки по дням недели с привязанными заданиями.
   Задания можно также просмотреть отдельно с фильтрами по предмету, дате, статусу.
   Инструменты: get_schedule, get_assignments, get_assignment_details, toggle_assignment_completion.

2. РЕПЕТИТОРЫ — частные занятия с репетиторами ВНЕ школы. Это совсем другой слой, он НЕ связан со школьным расписанием и заданиями.
   Инструменты: list_tutors, get_tutor_sessions, create_tutor, create_tutor_session и другие *tutor* инструменты.

Никогда не используй школьные инструменты для запросов о репетиторах и наоборот.

Форматирование заданий:
- Всегда указывай дату сдачи (due_date) для каждого задания
- Указывай статус: ✅ выполнено / ⬜ не сдано
- Для получения файлов и ссылок на скачивание: вызови get_assignment_details — он вернёт attachments[] с download_url для каждого файла. Всегда показывай пользователю download_url как ссылку

Правила:
- Всегда отвечай на русском языке
- Если запрос неоднозначен — уточни (например, "какого репетитора перенести?")
- Перед удалением любой записи — явно сообщи, что именно будет удалено, и попроси подтвердить
- При работе с датами и временем используй формат, удобный пользователю (например: "в пятницу 14 марта в 16:00")
- Если нужен UUID сущности, сначала получи список инструментом (например list_tutors), затем используй нужный id
- Форматируй ответы кратко и читаемо`;
}

// ── Logging ────────────────────────────────────────────────────────────────────

async function logEvent(params: {
  session_id: string;
  telegram_id: number;
  event_type: string;
  provider?: string;
  model?: string;
  content?: string;
  tool_name?: string;
  tool_args?: unknown;
  tokens_in?: number;
  tokens_out?: number;
}): Promise<void> {
  try {
    await supabase.from('agent_logs').insert({
      session_id: params.session_id,
      telegram_id: params.telegram_id,
      event_type: params.event_type,
      provider: params.provider ?? config.ai.provider,
      model: params.model ?? (config.ai.model ?? DEFAULT_MODELS[config.ai.provider]),
      content: params.content,
      tool_name: params.tool_name ?? null,
      tool_args: params.tool_args ?? null,
      tokens_in: params.tokens_in ?? 0,
      tokens_out: params.tokens_out ?? 0,
    });
  } catch (err) {
    logger.warn({ err }, 'Failed to write agent_log entry');
  }
}

// ── Main entry point ───────────────────────────────────────────────────────────

/**
 * Log an incoming user message. Call this from the text handler before
 * pattern matching so that ALL messages are recorded, not just AI ones.
 */
export async function logIncomingMessage(
  telegramId: number,
  text: string,
): Promise<void> {
  const conv = getOrCreateConversation(telegramId);
  conv.lastActivity = Date.now();
  await logEvent({
    session_id: conv.sessionId,
    telegram_id: telegramId,
    event_type: 'user_message',
    content: text,
  });
}

export async function runAgent(
  telegramId: number,
  userText: string,
): Promise<string> {
  const conv = getOrCreateConversation(telegramId);

  // Append user message to history
  conv.messages.push({ role: 'user', content: userText });

  // Trim history to MAX_HISTORY (keep pairs)
  if (conv.messages.length > MAX_HISTORY) {
    conv.messages = conv.messages.slice(conv.messages.length - MAX_HISTORY);
  }

  try {
    // Log model request
    await logEvent({
      session_id: conv.sessionId,
      telegram_id: telegramId,
      event_type: 'model_request',
      content: JSON.stringify({ messages_count: conv.messages.length }),
    });

    const result = await generateText({
      model: getModel(),
      system: buildSystemPrompt(),
      messages: conv.messages,
      tools: agentTools,
      maxSteps: 8,
      onStepFinish: async (step) => {
        // Log tool calls
        for (const tc of step.toolCalls ?? []) {
          await logEvent({
            session_id: conv.sessionId,
            telegram_id: telegramId,
            event_type: 'tool_call',
            tool_name: tc.toolName,
            tool_args: tc.args,
          });
        }
        // Log tool results
        for (const tr of step.toolResults ?? []) {
          await logEvent({
            session_id: conv.sessionId,
            telegram_id: telegramId,
            event_type: 'tool_result',
            tool_name: tr.toolName,
            content: JSON.stringify(tr.result),
          });
        }
      },
    });

    const responseText = result.text || 'Готово.';

    // Log model response with token usage
    await logEvent({
      session_id: conv.sessionId,
      telegram_id: telegramId,
      event_type: 'model_response',
      content: responseText,
      tokens_in: result.usage?.promptTokens ?? 0,
      tokens_out: result.usage?.completionTokens ?? 0,
    });

    // Update conversation history with full response (including tool calls/results)
    conv.messages.push(...result.response.messages);

    return responseText;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, telegramId }, 'AI agent error');

    await logEvent({
      session_id: conv.sessionId,
      telegram_id: telegramId,
      event_type: 'error',
      content: message,
    });

    // Remove the failed user message from history to avoid broken state
    conv.messages.pop();

    return `Произошла ошибка при обработке запроса: ${message}`;
  }
}
