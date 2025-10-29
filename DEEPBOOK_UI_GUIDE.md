# DeepBook UI Integration Guide

## Overview

Created a complete trading interface for the DeepBook Central Limit Order Book (CLOB) system on IOTA.

## What Was Created

### 1. **DeepBookInterface.tsx** (`frontend/src/app/components/DeepBookInterface.tsx`)

A comprehensive trading interface component with:

#### Features

- **Order Book Creation**: Initialize new KANARI/IOTA order books
- **Buy/Sell Orders**: Place bid (buy) and ask (sell) limit orders
- **Price Calculation**: Automatic total calculation based on price × quantity
- **Market Info Display**: Shows best bid, best ask, and spread
- **Order Book Visualization**: Displays bids and asks (ready for live data integration)
- **Normalized Pricing**: Uses `PRICE_SCALE = 1_000_000_000` to match smart contract

#### Key Functions

```typescript
handleCreateBook()      // Create new order book with 0.3% fee
handlePlaceBid()        // Place buy order (requires IOTA payment)
handlePlaceAsk()        // Place sell order (requires KANARI tokens)
calculateNormalizedPrice() // Convert human-readable price to contract format
```

### 2. **Page Integration** (`frontend/src/app/page.tsx`)

- Added new "Order Book" tab in navigation
- Integrated DeepBookInterface component
- Styled with purple accent to differentiate from other tabs

### 3. **TypeScript Configuration** (`frontend/tsconfig.json`)

- Updated target from ES2017 to ES2020 to support BigInt literals

## How to Use

### For Users

1. **Connect Wallet**: Click "Connect Button" in header
2. **Navigate to Order Book Tab**: Click purple "Order Book" button
3. **Enter Order Book Address**:
   - If order book exists, paste its address
   - If creating new, leave empty and click "Create New Book"
4. **Place Orders**:
   - Choose Buy or Sell
   - Enter price (in IOTA per KANARI)
   - Enter quantity (in KANARI)
   - Review total amount
   - Click "Place Buy/Sell Order"

### For Developers

#### Smart Contract Integration Points

```typescript
// Create Order Book
${PACKAGE_ID}::DeepBook::create_order_book<Base, Quote>(fee_bps: u64)

// Place Buy Order (Bid)
${PACKAGE_ID}::DeepBook::place_bid<Base, Quote>(
  book: &mut OrderBook<Base, Quote>,
  price: u64,              // normalized price
  quantity: u64,           // base token amount
  payment: Coin<Quote>     // quote token payment
)

// Place Sell Order (Ask)
${PACKAGE_ID}::DeepBook::place_ask<Base, Quote>(
  book: &mut OrderBook<Base, Quote>,
  price: u64,              // normalized price
  quantity: u64,           // base token amount
  base_coin: Coin<Base>    // base token to sell
)

// Cancel Order
${PACKAGE_ID}::DeepBook::cancel_order<Base, Quote>(
  book: &mut OrderBook<Base, Quote>,
  order_id: u64
)
```

#### Price Normalization

```typescript
// Formula: normalized_price = (quote_amount * PRICE_SCALE) / base_amount
// Example: 1 KANARI = 0.5 IOTA
// normalized_price = 0.5 * 1_000_000_000 = 500_000_000
```

## Next Steps for Full Functionality

### 1. **Query Order Book State**

Currently the UI shows mock data. You need to:

- Fetch actual order book state from blockchain
- Display real bids and asks
- Show user's open orders

#### Suggested Implementation

```typescript
// In contracts.ts, add:
export const DEEPBOOK_FUNCTIONS = {
  GET_BEST_BID: "get_best_bid",
  GET_BEST_ASK: "get_best_ask",
  GET_BOOK_DEPTH: "get_book_depth",
};

// In DeepBookInterface.tsx, use @iota/dapp-kit hooks:
import { useIotaClientQuery } from "@iota/dapp-kit";

const { data: orderBookData } = useIotaClientQuery(
  "getObject",
  { id: bookAddress, options: { showContent: true } }
);
```

### 2. **User Order Management**

Add ability to:

- View user's open orders
- Cancel orders with one click
- Track order history
- Display filled/partial fills

### 3. **Real-Time Updates**

Implement WebSocket or polling for:

- Live order book updates
- Recent trades
- Price charts
- Market depth visualization

### 4. **Enhanced UI Features**

- Order book depth chart (visual representation)
- Price chart with candlesticks
- Trade history table
- Order form presets (25%, 50%, 75%, 100% of balance)
- Keyboard shortcuts for traders

### 5. **Token Selection**

Currently hardcoded to KANARI/IOTA. Add:

- Token selector for different pairs
- Multi-market support
- Popular pairs sidebar

## Technical Notes

### Price Scale Explanation

The smart contract uses a normalized price system to handle tokens with different decimals:

```
normalized_price = (quote_amount * PRICE_SCALE) / base_amount

Where PRICE_SCALE = 1,000,000,000 (9 decimals)

Example:
- User wants: 1 KANARI for 0.5 IOTA
- normalized_price = 0.5 * 1_000_000_000 = 500_000_000
- Stored in contract as: 500000000
```

### Fee Structure

- Default fee: 0.3% (30 basis points)
- Taker pays fees (market orders that match immediately)
- Maker orders (resting in book) don't pay fees until matched

### Order Matching

1. New order attempts immediate matching
2. Best price orders matched first
3. Partial fills supported
4. Unmatched quantity stays in order book
5. Funds locked until order filled or cancelled

## Testing Checklist

- [ ] Create new order book
- [ ] Place buy order with sufficient IOTA
- [ ] Place sell order with sufficient KANARI
- [ ] Verify price calculations are correct
- [ ] Test order cancellation
- [ ] Check fee deduction
- [ ] Verify fund refunds on cancel
- [ ] Test with different token decimals
- [ ] Ensure UI updates after transactions
- [ ] Verify error messages for insufficient funds

## Common Issues & Solutions

### Issue: "Failed to place order"

**Solution**: Ensure you have:

- Sufficient IOTA for buy orders (price × quantity)
- Sufficient KANARI for sell orders
- Order book address is correct
- Wallet is connected

### Issue: "Invalid price"

**Solution**:

- Price must be positive
- Use reasonable decimals (max 9)
- Check market prices first

### Issue: "Transaction failed"

**Solution**:

- Check gas fees
- Verify token approvals
- Ensure order book object is shared
- Check blockchain explorer for detailed error

## Architecture Benefits

✅ **Token Agnostic**: Works with any token decimal configuration
✅ **Capital Efficient**: Funds locked per order, not globally
✅ **Fair Matching**: Price-time priority algorithm
✅ **Fee Transparent**: Clear 0.3% taker fee display
✅ **Immediate Execution**: Market orders match instantly
✅ **Cancel Anytime**: Get funds back on unmatched orders

## Resources

- Move Contract: `sources/DeepBook.move`
- UI Component: `frontend/src/app/components/DeepBookInterface.tsx`
- Contract Config: `frontend/src/app/lib/contracts.ts`
- Improvements Doc: `DEEPBOOK_IMPROVEMENTS.md`

---

**Ready to Trade!** 🚀

The UI is now integrated and ready for testing. Connect your wallet and start placing orders on the DeepBook!
