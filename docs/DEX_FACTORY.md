# DEXFactory — เอกสาร

เอกสารนี้สรุปฟังก์ชันสาธารณะของ `kanari_network::DEXFactory` ซึ่งเป็นชั้น wrapper สำหรับการสร้างและจัดการ liquidity pools และการเชื่อมต่อกับ PriceOracle

## ภาพรวม

- `DEXFactory` ให้ entry functions ที่เป็นทางการสำหรับ front-end/ผู้ใช้ (entry fun) เพื่อสร้าง registry, สร้าง pool, เพิ่ม/ถอนสภาพคล่อง และ swap
- มี helper สำหรับสร้างและแชร์ PriceOracle สำหรับ pool ได้สะดวก
- ออกแบบให้ front-end เรียก entry functions แล้วโมดูลภายใน (`kanari_network::DEX`) ดำเนินการธุรกรรมหลักๆ

## ฟังก์ชันสาธารณะ (entry / helpers)

- `create_registry(ctx)`
  - เรียก `DEX::create_global_registry` — ต้องเรียกครั้งเดียวก่อนสร้าง pool ใดๆ

- `create_pool<X, Y>(registry, fee_bps, ctx)`
  - สร้าง liquidity pool ใหม่สำหรับคู่ X/Y โดยส่ง `fee_bps` (basis points)
  - ใช้ generic types เพื่อรองรับ token ต่างๆ

- `get_pool_address<X, Y>(registry) -> Option<address>`
  - helper สำหรับ frontend เพื่อค้นหา address ของ pool สำหรับคู่โทเคน (ไม่สนใจลำดับ)

- `add_liquidity<X, Y>(pool, coin_x, coin_y, min_lp_out, ctx)`
  - เพิ่มสภาพคล่อง โดยเรียก `DEX::add_liquidity` แล้วโอน LP token กลับไปที่ `ctx.sender()` (ผ่าน `transfer::public_transfer`)
  - `min_lp_out` ป้องกัน frontrun / slippage ในการรับ LP

- `remove_liquidity<X, Y>(pool, lp_token, min_x_out, min_y_out, ctx)`
  - ถอนสภาพคล่องและโอนเหรียญ X, Y กลับให้ `ctx.sender()`

- `swap_x_to_y<X, Y>(pool, coin_x, min_y_out, ctx)`
  - swap จาก X -> Y และโอนผลลัพธ์ให้ผู้เรียก

- `swap_y_to_x<X, Y>(pool, coin_y, min_x_out, ctx)`
  - swap จาก Y -> X และโอนผลลัพธ์ให้ผู้เรียก

## Integration กับ PriceOracle

- `create_oracle<X, Y>(pool, max_observations, clock, ctx)`
  - wrapper ที่เรียก `PriceOracle::create_and_share_oracle` เพื่อสร้าง oracle สำหรับ pool นั้นๆ

- `update_oracle<X, Y>(oracle, pool, clock)`
  - wrapper สำหรับอัปเดต observation ของ oracle (ใครก็ได้เรียกได้)

## คำแนะนำสำหรับ frontend

- เรียก `create_registry` หนึ่งครั้งเมื่อระบบเริ่มต้น
- เมื่อสร้าง pool ใหม่: `create_pool<X,Y>` ใส่ `fee_bps` ให้เหมาะสม (เช่น 30 => 0.30%)
- เมื่อต้องการเพิ่มสภาพคล่อง: เรียก `add_liquidity` ส่งเหรียญทั้งสอง เหตุการณ์จะโอน LP token ไปยังผู้เรียกโดยอัตโนมัติ
- สำหรับ swap: ให้ส่ง `min_*_out` เพื่อป้องกัน slippage
- หากต้องการให้ pool มี oracle แบบ TWAP: เรียก `create_oracle` หลังจาก pool ถูกสร้างแล้ว และเรียก `update_oracle` เป็นระยะ (โดย worker หรือ triggered อีเวนต์)

## ข้อควรระวัง

- ตรวจสอบค่าพารามิเตอร์ `min_lp_out` / `min_*_out` เพื่อหลีกเลี่ยงการสูญเสียจาก slippage
- ค่า `fee_bps` ควรตั้งตามค่าที่แข่งขันได้และสมเหตุสมผลสำหรับผู้ให้สภาพคล่อง
- การเรียก `update_oracle` บ่อยเกินไปจะเสียค่า gas; ควรวางแผนให้เรียกเป็นระยะหรือเมื่อมีกิจกรรมสำคัญใน pool

---

หากต้องการตัวอย่างโค้ด front-end (เช่น ใน `frontend/src/lib/contracts.ts`) เพื่อเรียกฟังก์ชันเหล่านี้ ผมสามารถเพิ่มตัวอย่างการเรียก Transaction และการจัดการผลลัพธ์ให้ได้