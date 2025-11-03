# PriceOracle (TWAP) — เอกสาร

เอกสารนี้อธิบายโมดูล `kanari_network::PriceOracle` ซึ่งให้บริการตัววัดราคาแบบ TWAP (Time-Weighted Average Price) สำหรับคู่สภาพคล่องภายใน DEX

## ภาพรวม

- โมดูลเก็บชุดของ "observations" (timestamp + cumulative price) เพื่อคำนวณราคาเฉลี่ยถ่วงเวลา (TWAP)
- ใช้ precision เท่ากับ 9 ทศนิยม (ค่า `PRICE_PRECISION = 1_000_000_000`) เพื่อหลีกเลี่ยงการสูญเสียความแม่นยำ
- ป้องกันการ overflow ในการคำนวนโดยใช้เช็คกับ `U128_MAX`
- เหมาะสำหรับการป้องกันการจัดการราคา (price manipulation) เมื่อเรียก TWAP แทน spot price

## คอนสแตนต์สำคัญ

- `PRICE_PRECISION: u128` — ความแม่นยำของราคา (9 decimals)
- `MIN_OBSERVATION_INTERVAL: u64` — ระยะเวลาขั้นต่ำระหว่าง observation (10 วินาที)
- `U128_MAX: u128` — ค่าสูงสุดของ u128 เพื่อเช็ค overflow

## โครงสร้างข้อมูล (structs)

- `Observation { timestamp: u64, price_cumulative: u128 }`
  - แต่ละ observation เป็นเวลาที่บันทึกและค่าราคาแบบสะสม (price * time)
- `PriceOracle<phantom X, phantom Y> { id: UID, pool_id: address, observations: vector<Observation>, max_observations: u64, last_price_cumulative: u128 }`
  - `pool_id`: บ่งชี้ pool ที่ oracle นี้สอดคล้อง
  - `observations`: เก็บ observation เรียงตามเวลา
  - `max_observations`: จำกัดจำนวน observations เพื่อประหยัด gas

## เหตุการณ์ (events)

- `OracleCreated { oracle_id, pool_id, max_observations }`
- `OracleUpdated { oracle_id, pool_id, timestamp, price_cumulative, current_price }`
- `TWAPCalculated { oracle_id, twap_price, time_window, observations_used }`

เหตุการณ์ช่วยให้ระบบภายนอก (indexer / backend) ติดตามสถานะ oracle ได้

## ฟังก์ชันสาธารณะ (API)

- `create_oracle<X, Y>(pool, max_observations, clock, ctx) -> PriceOracle<X,Y>`
  - สร้าง oracle ใหม่พร้อม observation แรก
  - ตรวจสอบว่า `max_observations > 0`
  - คืนค่า `PriceOracle` และ emit `OracleCreated`

- `create_and_share_oracle<X, Y>(pool, max_observations, clock, ctx)`
  - wrapper สำหรับ entry: สร้าง oracle แล้ว `transfer::share_object` เพื่อแจกจ่าย

- `update_oracle<X, Y>(oracle, pool, clock)`
  - อัปเดต oracle โดยคำนวณราคา ณ ปัจจุบัน (reserve_y / reserve_x) คูณ `PRICE_PRECISION`
  - คำนวณ `price_delta = current_price * time_delta` แล้วเพิ่มเข้า `last_price_cumulative`
  - บันทึก observation ใหม่ และ emit `OracleUpdated`
  - ตรวจสอบความสอดคล้องของ `pool_id` และ liquidity > 0
  - จะข้ามการอัปเดตถ้าไม่มีเวลาผ่านตั้งแต่ observation ล่าสุด หรือถ้ายังไม่พ้น `MIN_OBSERVATION_INTERVAL`

- `get_twap_price<X, Y>(oracle, time_window, clock) -> u128`
  - คำนวณ TWAP ภายใน `time_window` วินาที โดยหา observation เริ่มต้นที่ใกล้เคียงกับ `current_time - time_window`
  - ใช้ `find_observation_index` (binary search) เพื่อหาดัชนีเริ่มต้น
  - คืนค่า TWAP (ค่าในหน่วยเดียวกับ `PRICE_PRECISION`)
  - emit `TWAPCalculated`

- `get_spot_price<X, Y>(pool) -> u128`
  - คืนราคา spot = reserve_y * PRICE_PRECISION / reserve_x
  - ตรวจสอบ liquidity และ overflow

- `get_twap_price_at_time<X,Y>(oracle, time_window, current_timestamp_ms) -> u128`
  - เวอร์ชันที่รับ timestamp ภายนอก (สำหรับการคิวรี off-chain)

- View helpers: `get_observation_count`, `get_oldest_observation_time`, `get_latest_observation_time`, `get_pool_id`, `get_max_observations`, `get_last_price_cumulative`, `get_observation_at_index`

## อัลกอริทึมสำคัญ / หมายเหตุเชิงเทคนิค

- ค่า `price_cumulative` ถูกเก็บเป็นผลรวมของ (price * time) ในหน่วยของ seconds และ precision ถูกบังคับโดย `PRICE_PRECISION` เพื่อรักษาความแม่นยำ
- เมื่อคำนวณ TWAP: (end.price_cumulative - start.price_cumulative) / (end.timestamp - start.timestamp)
- `find_observation_index` ใช้ binary search บน vector ที่เรียงตาม timestamp เพื่อหา observation ที่ "มากที่สุดที่ยังไม่เกิน target_time" (rightmost <= target_time)
- ป้องกัน overflow โดยการเช็คก่อนการคูณ/บวกทั้งหมด

## ข้อควรระวัง / edge cases

- หากไม่มี liquidity (reserve_x หรือ reserve_y == 0) จะ abort ด้วย `E_INSUFFICIENT_LIQUIDITY`
- หากไม่มี observation มากพอสำหรับการคำนวณ TWAP จะ abort ด้วย `E_NO_OBSERVATIONS`
- ระวังการตั้ง `max_observations` ต่ำเกินไป: อาจเสียข้อมูลเชิงประวัติ
- การอัปเดต oracle ควรถูกเรียกเป็นระยะ (เช่น โดย service ภายนอกหรือ transaction ที่เกี่ยวข้องกับ pool) เพื่อรักษาความแม่นยำของ TWAP

## ตัวอย่างการใช้งาน (front-end / off-chain)

1) สร้างและแชร์ oracle (entry call ผ่าน DEXFactory):

- Frontend เรียก `kanari_network::DEXFactory::create_oracle<X,Y>(pool, max_observations, clock, ctx)`
- Oracle จะถูกสร้างและ `share_object` กลับไปยัง caller (หรือเก็บไว้ใน registry ตามการออกแบบ)

2) อัปเดต oracle (ใครก็ได้สามารถเรียก):

- เรียก `kanari_network::PriceOracle::update_oracle(&mut oracle, &pool, &clock)`
- แนะนำให้เรียกเมื่อมีเหตุการณ์สำคัญ (เช่น trade, liquidity change) หรือ schedule เป็นงาน background

3) อ่าน TWAP off-chain:

- ดึง `observations` และเรียก `get_twap_price_at_time(oracle, window_in_seconds, current_timestamp_ms)` เพื่อคำนวณ

## คำแนะนำสำหรับการรวมกับระบบภายนอก

- Emit events (`OracleCreated`, `OracleUpdated`, `TWAPCalculated`) จะช่วยให้ backend/ indexer ติดตาม state ได้อย่างน่าเชื่อถือ
- ให้มี worker process ที่คอยเรียก `update_oracle` เป็นระยะ (แต่ต้องพิจารณา gas/tx cost)

---

เอกสารนี้ควรเป็นจุดเริ่มต้น — หากต้องการ ตัวอย่าง unit tests หรือ script สำหรับ simulation (เช่น เทสการคำนวณ TWAP ในหลายช่วงเวลา) ผมสามารถเพิ่มให้ได้

## การใช้ผ่าน CLI (iota client)

ด้านล่างเป็นตัวอย่างคำสั่ง `iota client` ที่สอดคล้องกับตัวอย่างใน `README.md` — ปรับค่า `<PACKAGE_ID>`, `<REGISTRY_ID>`, `<POOL_ID>`, `<ORACLE_ID>`, `<CLOCK_ID>`, และชนิดโทเคนให้ตรงกับการ deploy ของคุณ

- สร้าง Oracle ผ่าน `DEXFactory` (entry wrapper)

```powershell
iota client call \
  --package <PACKAGE_ID> \
  --module DEXFactory \
  --function create_oracle \
  --type-args <TOKEN_X_TYPE> <TOKEN_Y_TYPE> \
  --args <POOL_ID> <MAX_OBSERVATIONS> <CLOCK_ID>
```

อาร์กิวเมนต์ตามลำดับ: `pool` object id, `max_observations` (u64), `clock` object id. คำสั่งนี้จะสร้าง oracle แล้ว `share_object` กับ caller — ให้ดูผลลัพธ์ของธุรกรรมเพื่อรับ `oracle` object id

- อัปเดต Oracle (ใครก็ได้เรียกได้ — เป็น entry ผ่าน `DEXFactory`)

```powershell
iota client call \
  --package <PACKAGE_ID> \
  --module DEXFactory \
  --function update_oracle \
  --type-args <TOKEN_X_TYPE> <TOKEN_Y_TYPE> \
  --args <ORACLE_ID> <POOL_ID> <CLOCK_ID> \
  --gas-budget 1000000
```

อาร์กิวเมนต์: `oracle` object id (mutable), `pool` object id, `clock` object id. เพิ่ม `--gas-budget` ตามความเหมาะสมหากธุรกรรมมีความซับซ้อนหรือเกิด gas error

- คำนวณ TWAP แบบอ่าน-only (off-chain / view)

```powershell
iota client call \
  --package <PACKAGE_ID> \
  --module PriceOracle \
  --function get_twap_price_at_time \
  --type-args <TOKEN_X_TYPE> <TOKEN_Y_TYPE> \
  --args <ORACLE_ID> <TIME_WINDOW_SECONDS> <CURRENT_TIMESTAMP_MS>
```

ผลลัพธ์จะคืนค่า `u128` ในหน่วยเดียวกับ `PRICE_PRECISION` (9 decimals). หากต้องการราคาเป็นทศนิยม ให้หารด้วย `PRICE_PRECISION` เช่น `twap_u128 / 1_000_000_000` เพื่อให้ได้ค่า Y per X

- ดึงข้อมูลวัตถุที่เป็นประโยชน์ (ค้นหา `PriceOracle` / `LiquidityPool` / `Coin` ของผู้ใช้)

```powershell
iota client objects --owner <ADDRESS> --json
```

จากรายการนี้ ให้หา object id ของ `PriceOracle<...>`, `LiquidityPool<...>` และ `Coin<...>` ที่ต้องการนำมาใช้เป็นอาร์กิวเมนต์

## คำแนะนำเพิ่มเติม

- การเรียก `update_oracle` บ่อยเกินไปจะมีค่าใช้จ่ายเป็น gas — ให้เรียกเมื่อมีกิจกรรมใน pool หรือตั้ง worker ที่รันเป็นระยะ (เช่น ทุก 10–30 วินาที ขึ้นกับ `MIN_OBSERVATION_INTERVAL` และความต้องการความแม่นยำ)
- เก็บ `oracle` object id และ `pool` id ใน backend/config ของคุณ เพื่อให้ง่ายต่อการเรียกผ่าน CLI หรือ script
- หากต้องการสคริปต์อัตโนมัติ: ใช้ `iota client call` จาก shell script / CI job และ parse JSON output เพื่อดึง object ids และค่า TWAP

---

ต้องการให้ผมเพิ่มตัวอย่างสคริปต์ PowerShell/Node.js ที่เรียกคำสั่งเหล่านี้และ parse ผลลัพธ์ให้อัตโนมัติไหม? ผมสามารถเพิ่มตัวอย่างสั้น ๆ ให้ได้