import { FinancialController } from './financial.controller';
import { FinancialService } from './financial.service';
import { UserRole } from '../common/enums/role.enum';
import { ROLES_KEY } from '../common/decorators/roles.decorator';

describe('FinancialController owner summary scope', () => {
  it.each([
    [UserRole.CLUB_MANAGER, undefined, undefined],
    [UserRole.CLUB_MANAGER, 'owner-2', 'owner-2'],
    [UserRole.HORSE_OWNER, undefined, 'current-user'],
    [UserRole.HORSE_OWNER, 'owner-2', 'current-user'],
  ])('scopes %s with owner query %s to %s', async (role, query, expected) => {
    const getOwnerSummary = jest.fn().mockResolvedValue({ invoices: [] });
    const controller = new FinancialController({ getOwnerSummary } as unknown as FinancialService);
    await controller.getOwnerSummary(
      {
        userId: 'current-user',
        fullName: 'User',
        email: 'user@test.com',
        role,
      },
      query,
    );
    expect(getOwnerSummary).toHaveBeenCalledWith(expected);
  });

  it('restricts summary access to manager and owner roles', () => {
    expect(Reflect.getMetadata(ROLES_KEY, FinancialController.prototype.getOwnerSummary)).toEqual([
      UserRole.CLUB_MANAGER,
      UserRole.HORSE_OWNER,
    ]);
  });

  it('restricts club-cashflow access strictly to CLUB_MANAGER and delegates period filter', async () => {
    expect(Reflect.getMetadata(ROLES_KEY, FinancialController.prototype.getClubCashflow)).toEqual([
      UserRole.CLUB_MANAGER,
    ]);
    const getClubCashflow = jest.fn().mockResolvedValue({ billingPeriod: '2026-10' });
    const controller = new FinancialController({ getClubCashflow } as unknown as FinancialService);
    await controller.getClubCashflow('2026-10');
    expect(getClubCashflow).toHaveBeenCalledWith('2026-10');
  });
  it.each(['remind', 'paymentFailure'] as const)('restricts %s to Club Manager', (method) => {
    expect(Reflect.getMetadata(ROLES_KEY, FinancialController.prototype[method])).toEqual([
      UserRole.CLUB_MANAGER,
    ]);
  });

  it('delegates reminder and failure reporting with the authenticated actor', async () => {
    const service = {
      remindInvoice: jest.fn().mockResolvedValue({ sent: false }),
      recordPaymentFailure: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new FinancialController(service as unknown as FinancialService);
    const user = {
      userId: 'mgr',
      fullName: 'Manager',
      email: 'qa@example.test',
      role: UserRole.CLUB_MANAGER,
    };
    await expect(controller.remind('inv', user)).resolves.toEqual({ sent: false });
    await expect(controller.paymentFailure('inv', { txRef: 'tx' }, user)).resolves.toEqual({
      ok: true,
    });
    expect(service.recordPaymentFailure).toHaveBeenCalledWith(
      'inv',
      { txRef: 'tx' },
      { id: 'mgr', name: 'Manager', role: UserRole.CLUB_MANAGER },
    );
  });
});
