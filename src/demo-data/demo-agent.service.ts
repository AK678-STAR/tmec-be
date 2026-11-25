import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { apiError } from '../common/exceptions/api-error';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { DemoChatDto } from './demo-data.dto';
import { DemoDataService } from './demo-data.service';
import {
  DEMO_RECIPES,
  DEMO_TOOL_SCHEMAS,
  normalizeDemoArgs,
  normalizeDemoTimeArgs,
  type AgentUiBlock,
} from './demo-data.catalog';

@Injectable()
export class DemoAgentService {
  constructor(
    private readonly config: ConfigService,
    private readonly data: DemoDataService,
  ) { }

  async chat(actor: CurrentUserPayload, dto: DemoChatDto) {
    if (dto.completed) {
      const receipt = await this.data.getReceipt(actor, dto.generationId);
      const nextRoles: AgentUiBlock['roles'] extends never
        ? never
        : Array<'CLUB_MANAGER' | 'HEAD_TRAINER' | 'VETERINARIAN' | 'GROOM' | 'HORSE_OWNER'> =
        receipt.scenario === 'ADMISSION_PENDING'
          ? ['CLUB_MANAGER', 'VETERINARIAN', 'HEAD_TRAINER']
          : ['CLUB_MANAGER', 'HEAD_TRAINER', 'HORSE_OWNER'];
      return {
        status: 'ANSWER' as const,
        message: 'Đã tạo bộ dữ liệu DEMO. Bạn tiếp tục nghiệp vụ trên giao diện.',
        receipt,
        uiBlocks: [
          {
            type: 'RECEIPT' as const,
            title: 'Biên nhận dữ liệu mẫu vừa tạo',
            generationId: receipt.generationId,
          },
          {
            type: 'QUICK_SWITCH' as const,
            title: 'Chuyển nhanh vai trò cho bước tiếp theo',
            roles: nextRoles,
            note:
              receipt.scenario === 'ADMISSION_PENDING'
                ? 'Chuyển sang Quản lý hoặc Bác sĩ thú y để hẹn thẩm định và duyệt hồ sơ.'
                : 'Chuyển sang Quản lý hoặc HLV để đăng ký giải đua và thanh toán.',
          },
        ] satisfies AgentUiBlock[],
      };
    }
    const context = await this.data.getContext();
    const key = this.config.get<string>('GEMINI_API_KEY')?.trim();
    const model = this.config
      .get<string>('GEMINI_MODEL')
      ?.trim()
      .replace(/^models\//, '');
    if (!key || !model || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(model)) {
      throw apiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'AI_NOT_CONFIGURED',
        'Chưa cấu hình Gemini hỗ trợ function calling trên backend.',
      );
    }
    // Only public recipe descriptions and a synthetic alias leave this server.
    const projection = JSON.stringify({
      ownerId: 'selected-owner',
      hasSelectedOwner: Boolean(
        dto.ownerId && context.owners.some((owner) => owner.id === dto.ownerId),
      ),
      recipes: DEMO_RECIPES,
      contextAlreadyRead: Boolean(dto.contextRead),
    });
    if (projection.length > 20_000)
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'DEMO_INPUT_INVALID',
        'Context vượt giới hạn cho phép.',
      );
    const instructions = `Bạn là trợ lý Agent UI của EquiFlow (chỉ trong phạm vi Demo Toolkit), trả lời tiếng Việt ngắn gọn. Bạn có 2 khả năng chính: (1) tạo dữ liệu mẫu với demo_create_scenario (2 recipe: ADMISSION_PENDING - ngựa chờ tiếp nhận; RACE_READY - ngựa hồi phục, lịch sử tập, giải mở) dùng đúng ownerId là selected-owner; (2) thao túng thời gian mô phỏng với demo_set_time (mode='REAL' để về hôm nay, mode='OFFSET_DAYS' với days=0..365 để tua tiến, mode='EXACT_DATE' với date='YYYY-MM-DD'). Khi người dùng yêu cầu tua ngày/skip thời gian/sang tháng sau, hãy gọi demo_set_time ngay. Khi người dùng yêu cầu tạo ngựa và đã nêu tên ngựa, gọi demo_create_scenario (không thêm tiền tố DEMO). Nếu thiếu tên ngựa, hỏi lại tên. Không hỗ trợ SQL, shell, sửa hồ sơ cũ hoặc thao tác ngoài phạm vi.`;
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          signal: AbortSignal.timeout(20_000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instructions }] },
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `Context được server xác thực: ${projection}\nYêu cầu người dùng: ${dto.message}`,
                  },
                ],
              },
            ],
            tools: [
              {
                functionDeclarations: Object.entries(DEMO_TOOL_SCHEMAS)
                  .filter(([name]) => !dto.contextRead || name !== 'demo_get_context')
                  .map(([name, schema]) => ({
                    name,
                    description:
                      name === 'demo_get_context'
                        ? 'Đọc khả năng tạo dữ liệu mẫu local, không ghi dữ liệu.'
                        : 'Tạo một bộ dữ liệu DEMO mới theo yêu cầu người dùng, giữ nguyên dữ liệu cũ.',
                    parametersJsonSchema:
                      name === 'demo_create_scenario'
                        ? {
                          ...schema,
                          properties: {
                            ...schema.properties,
                            ownerId: { type: 'string', enum: ['selected-owner'] },
                          },
                        }
                        : schema,
                  })),
              },
            ],
            toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
            generationConfig: { temperature: 0, maxOutputTokens: 800 },
          }),
        },
      );
    } catch {
      throw apiError(
        HttpStatus.GATEWAY_TIMEOUT,
        'AI_TIMEOUT',
        'Gemini chưa phản hồi. Chưa gọi tool tạo mẫu; bạn có thể gửi lại yêu cầu.',
      );
    }
    if (!response.ok)
      throw apiError(
        HttpStatus.BAD_GATEWAY,
        response.status === 429 ? 'AI_RATE_LIMIT' : 'AI_PROVIDER_ERROR',
        response.status === 429
          ? 'Gemini đang giới hạn lượt gọi. Vui lòng thử lại sau.'
          : 'Gemini chưa xử lý được yêu cầu. Kiểm tra key và model cấu hình ở backend.',
      );
    let parts: Array<{ functionCall?: { name?: string; args?: unknown }; text?: string }>;
    try {
      const raw = await response.text();
      if (raw.length > 20_000) throw new Error('Oversize provider response');
      parts = JSON.parse(raw)?.candidates?.[0]?.content?.parts;
      if (!Array.isArray(parts) || parts.length > 20) throw new Error('Invalid parts');
    } catch {
      throw apiError(
        HttpStatus.BAD_GATEWAY,
        'AI_RESPONSE_INVALID',
        'Phản hồi Gemini không hợp lệ; chưa tạo dữ liệu.',
      );
    }
    const calls = parts
      .filter((part) => part && typeof part === 'object' && part.functionCall)
      .map((part) => part.functionCall!);
    if (calls.length > 1)
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'AI_UNSAFE_TOOL',
        'Mỗi lượt chỉ được gọi một tool; chưa tạo dữ liệu.',
      );
    if (!calls.length) {
      const text = parts
        .filter((part) => part && typeof part.text === 'string')
        .map((part) => part.text)
        .join(' ')
        .slice(0, 1000);
      return {
        status: 'NEEDS_INPUT' as const,
        message: `Chưa tạo dữ liệu. ${text || 'Hãy nêu bộ mẫu và tên ngựa bạn muốn tạo.'}`,
        uiBlocks: [
          {
            type: 'HORSE_FORM' as const,
            title: 'Bổ sung nhanh thông tin tạo ngựa',
            note: 'Điền tên ngựa, chọn chủ ngựa và bấm Tạo ngay.',
          },
          {
            type: 'TIME_TRAVEL' as const,
            title: 'Điều chỉnh nhanh thời gian mô phỏng',
            mode: 'REAL' as const,
          },
        ] satisfies AgentUiBlock[],
      };
    }
    const call = calls[0];
    if (
      call.name === 'demo_get_context' &&
      !dto.contextRead &&
      call.args &&
      typeof call.args === 'object' &&
      !Array.isArray(call.args) &&
      !Object.keys(call.args).length
    ) {
      return {
        status: 'TOOL_CALL' as const,
        tool: { name: 'demo_get_context' as const, args: {} },
      };
    }
    if (call.name === 'demo_set_time') {
      const timeArgs = normalizeDemoTimeArgs(call.args);
      return {
        status: 'TOOL_CALL' as const,
        tool: { name: 'demo_set_time' as const, args: timeArgs },
        uiBlocks: [
          {
            type: 'TIME_TRAVEL' as const,
            title: 'Đã cập nhật đồng hồ mô phỏng',
            mode: timeArgs.mode,
            daysOffset: timeArgs.days,
            date: timeArgs.date,
            note: timeArgs.reason || 'Hệ thống đã đồng bộ ngày giả lập cho cả FE và BE.',
          },
        ] satisfies AgentUiBlock[],
      };
    }
    if (call.name !== 'demo_create_scenario')
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'AI_UNSAFE_TOOL',
        'Tool do mô hình đề xuất không được phép.',
      );
    if (!dto.ownerId || !context.owners.some((owner) => owner.id === dto.ownerId)) {
      return {
        status: 'NEEDS_INPUT' as const,
        message: 'Hãy chọn một chủ ngựa hợp lệ ở phía trên trước khi tạo mẫu.',
        uiBlocks: [
          {
            type: 'HORSE_FORM' as const,
            title: 'Chọn chủ ngựa & xác nhận tạo mẫu',
            note: 'Chưa chọn chủ ngựa sở hữu cho chiến mã mẫu.',
          },
        ] satisfies AgentUiBlock[],
      };
    }
    if (
      !call.args ||
      typeof call.args !== 'object' ||
      Array.isArray(call.args) ||
      (call.args as Record<string, unknown>).ownerId !== 'selected-owner'
    )
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'DEMO_INPUT_INVALID',
        'Mô hình đã chọn sai bí danh chủ ngựa. Chưa tạo dữ liệu.',
      );
    const args = normalizeDemoArgs({
      ...(call.args as Record<string, unknown>),
      ownerId: dto.ownerId,
    });
    const reason = context.recipes.find((recipe) => recipe.id === args.scenario)?.reason;
    if (reason) throw apiError(HttpStatus.CONFLICT, 'RESOURCE_UNAVAILABLE', reason);
    return {
      status: 'TOOL_CALL' as const,
      tool: { name: 'demo_create_scenario' as const, args },
      permit: this.data.issuePermit(actor, dto.generationId, dto.sessionNonce, args),
    };
  }
}
