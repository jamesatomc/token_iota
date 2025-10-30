# DeepBook Order Management - คู่มือการใช้งาน

## 🎯 ฟีเจอร์ที่เพิ่มมา

### 1. **OrderBookView Component** 📊

แสดงรายการ orders ทั้งหมดใน order book พร้อมความสามารถในการยกเลิก

**ฟีเจอร์:**

- ✅ แสดง Bids (Buy orders) และ Asks (Sell orders) แยกกัน
- ✅ แสดงข้อมูล order: ID, Price, Quantity, Filled amount
- ✅ Highlight orders ของตัวเอง (สีฟ้า พร้อม badge "YOU")
- ✅ ปุ่ม Cancel สำหรับ orders ของตัวเอง
- ✅ Toggle "My Orders" / "All Orders"
- ✅ Auto-refresh ทุก 10 วินาที
- ✅ แสดง Summary: Total Bids, Total Asks, My Bids, My Asks

**การใช้งาน:**

1. สร้างหรือเลือก Order Book
2. Component จะแสดงอัตโนมัติด้านล่าง
3. กด "My Orders" เพื่อดูเฉพาะ orders ของตัวเอง
4. กด "❌ Cancel" เพื่อยกเลิก order (คืนเงินทันที)

### 2. **QuickTrade Component** ⚡

ซื้อ/ขายแบบด่วนที่ราคาตลาด (market order)

**ฟีเจอร์:**

- ✅ ปุ่ม Buy/Sell แยกชัดเจน (เขียว/แดง)
- ✅ แสดง Best Ask (สำหรับ buy) หรือ Best Bid (สำหรับ sell)
- ✅ คำนวณ Estimated Total อัตโนมัติ
- ✅ รวม 1% slippage buffer เพื่อป้องกัน price movement
- ✅ Execute ทันทีที่ราคาดีที่สุด

**การใช้งาน:**

1. เลือก Buy หรือ Sell
2. ใส่ Quantity
3. ดู Estimated Total
4. กด "Buy Now" หรือ "Sell Now"

### 3. **Cancel Order Function** ❌

ยกเลิก limit order และคืนเงินที่ lock ไว้

**วิธีการ:**

- ใน OrderBookView หา order ของตัวเอง
- กดปุ่ม "❌ Cancel"
- ยืนยัน
- เงินจะถูกคืนทันที

## 🔧 Technical Details

### OrderBookView.tsx

**Props:**

```typescript
{
  bookId: string;           // OrderBook object ID
  baseToken: string;        // Base token type
  quoteToken: string;       // Quote token type
  baseDecimals?: number;    // Base token decimals (default 9)
  quoteDecimals?: number;   // Quote token decimals (default 9)
}
```

**State Management:**

- `bids: Order[]` - รายการ buy orders
- `asks: Order[]` - รายการ sell orders
- `loading: boolean` - สถานะการโหลด
- `cancelling: string | null` - order ID ที่กำลังยกเลิก
- `showMyOrders: boolean` - toggle แสดงเฉพาะ orders ของตัวเอง

**Data Fetching:**

- ดึงข้อมูลจาก OrderBook object ผ่าน `client.getObject()`
- Parse `fields.bids` และ `fields.asks`
- Auto-refresh ทุก 10 วินาที

**Cancel Logic:**

```typescript
tx.moveCall({
  target: "PACKAGE::DeepBook::cancel_order",
  arguments: [
    tx.object(bookId),      // OrderBook
    tx.pure.u64(orderId)    // Order ID to cancel
  ],
  typeArguments: [baseToken, quoteToken]
});
```

### QuickTrade.tsx

**Props:**

```typescript
{
  bookId: string;
  baseToken: string;
  quoteToken: string;
  baseDecimals?: number;
  quoteDecimals?: number;
  bestBidPrice?: string;    // จาก parent component
  bestAskPrice?: string;    // จาก parent component
}
```

**Market Order Logic:**

- **Buy:** Place bid ที่ราคา `bestAskPrice` (ราคาขายที่ต่ำที่สุด)
  - จะ match ทันทีกับ sell orders ที่มีอยู่
  - รวม 1% buffer: `requiredQuote * 101 / 100`

- **Sell:** Place ask ที่ราคา `bestBidPrice` (ราคาซื้อที่สูงที่สุด)
  - จะ match ทันทีกับ buy orders ที่มีอยู่

### DeepBookInterface.tsx Updates

**New State:**

```typescript
const [bestBidPrice, setBestBidPrice] = useState<string | undefined>();
const [bestAskPrice, setBestAskPrice] = useState<string | undefined>();
```

**Best Price Fetching:**

- ดึงทุก 10 วินาที
- อ่านจาก `fields.bids[0].price` และ `fields.asks[0].price`
- ส่งให้ QuickTrade component

## 📱 UI Layout

```
DeepBookInterface
├── Create Order Book Section
├── Place Limit Order Section
└── (if bookId exists)
    ├── QuickTrade Component  ⚡
    └── OrderBookView Component 📊
        ├── Toggle: My Orders / All Orders
        ├── Refresh Button
        ├── Bids Column (Green)
        │   └── Orders with Cancel buttons
        └── Asks Column (Red)
            └── Orders with Cancel buttons
```

## 🎨 Visual Design

### OrderBookView

- **Bids (Buy):** 🟢 สีเขียว
- **Asks (Sell):** 🔴 สีแดง
- **My Orders:** สีฟ้า พร้อม badge "YOU"
- **Cancel Button:** สีแดงอ่อน

### QuickTrade

- **Buy Mode:** ปุ่มเขียว, แสดง Best Ask
- **Sell Mode:** ปุ่มแดง, แสดง Best Bid
- **Estimated Total:** กล่องสีฟ้า

## 🧪 Testing Steps

### 1. Test Order Book Display

- [ ] สร้าง order book
- [ ] Place บาง orders (ทั้ง bid และ ask)
- [ ] ตรวจสอบว่า OrderBookView แสดงผลถูกต้อง
- [ ] ทดสอบ Auto-refresh (รอ 10 วินาที)

### 2. Test My Orders Filter

- [ ] Place orders จาก account ของตัวเอง
- [ ] กด "My Orders" toggle
- [ ] ตรวจสอบว่าแสดงเฉพาะ orders ของตัวเอง
- [ ] ตรวจสอบว่ามี badge "YOU"

### 3. Test Cancel Order

- [ ] Place limit order (bid หรือ ask)
- [ ] หา order ใน OrderBookView
- [ ] กด "❌ Cancel"
- [ ] Confirm transaction
- [ ] ตรวจสอบว่าเงินถูกคืน
- [ ] ตรวจสอบว่า order หายจาก list

### 4. Test Quick Trade (Buy)

- [ ] มี sell orders ใน book
- [ ] เลือก "Buy" ใน QuickTrade
- [ ] ใส่ quantity
- [ ] ตรวจสอบ Estimated Total
- [ ] กด "Buy Now"
- [ ] ตรวจสอบว่า order execute ทันที
- [ ] ตรวจสอบ balance เปลี่ยน

### 5. Test Quick Trade (Sell)

- [ ] มี buy orders ใน book
- [ ] เลือก "Sell" ใน QuickTrade
- [ ] ใส่ quantity
- [ ] ตรวจสอบ Estimated Total
- [ ] กด "Sell Now"
- [ ] ตรวจสอบว่า order execute ทันที
- [ ] ตรวจสอบ balance เปลี่ยน

## 🐛 Error Handling

### Cancel Order Errors

```typescript
E_ORDER_NOT_FOUND:  "Order not found (อาจถูก fill หรือยกเลิกแล้ว)"
E_UNAUTHORIZED:     "Unauthorized (ยกเลิกได้แค่ order ของตัวเองเท่านั้น)"
```

### Quick Trade Errors

```typescript
"No sell orders available":  ไม่มี ask orders ให้ match (สำหรับ buy)
"No buy orders available":   ไม่มี bid orders ให้ match (สำหรับ sell)
"No quote token available":  ไม่มี quote token (สำหรับ buy)
"No base token available":   ไม่มี base token (สำหรับ sell)
```

## 💡 Tips & Best Practices

### 1. Limit Orders vs Quick Trade

- **Limit Order:** ใช้เมื่อต้องการควบคุมราคาแน่นอน, อาจไม่ execute ทันที
- **Quick Trade:** ใช้เมื่อต้องการ execute ทันทีที่ราคาตลาด

### 2. Cancel Strategy

- Cancel orders เมื่อราคาตลาดเปลี่ยนไป
- Cancel partially filled orders ถ้าไม่ต้องการ fill ส่วนที่เหลือ
- ไม่มีค่าธรรมเนียมในการ cancel

### 3. Slippage Buffer

- Quick Trade รวม 1% buffer
- ถ้าราคาเปลี่ยนมากกว่า 1% อาจ fail
- สามารถปรับ buffer ได้ใน code

### 4. Gas Optimization

- Merge coins ก่อน split (ลด transaction size)
- Cancel หลาย orders ใน 1 transaction ถ้าต้องการ (ต้อง batch)

## 🔗 Related Files

- `frontend/src/app/components/OrderBookView.tsx` - แสดง order book
- `frontend/src/app/components/QuickTrade.tsx` - quick buy/sell
- `frontend/src/app/components/DeepBookInterface.tsx` - main interface
- `sources/DeepBook.move` - smart contract

## 📝 Future Enhancements

- [ ] Chart visualization สำหรับ order book depth
- [ ] Trade history
- [ ] Advanced order types (stop-loss, trailing stop)
- [ ] Order book aggregation (รวม multiple books)
- [ ] Mobile-optimized view
- [ ] WebSocket real-time updates
- [ ] Price alerts
- [ ] Batch cancel (ยกเลิกหลาย orders พร้อมกัน)

## 🎯 Summary

ตอนนี้ DeepBook UI มี:

1. ✅ Create order books (with registry)
2. ✅ Place limit orders (bid/ask)
3. ✅ **View all orders (new!)**
4. ✅ **Filter my orders (new!)**
5. ✅ **Cancel orders (new!)**
6. ✅ **Quick trade at market price (new!)**
7. ✅ Real-time balance display
8. ✅ Auto-refresh data
9. ✅ Comprehensive error messages

Happy Trading! 🚀
