import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateInvoiceDto } from './create-invoice.dto';

export class UpdateInvoiceDto extends PartialType(CreateInvoiceDto) {
  @ApiPropertyOptional({
    description: 'Ghi chú / lý do điều chỉnh (dùng làm lý do trong mail REFUND_NOTIFIED)',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
