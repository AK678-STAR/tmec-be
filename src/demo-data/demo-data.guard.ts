import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/exceptions/api-error';

@Injectable()
export class DemoDataGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  assertLocal(): void {
    if (
      this.config.get<string>('NODE_ENV') !== 'development' ||
      this.config.get<string>('DEMO_DATA_ENABLED') !== 'true'
    ) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'DEMO_DISABLED',
        'Tạo dữ liệu mẫu chỉ mở khi được bật trong môi trường phát triển.',
      );
    }
    const urls = [
      this.config.get<string>('DATABASE_URL'),
      this.config.get<string>('DIRECT_URL'),
    ].filter(Boolean);
    if (
      !this.config.get<string>('DATABASE_URL') ||
      urls.some((value) => !this.isLoopback(value!))
    ) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'DEMO_LOCAL_ONLY',
        'Chỉ được tạo dữ liệu mẫu trên cơ sở dữ liệu local.',
      );
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    this.assertLocal();
    const request = context.switchToHttp().getRequest<{ user?: { userId?: string } }>();
    const account = request.user?.userId
      ? await this.prisma.user.findUnique({
          where: { id: request.user.userId },
          select: { id: true, role: true, status: true },
        })
      : null;
    if (!account || account.status !== 'ACTIVE') {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'DEMO_FORBIDDEN',
        'Chỉ tài khoản đang hoạt động ở môi trường dev local mới được dùng Agent Toolkit.',
      );
    }
    return true;
  }

  private isLoopback(value: string): boolean {
    try {
      const url = new URL(value);
      return (
        ['postgres:', 'postgresql:'].includes(url.protocol) &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase()) &&
        !url.searchParams.has('host') &&
        !url.searchParams.has('hostaddr')
      );
    } catch {
      return false;
    }
  }
}
