import { HttpStatus } from '@nestjs/common';
import { apiError } from '../common/exceptions/api-error';
import { HORSE_NAME_RE } from '../horses/horse-rules';

export const DEMO_RECIPES = [
  {
    id: 'ADMISSION_PENDING',
    title: 'Ngựa chờ tiếp nhận',
    description: 'Tạo hồ sơ mới, chưa hẹn hoặc duyệt thẩm định.',
  },
  {
    id: 'RACE_READY',
    title: 'Ngựa đủ điều kiện đăng ký thi đấu',
    description: 'Tạo lịch sử hồi phục, tập luyện và giải mở; chưa đăng ký thi đấu.',
  },
] as const;

export type DemoScenario = (typeof DEMO_RECIPES)[number]['id'];
export type DemoArgs = { scenario: DemoScenario; horseName: string; ownerId: string };
export type DemoReceipt = {
  generationId: string;
  scenario: DemoScenario;
  status: 'CREATED';
  createdAt: string;
  horseId: string;
  records: { entity: string; ids: string[] }[];
  links: { label: string; path: string }[];
  warnings: string[];
};

export function normalizeDemoArgs(input: unknown): DemoArgs {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw apiError(HttpStatus.BAD_REQUEST, 'DEMO_INPUT_INVALID', 'Tham số bộ mẫu không hợp lệ.');
  }
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !['scenario', 'horseName', 'ownerId'].includes(key))) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'DEMO_INPUT_INVALID',
      'Chỉ được chọn bộ mẫu, tên ngựa và chủ ngựa.',
    );
  }
  if (!DEMO_RECIPES.some((recipe) => recipe.id === value.scenario)) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'SCENARIO_UNSUPPORTED',
      'Chỉ hỗ trợ ngựa chờ tiếp nhận hoặc đủ điều kiện đăng ký thi đấu.',
    );
  }
  const horseName =
    typeof value.horseName === 'string' ? value.horseName.trim().replace(/\s+/g, ' ') : '';
  if (
    horseName.length < 2 ||
    horseName.length > 90 ||
    !HORSE_NAME_RE.test(horseName) ||
    typeof value.ownerId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.ownerId)
  ) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'DEMO_INPUT_INVALID',
      'Tên ngựa phải từ 2–90 ký tự hợp lệ và cần chọn chủ ngựa có sẵn.',
    );
  }
  return {
    scenario: value.scenario as DemoScenario,
    horseName,
    ownerId: value.ownerId.toLowerCase(),
  };
}

export type DemoTimeArgs = {
  mode: 'REAL' | 'OFFSET_DAYS' | 'EXACT_DATE';
  days?: number;
  date?: string;
  reason?: string;
};

export type AgentUiBlock =
  | {
      type: 'TIME_TRAVEL';
      title: string;
      mode: 'REAL' | 'OFFSET_DAYS' | 'EXACT_DATE';
      daysOffset?: number;
      date?: string;
      note?: string;
    }
  | {
      type: 'HORSE_FORM';
      title: string;
      defaultScenario?: DemoScenario;
      defaultHorseName?: string;
      note?: string;
    }
  | {
      type: 'RECEIPT';
      title: string;
      generationId: string;
    }
  | {
      type: 'QUICK_SWITCH';
      title: string;
      roles: Array<'CLUB_MANAGER' | 'HEAD_TRAINER' | 'VETERINARIAN' | 'GROOM' | 'HORSE_OWNER'>;
      note?: string;
    }
  | {
      type: 'NOTICE';
      title: string;
      tone: 'info' | 'warn';
      message: string;
    };

export function normalizeDemoTimeArgs(input: unknown): DemoTimeArgs {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw apiError(HttpStatus.BAD_REQUEST, 'DEMO_INPUT_INVALID', 'Tham số thời gian không hợp lệ.');
  }
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !['mode', 'days', 'date', 'reason'].includes(key))) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'DEMO_INPUT_INVALID',
      'Tham số thời gian ngoài phạm vi.',
    );
  }
  if (!['REAL', 'OFFSET_DAYS', 'EXACT_DATE'].includes(String(value.mode))) {
    throw apiError(HttpStatus.BAD_REQUEST, 'DEMO_INPUT_INVALID', 'Chế độ thời gian không hợp lệ.');
  }
  const mode = value.mode as DemoTimeArgs['mode'];
  const reason = typeof value.reason === 'string' ? value.reason.trim().slice(0, 120) : undefined;
  if (mode === 'REAL') return { mode, reason };
  if (mode === 'OFFSET_DAYS') {
    const days = Number(value.days);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'DEMO_INPUT_INVALID',
        'Số ngày tua phải là số nguyên từ 0 đến 365.',
      );
    }
    return { mode, days, reason };
  }
  const date = typeof value.date === 'string' ? value.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'DEMO_INPUT_INVALID',
      'Ngày tua phải theo dạng YYYY-MM-DD.',
    );
  }
  return { mode, date, reason };
}

export const DEMO_TOOL_SCHEMAS = {
  demo_get_context: { type: 'object', properties: {}, additionalProperties: false },
  demo_create_scenario: {
    type: 'object',
    properties: {
      scenario: { type: 'string', enum: ['ADMISSION_PENDING', 'RACE_READY'] },
      horseName: { type: 'string', minLength: 2, maxLength: 90 },
      ownerId: { type: 'string' },
    },
    required: ['scenario', 'horseName', 'ownerId'],
    additionalProperties: false,
  },
  demo_set_time: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['REAL', 'OFFSET_DAYS', 'EXACT_DATE'] },
      days: { type: 'integer', minimum: 0, maximum: 365 },
      date: { type: 'string' },
      reason: { type: 'string', maxLength: 120 },
    },
    required: ['mode'],
    additionalProperties: false,
  },
};
