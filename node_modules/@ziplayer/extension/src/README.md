# Lavalink Extension - Modular Architecture

Extension này đã được tối ưu hóa và module hóa để dễ bảo trì và mở rộng.

## Cấu trúc Module

### 📁 Types (`types/`)

- `lavalink.ts` - Tất cả các interface và type definitions cho Lavalink

### 📁 Managers (`managers/`)

- `NodeManager.ts` - Quản lý kết nối và tương tác với Lavalink nodes
- `PlayerStateManager.ts` - Quản lý trạng thái của các player

### 📁 Handlers (`handlers/`)

- `WebSocketHandler.ts` - Xử lý kết nối WebSocket với Lavalink
- `VoiceHandler.ts` - Xử lý voice connection và voice events

### 📁 Resolvers (`resolvers/`)

- `TrackResolver.ts` - Xử lý track encoding, mapping và search

### 📁 Utils (`utils/`)

- `helpers.ts` - Các utility functions và helper methods

## Lợi ích của kiến trúc mới

### ✅ Tách biệt trách nhiệm

- Mỗi module có một trách nhiệm cụ thể
- Dễ dàng test và debug từng phần riêng biệt

### ✅ Tái sử dụng code

- Các module có thể được sử dụng độc lập
- Dễ dàng mở rộng và thêm tính năng mới

### ✅ Bảo trì dễ dàng

- Code được tổ chức rõ ràng theo chức năng
- Dễ dàng tìm và sửa lỗi

### ✅ Performance tốt hơn

- Giảm thiểu duplicate code
- Tối ưu hóa memory usage

## Cách sử dụng

```typescript
import { lavalinkExt } from "./lavalinkExt";

// Sử dụng như bình thường
const extension = new lavalinkExt(player, {
	nodes: [
		/* node configs */
	],
	debug: true,
});
```

## Migration từ version cũ

Extension mới hoàn toàn tương thích với API cũ. Không cần thay đổi code hiện tại, chỉ cần import từ module mới.
