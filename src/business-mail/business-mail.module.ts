import { Global, Module } from '@nestjs/common';
import { BusinessMailService } from './business-mail.service';

/**
 * Module mail nghiệp vụ (nhắc nợ, cảnh báo, chứng từ) — global để mọi feature
 * (financial, stalls, incidents, medical, tournaments, complaints…) inject được
 * BusinessMailService mà không cần import module riêng.
 */
@Global()
@Module({
  providers: [BusinessMailService],
  exports: [BusinessMailService],
})
export class BusinessMailModule {}
