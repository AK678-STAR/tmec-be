# Tiếp nhận ngựa và tổng quan công việc

## Phạm vi

- Không thay đổi giáo án, kết quả tập hoặc mô phỏng của HLV.
- Tiếng Việt trước; giữ font hiện có, dùng góc bo tròn.
- Màn tiếp nhận: `/horses/admissions`; tổng quan: `/staff/schedule`.

## Hành vi

- Không thể lưu thẩm định khi hết ô AVAILABLE hợp lệ; loại ô có phân bổ đang hoạt động và khu ngừng sử dụng.
- Quản lý chủ động hoãn hồ sơ chưa thẩm định khi hết chuồng. Hồ sơ về chờ xác minh, giải phóng lịch cũ, không bị từ chối. Email được chuyển qua BusinessMailService sau commit; thao tác lặp không phát sinh email mới.
- Duyệt tiếp nhận chọn và khóa ô trống, kiểm tra hồ sơ, tạo phân bổ và cập nhật trạng thái trong cùng transaction. Thứ tự khóa Stall → Horse → HorseAdmissionRecord.
- Một lịch thẩm định có Quản lý và bác sĩ. Mặc định 60 phút, cho chỉnh giờ kết thúc; không đặt quy định giờ làm việc chưa được xác nhận. Kiểm tra trùng lịch giữa các cuộc hẹn và công việc có giờ cụ thể.
- Tổng quan chỉ tổng hợp Quản lý, bác sĩ và nhân viên chăm sóc: thẩm định, ca trực, chăm sóc, phòng ngừa, bệnh án và công việc khác. Các mục không có thời lượng nằm trong ngày, không được dùng để suy ra xung đột giờ.
- Một cuộc hẹn chung được đếm một lần, xuất hiện ở cả hai người. Ca trực và nhiệm vụ là hai loại mục riêng. Quá hạn cập nhật không khẳng định nhân viên chưa làm.
- Công việc khác có thể tạo, bắt đầu, hoàn thành hoặc hủy. Nhân viên chỉ cập nhật việc của mình; Quản lý xem và cập nhật toàn bộ phạm vi này.

## Schema và API

- `HorseAdmissionRecord`: thêm `appointmentEndDate`, `managerUserId`, `capacityDeferredAt` (nullable); bổ sung bảng `StaffWorkItem`.
- Sau khi pull ở môi trường khác: `npx prisma generate` và `npx prisma db push`. Không dùng migrations hoặc `--accept-data-loss`.
- `GET /horses/admissions/capacity`; `POST /horses/admissions/:id/defer-capacity`.
- Lệnh đặt hẹn nhận thêm `appointmentEndDate`, `managerUserId`, `veterinarianUserId`; bắt buộc có bác sĩ hợp lệ khi đặt hẹn.
- `GET /staff-work?from=YYYY-MM-DD&to=YYYY-MM-DD` (tối đa 31 ngày); `GET /staff-work/members`; `POST /staff-work`; `PATCH /staff-work/:id/status`.

## Kiểm chứng

Chạy qua CLI agy. Các suite trọng tâm nằm ở `src/horses/*.spec.ts`; SQL smoke dùng bảng tạm trong `test/admission-capacity.sql.check.cjs`; kiểm tra đọc dữ liệu thật ở localhost: `test/staff-work.read.check.cjs`.

Frontend có `playwright.staff-work.config.ts` và `tests/browser/staff-work.spec.ts`: lịch chung không đếm trùng, lỗi API/khôi phục, giao diện 390px và giữ form khi server báo trùng lịch. Browser test dùng API fixtures, không ghi hồ sơ hoặc gửi email thật.

Chưa nghiệm thu SMTP thật, triển khai máy chủ hoặc điều phối hai request đồng thời qua HTTP. Các thay đổi cần người dùng kiểm tra nghiệp vụ trên hai màn hình trước khi đưa lên môi trường khác.

## Sửa luồng bác sĩ nhận phân công

- Menu bác sĩ có `Thẩm định được phân công` tại `/medical/admissions` và `Lịch công việc của tôi` tại `/staff/schedule`, dùng quyền y tế thay vì quyền quản lý tài khoản.
- Danh sách, tổng số, chi tiết/lịch sử và lưu kết quả đều kiểm tra bác sĩ được phân công ở BE. Không mở dữ liệu của bác sĩ khác bằng đường dẫn trực tiếp.
- Thông báo mới và mục lịch mở đúng hồ sơ qua `?inspection=<id>`; không phụ thuộc hồ sơ đang nằm ở trang phân trang nào.
- Bác sĩ chỉ lưu kết luận sức khỏe; chip/pháp lý chỉ xem. Giao diện Quản lý và phần HLV giữ nguyên phạm vi.
- Kiểm tra qua agy: 91 unit test trọng tâm, 7 browser test (4 tình huống bác sĩ), typecheck và build đều qua. Kiểm tra chỉ đọc localhost tìm thấy hồ sơ được phân công và xác nhận chi tiết hồ sơ khác bị chặn. Không cần đổi schema cho bản sửa này.
