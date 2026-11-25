import { ConfigService } from '@nestjs/config';
import { DemoAgentService } from './demo-agent.service';
import { DemoDataService } from './demo-data.service';

describe('DemoAgentService', () => {
  const ownerId = '610f5bf0-60a9-4e6c-9589-2385b1af33b1';
  const actor = {
    userId: 'manager',
    fullName: 'Private manager name',
    email: 'private@example.com',
    role: 'CLUB_MANAGER',
  };
  const request = {
    message: 'Tạo ngựa chờ tiếp nhận tên Sao Mai',
    generationId: 'e5181ae8-803e-417a-ad24-a4327d68e945',
    sessionNonce: '0f4a304f-e688-4fe3-a4cd-76fa8f3d8759',
    ownerId,
  };
  const args = { scenario: 'ADMISSION_PENDING', horseName: 'Sao Mai', ownerId };
  const modelArgs = { ...args, ownerId: 'selected-owner' };
  let fetchMock: jest.SpyInstance;
  const build = (
    settings: Record<string, string> = {
      GEMINI_API_KEY: 'unit-test-key',
      GEMINI_MODEL: 'unit-test-model',
    },
  ) => {
    const data = {
      getContext: jest.fn(async () => ({
        owners: [{ id: ownerId, fullName: 'Private owner' }],
        availableStalls: 2,
        serverTime: new Date().toISOString(),
        recipes: [
          { id: 'ADMISSION_PENDING', title: 'Chờ tiếp nhận' },
          { id: 'RACE_READY', title: 'Sẵn sàng' },
        ],
      })),
      issuePermit: jest.fn(() => 'server-only-permit'),
      getReceipt: jest.fn(async () => ({
        status: 'CREATED',
        generationId: request.generationId,
        horseId: request.generationId,
        scenario: 'ADMISSION_PENDING',
      })),
    };
    const agent = new DemoAgentService(
      { get: (name: string) => settings[name] } as ConfigService,
      data as unknown as DemoDataService,
    );
    return { agent, data };
  };
  const respond = (parts: unknown[]) =>
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts } }] }), { status: 200 }),
    );
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchMock.mockRestore();
  });
  it('returns a bounded tool descriptor with a server permit, without leaking account data to Gemini', async () => {
    const { agent, data } = build();
    respond([{ functionCall: { name: 'demo_create_scenario', args: modelArgs } }]);
    const reply = await agent.chat(actor, request);
    expect(reply).toMatchObject({
      status: 'TOOL_CALL',
      tool: { name: 'demo_create_scenario', args },
      permit: 'server-only-permit',
    });
    expect(data.issuePermit).toHaveBeenCalledTimes(1);
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
    expect(body).not.toContain('Private');
    expect(body).not.toContain('unit-test-key');
    expect(body).not.toContain(ownerId);
    expect(body).not.toContain('availableStalls');
    expect(body).not.toContain(actor.userId);
  });
  it('asks for an owner with HORSE_FORM block when creating a horse without ownerId', async () => {
    const { agent, data } = build();
    respond([{ functionCall: { name: 'demo_create_scenario', args: modelArgs } }]);
    await expect(agent.chat(actor, { ...request, ownerId: undefined })).resolves.toMatchObject({
      status: 'NEEDS_INPUT',
      uiBlocks: expect.arrayContaining([expect.objectContaining({ type: 'HORSE_FORM' })]),
    });
    expect(data.issuePermit).not.toHaveBeenCalled();
  });
  it('allows demo_set_time without requiring ownerId and returns TIME_TRAVEL block', async () => {
    const { agent } = build();
    respond([{ functionCall: { name: 'demo_set_time', args: { mode: 'OFFSET_DAYS', days: 15 } } }]);
    await expect(
      agent.chat(actor, { ...request, message: 'Tua +15 ngày', ownerId: undefined }),
    ).resolves.toMatchObject({
      status: 'TOOL_CALL',
      tool: { name: 'demo_set_time', args: { mode: 'OFFSET_DAYS', days: 15 } },
      uiBlocks: expect.arrayContaining([expect.objectContaining({ type: 'TIME_TRAVEL' })]),
    });
  });
  it.each([
    [{ functionCall: { name: 'delete_database', args: {} } }],
    [{ functionCall: { name: 'demo_create_scenario', args: { ...modelArgs, sql: 'delete' } } }],
    [
      {
        functionCall: {
          name: 'demo_create_scenario',
          args: { ...args, ownerId: 'f5181ae8-803e-417a-ad24-a4327d68e945' },
        },
      },
    ],
    [
      { functionCall: { name: 'demo_create_scenario', args: modelArgs } },
      { functionCall: { name: 'demo_create_scenario', args: modelArgs } },
    ],
  ])('refuses unsafe model output %o', async (...parts) => {
    const { agent, data } = build();
    respond(parts);
    await expect(agent.chat(actor, request)).rejects.toThrow();
    expect(data.issuePermit).not.toHaveBeenCalled();
  });
  it('never treats model text as a successful database write', async () => {
    const { agent } = build();
    respond([{ text: 'Đã tạo xong!' }]);
    const reply = await agent.chat(actor, request);
    expect(reply.status).toBe('NEEDS_INPUT');
    expect(reply.message).toMatch(/^Chưa tạo dữ liệu/);
  });
  it('fails clearly when AI is not configured or provider fails', async () => {
    await expect(build({}).agent.chat(actor, request)).rejects.toThrow();
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
    await expect(build().agent.chat(actor, request)).rejects.toThrow();
  });
  it('resolves final success only from the stored receipt, even without a key', async () => {
    const { agent, data } = build({});
    const reply = await agent.chat(actor, { ...request, completed: true });
    expect(data.getReceipt).toHaveBeenCalledWith(actor, request.generationId);
    expect(reply.status).toBe('ANSWER');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
