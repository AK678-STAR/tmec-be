/**
 * Helper HTML dùng chung cho các template nghiệp vụ. Giữ wrapper đơn giản,
 * bộ font mặc định (Gmail an toàn), không phụ thuộc MailService (để test unit thuần).
 */
export interface BusinessMailContent {
  subject: string;
  text: string;
  html: string;
}

/** Nền web (FE) để gắn link trong mail — đọc từ env, default local dev. */
export function linkBase(): string {
  return process.env.BUSINESS_MAIL_BASE_URL || 'http://localhost:5173';
}

/** Chuyển HTML nội dung → trang mail đầy đủ. */
export function wrapBusinessHtml(subject: string, inner: string): string {
  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937">',
    `  <h2 style="margin:0 0 8px;font-size:18px;color:#0f766e">${subject}</h2>`,
    `  ${inner}`,
    '  <p style="margin:16px 0 0;font-size:12px;color:#6b7280">',
    '    TMEC - Hệ thống Quản lý Huấn luyện Ngựa đua. Đây là email hệ thống, vui lòng không trả lời.',
    '  </p>',
    '</div>',
  ].join('\n');
}

/**
 * Gom các dòng "Label: giá trị" thành đoạn HTML an toàn (escape giá trị, giữ nguyên label).
 * Trả về { subject, text, html } dùng lại cho mọi template.
 */
export function renderMail(
  subject: string,
  rows: Array<{ label: string; value: string | number | null | undefined }>,
): BusinessMailContent {
  const items = rows.filter((r) => r.value !== null && r.value !== undefined && String(r.value) !== '');
  const lines = items.map((r) => `${r.label}: ${r.value}`);
  const htmlInner = `<table style="border-collapse:collapse">${items
    .map(
      (r) =>
        `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;white-space:nowrap">${r.label}</td><td style="padding:3px 0">${String(
          r.value,
        ).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td></tr>`,
    )
    .join('')}</table>`;
  const html = wrapBusinessHtml(subject, htmlInner);
  return { subject, text: lines.join('\n'), html };
}
