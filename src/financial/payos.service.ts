import { Injectable, Logger } from '@nestjs/common';
import { PayOS } from '@payos/node';

export interface PayOSLinkResult {
  isRealPayOS: boolean;
  checkoutUrl: string | null;
  qrCode: string;
  rawQrCode?: string;
  orderCode: number;
  amount: number;
  description: string;
  accountNumber: string;
  accountName: string;
  bin: string;
  bankName: string;
}

@Injectable()
export class PayOSService {
  private readonly logger = new Logger(PayOSService.name);
  private payos: PayOS | null = null;
  public readonly isConfigured: boolean;

  constructor() {
    const clientId = process.env.PAYOS_CLIENT_ID?.trim();
    const apiKey = process.env.PAYOS_API_KEY?.trim();
    const checksumKey = process.env.PAYOS_CHECKSUM_KEY?.trim();

    if (clientId && apiKey && checksumKey && !clientId.includes('your-')) {
      try {
        this.payos = new PayOS({ clientId, apiKey, checksumKey });
        this.isConfigured = true;
        this.logger.log('PayOS SDK initialized successfully with provided merchant credentials.');
      } catch (err) {
        this.logger.warn(
          `Failed to initialize PayOS SDK: ${(err as Error).message}. Operating in smart mock mode.`,
        );
        this.isConfigured = false;
      }
    } else {
      this.isConfigured = false;
      this.logger.log(
        'PayOS merchant credentials not provided or using placeholders. Operating in smart mock/VietQR mode.',
      );
    }
  }

  /**
   * Tạo link thanh toán / mã QR VietQR (Hỗ trợ PayOS thật + VietQR tiêu chuẩn tự động fallback)
   */
  async createPaymentLink(params: {
    invoiceId: string;
    billingPeriod: string;
    netAmount: number;
    demoAmount?: number;
    returnUrl?: string;
    cancelUrl?: string;
  }): Promise<PayOSLinkResult> {
    const effectiveAmount =
      params.demoAmount && params.demoAmount > 0
        ? Math.round(params.demoAmount)
        : Math.round(params.netAmount);

    // PayOS yêu cầu orderCode là số nguyên dương duy nhất <= 9007199254740991
    const orderCode = Math.floor(Date.now() % 1000000000) + Math.floor(Math.random() * 9000 + 1000);
    const cleanPeriod = params.billingPeriod.replace(/[^a-zA-Z0-9]/g, '');
    const shortId = params.invoiceId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4);
    const description = `HD ${cleanPeriod} ${shortId}`.slice(0, 25);

    const returnUrl = params.returnUrl || 'http://localhost:5173/financial-reports?status=paid';
    const cancelUrl =
      params.cancelUrl || 'http://localhost:5173/financial-reports?status=cancelled';

    if (this.isConfigured && this.payos) {
      try {
        const paymentLinkRes = await this.payos.paymentRequests.create({
          orderCode,
          amount: effectiveAmount,
          description,
          returnUrl,
          cancelUrl,
        });

        const rawQr = paymentLinkRes.qrCode;
        const bin = paymentLinkRes.bin || '970422';
        const accountNumber = paymentLinkRes.accountNumber;
        const accountName = paymentLinkRes.accountName;
        const amount = paymentLinkRes.amount;
        const desc = paymentLinkRes.description;

        // PayOS SDK trả về raw EMVCo text payload trong qrCode (e.g. 00020101...).
        // Chuyển đổi thành VietQR image URL hoặc QR generator URL để trình duyệt hiển thị ngay.
        let qrImageUrl = rawQr;
        if (!rawQr || (!rawQr.startsWith('http') && !rawQr.startsWith('data:image'))) {
          if (bin && accountNumber) {
            qrImageUrl = `https://img.vietqr.io/image/${bin}-${accountNumber}-qr_only.png?amount=${amount}&addInfo=${encodeURIComponent(
              desc,
            )}&accountName=${encodeURIComponent(accountName)}`;
          } else if (rawQr) {
            qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
              rawQr,
            )}`;
          }
        }

        return {
          isRealPayOS: true,
          checkoutUrl: paymentLinkRes.checkoutUrl,
          qrCode: qrImageUrl,
          rawQrCode: rawQr,
          orderCode: paymentLinkRes.orderCode,
          amount: paymentLinkRes.amount,
          description: paymentLinkRes.description,
          accountNumber: paymentLinkRes.accountNumber,
          accountName: paymentLinkRes.accountName,
          bin,
          bankName: 'MBBank (Ngân hàng Quân Đội)',
        };
      } catch (err) {
        this.logger.warn(
          `PayOS API error: ${(err as Error).message}. Falling back to VietQR standard payload.`,
        );
      }
    }

    // Fallback: Chuẩn VietQR tĩnh với tài khoản câu lạc bộ TMEC
    const accountNumber = '0983989059';
    const accountName = 'CLB DUA NGUA TMEC';
    const bin = '970422'; // MBBank
    const bankName = 'MBBank (Ngân hàng Quân Đội)';
    const qrCode = `https://img.vietqr.io/image/${bin}-${accountNumber}-qr_only.png?amount=${effectiveAmount}&addInfo=${encodeURIComponent(
      description,
    )}&accountName=${encodeURIComponent(accountName)}`;

    return {
      isRealPayOS: false,
      checkoutUrl: null,
      qrCode,
      rawQrCode: qrCode,
      orderCode,
      amount: effectiveAmount,
      description,
      accountNumber,
      accountName,
      bin,
      bankName,
    };
  }

  /**
   * Tra cứu trạng thái thanh toán từ PayOS
   */
  async getPaymentStatus(orderCode: number): Promise<{ status: string; isRealPayOS: boolean }> {
    if (this.isConfigured && this.payos) {
      try {
        const info = await this.payos.paymentRequests.get(orderCode);
        return { status: info.status, isRealPayOS: true };
      } catch (err) {
        this.logger.warn(`Failed to query PayOS order ${orderCode}: ${(err as Error).message}`);
      }
    }
    return { status: 'PENDING', isRealPayOS: false };
  }
}
