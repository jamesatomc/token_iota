# DeepBook UI Fixes - สรุปการแก้ไข

## 🎯 ปัญหาที่แก้ไข

UI ไม่สอดคล้องกับ Smart Contract `DeepBook.move` โดยเฉพาะเรื่อง:
1. การใช้ Global OrderBook Registry
2. Error handling ไม่ชัดเจน
3. คำอธิบายใน UI ไม่เพียงพอ
4. ไม่มีคำแนะนำการตั้งค่า registry

## ✅ สิ่งที่แก้ไขแล้ว

### 1. **contracts.ts** - เพิ่ม Functions และ Constants

```typescript
// เพิ่ม functions ใหม่ตาม DeepBook.move
DEEPBOOK_FUNCTIONS: {
  CREATE_GLOBAL_REGISTRY: "create_global_registry",
  CREATE_ORDER_BOOK_WITH_REGISTRY: "create_order_book_with_registry",
  GET_OR_CREATE: "get_or_create_order_book",
  BOOK_EXISTS: "book_exists",
  GET_BOOK_ADDRESS: "get_book_address",
  // ... functions อื่นๆ
}
```

### 2. **DeepBookInterface.tsx** - ปรับปรุง UI

#### 2.1 แสดงสถานะ Registry
- ✓ แสดงว่า registry enabled หรือไม่
- ⚠️ เตือนถ้าไม่มี registry (อนุญาตให้สร้าง duplicate books)

#### 2.2 ปรับปรุง Error Messages
- แยก error cases ชัดเจน:
  - `E_ORDERBOOK_ALREADY_EXISTS` - book ซ้ำ
  - `E_INVALID_FEE` - fee ไม่ถูกต้อง
  - `E_INVALID_DEPTH` - depth ไม่ถูกต้อง
  - `E_INSUFFICIENT_LIQUIDITY` - balance ไม่พอ
  - etc.

#### 2.3 เพิ่มคำอธิบาย UI
- Price input: อธิบาย normalized price
- Quantity input: รองรับ decimal (เช่น 0.5)
- Preview Quote: แสดง estimated quote amount
- Info tooltips (ⓘ) สำหรับแต่ละ field

#### 2.4 แสดงคำแนะนำการตั้งค่า Registry
```
⚠️ Registry not configured
Without a registry, duplicate order books can be created.

How to setup:
1. Run: iota client call --package ... --module DeepBook --function create_global_registry
2. Copy the created GlobalOrderBookRegistry object ID
3. Update CONTRACTS.REGISTRY_BOOK_ID in contracts.ts
```

#### 2.5 ปรับปรุง Success Messages
- แสดงข้อมูลชัดเจนเมื่อสร้าง book สำเร็จ
- แสดงข้อมูล order เมื่อ place order สำเร็จ
- Clear form หลัง order สำเร็จ

## 🚀 วิธีใช้งาน

### Setup Registry (แนะนำ)

1. **สร้าง Global Registry**
```bash
iota client call \
  --package 0x485e1aa43a8de8e74869ab2dbc4b97bf65cfa97bcaa3fccb419abf1e65f7cbe4 \
  --module DeepBook \
  --function create_global_registry
```

2. **Copy Object ID** จาก output:
```
Created Objects:
 - ID: 0xc0ca73e7c8fd6bee94e883c1c238dc12a4261bafd5e1a7dcbaf7e681a96d4ff2
   Owner: Shared
   Type: 0x...::DeepBook::GlobalOrderBookRegistry
```

3. **Update contracts.ts**
```typescript
REGISTRY_BOOK_ID: "0xc0ca73e7c8fd6bee94e883c1c238dc12a4261bafd5e1a7dcbaf7e681a96d4ff2"
```

### สร้าง Order Book

**กับ Registry (แนะนำ):**
- ใช้ `get_or_create_order_book` - จะคืน existing book หรือสร้างใหม่
- ป้องกัน duplicate books สำหรับ token pair เดียวกัน

**ไม่มี Registry:**
- ใช้ `create_order_book` - สร้าง book ใหม่ทุกครั้ง
- อนุญาตให้มี duplicate books (ไม่แนะนำ)

### Place Order

1. เลือก Base Token และ Quote Token
2. ใส่ Order Book Object ID
3. เลือก Side (Bid = ซื้อ, Ask = ขาย)
4. ใส่ Price (human readable, เช่น 1.5)
5. ใส่ Quantity (รองรับ decimal, เช่น 0.5)
6. ดู Preview Quote ก่อน submit
7. กด "Place Order"

## 📋 Smart Contract Functions ที่ใช้

### Registry Functions
- `create_global_registry()` - สร้าง registry ครั้งเดียว
- `create_order_book_with_registry()` - สร้าง book ผ่าน registry
- `get_or_create_order_book()` - หาหรือสร้าง (แนะนำ)
- `book_exists()` - เช็คว่า book มีอยู่หรือไม่
- `get_book_address()` - ดึง address ของ existing book

### Order Functions
- `place_bid()` - วาง buy order
- `place_ask()` - วาง sell order
- `cancel_order()` - ยกเลิก order

### Query Functions
- `get_best_bid()` / `get_best_ask()` - ราคาดีที่สุด
- `get_book_depth()` - liquidity ทั้งหมด
- `get_spread()` - ส่วนต่างราคา
- `get_all_bids()` / `get_all_asks()` - ดู order book

## 🎨 UI Improvements

### Before
- Error messages ไม่ชัดเจน
- ไม่มีคำอธิบาย normalized price
- ไม่รู้ว่าต้องตั้งค่า registry หรือไม่
- ไม่มี tooltips

### After
- ✅ Error messages แยกชัดเจนตาม error code
- ✅ แสดง normalized price พร้อมคำอธิบาย
- ✅ แสดงสถานะ registry และคำแนะนำการตั้งค่า
- ✅ Tooltips (ⓘ) ทุก field
- ✅ Preview quote amount ก่อน submit
- ✅ Success messages ละเอียด
- ✅ Clear form หลัง success

## 🔍 Testing Checklist

- [ ] สร้าง Global Registry สำเร็จ
- [ ] Update REGISTRY_BOOK_ID ใน contracts.ts
- [ ] UI แสดง "✓ Registry enabled"
- [ ] สร้าง order book สำเร็จ (ผ่าน registry)
- [ ] ลองสร้าง book ซ้ำ → ได้ error E_ORDERBOOK_ALREADY_EXISTS
- [ ] Place bid order สำเร็จ
- [ ] Place ask order สำเร็จ
- [ ] Error messages แสดงถูกต้องเมื่อมีปัญหา
- [ ] Preview quote amount ถูกต้อง
- [ ] Balance แสดงถูกต้อง

## 📝 Notes

1. **Price Scale**: DeepBook ใช้ PRICE_SCALE = 1,000,000,000 (9 decimals)
   - Human price 1.5 → Normalized 1,500,000,000
   - UI จัดการ conversion อัตโนมัติ

2. **Decimals**: แต่ละ token มี decimals ต่างกัน
   - KANARI: 9 decimals
   - IOTA: 9 decimals
   - UI ใช้ parseAmount/formatAmount สำหรับ conversion

3. **Registry Benefits**:
   - ป้องกัน duplicate books
   - ง่ายต่อการ discover books
   - เป็น single source of truth

4. **Gas Fees**: ต้องมี IOTA พอสำหรับ:
   - Create book: ~0.001-0.002 IOTA
   - Place order: ~0.0005-0.001 IOTA

## 🐛 Known Issues / TODO

- [ ] เพิ่ม feature ดู existing books ใน registry
- [ ] เพิ่ม feature cancel order
- [ ] เพิ่ม real-time order book display
- [ ] เพิ่ม trade history
- [ ] เพิ่ม charts / visualizations

## 🔗 Related Files

- `sources/DeepBook.move` - Smart contract
- `frontend/src/app/lib/contracts.ts` - Constants & helpers
- `frontend/src/app/components/DeepBookInterface.tsx` - UI component
- `DEEPBOOK_UI_GUIDE.md` - User guide
- `ORACLE_GUIDE.md` - Oracle integration guide
