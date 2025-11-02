# 📊 DeepBook UI Components

Complete UI components for interacting with the DeepBook order book system.

## 🎨 Components Overview

### 1. **OrderBookStats** - Market Statistics Dashboard
Displays comprehensive order book statistics using view functions:
- ✅ Best Bid/Ask prices
- ✅ Mid price and spread
- ✅ Order counts (bids/asks)
- ✅ Total liquidity depth
- ✅ Fee balances (collected)
- ✅ Locked balances (in orders)
- ✅ Liquidity distribution charts

**Used Functions:**
- `GET_BEST_BID`
- `GET_BEST_ASK`
- `GET_SPREAD`
- `GET_BID_COUNT`
- `GET_ASK_COUNT`
- `GET_MAX_DEPTH`
- `GET_BOOK_DEPTH`
- `GET_FEE_BALANCES`
- `GET_LOCKED_BALANCES`

### 2. **OrderDetails** - Detailed Order View
Shows detailed information about all orders with advanced filtering:
- ✅ Tabular view of all bids/asks
- ✅ Order ID, maker address, price, quantity
- ✅ Fill progress bars
- ✅ Locked amounts per order
- ✅ Click to view full order details
- ✅ Summary statistics

**Used Functions:**
- `GET_ALL_BIDS`
- `GET_ALL_ASKS`
- `GET_BID_AT`
- `GET_ASK_AT`
- `GET_BID_ID_AT`
- `GET_ASK_ID_AT`
- `GET_BID_LOCKED_AMOUNT_AT`
- `GET_ASK_LOCKED_AMOUNT_AT`

### 3. **OrderBookView** - Live Order Book
Real-time order book with trading capabilities:
- ✅ Live bid/ask orders
- ✅ Filter by your orders
- ✅ Cancel your orders
- ✅ Fill status tracking
- ✅ Auto-refresh (10s)

### 4. **QuickTrade** - Fast Trading Interface
Quick market/limit order execution:
- ✅ One-click market orders
- ✅ Quick limit order placement
- ✅ Best bid/ask display
- ✅ Slippage estimation

### 5. **PriceChart** - Price History Chart
Visual price tracking over time:
- ✅ Mid price history
- ✅ Multiple timeframes (1m, 5m, 10m, 1d, 7d, etc.)
- ✅ Interactive chart
- ✅ Real-time updates

### 6. **DeepBookInterface** - Complete Trading UI
All-in-one interface combining all features:
- ✅ Create order books
- ✅ Place orders (Limit, IOC, FOK, PostOnly)
- ✅ View order book
- ✅ Quick trade
- ✅ Price charts
- ✅ Balance display

### 7. **AdminDeepBookInterface** - Admin Panel
Admin tools for managing order books:
- ✅ Withdraw fees
- ✅ Set book admins
- ✅ View registry
- ✅ Monitor fee balances

## 🚀 Usage Examples

### Basic Integration

```tsx
import { OrderBookStats, OrderDetails, OrderBookView } from "@/app/components/DeepBook";
import { CONTRACTS } from "@/app/lib/contracts";

function MyTradingPage() {
  const bookId = "0x123..."; // Your order book ID
  const baseToken = CONTRACTS.KANARI.TYPE;
  const quoteToken = CONTRACTS.IOTA.TYPE;

  return (
    <div>
      {/* Statistics Dashboard */}
      <OrderBookStats
        bookId={bookId}
        baseToken={baseToken}
        quoteToken={quoteToken}
        baseDecimals={9}
        quoteDecimals={9}
      />

      {/* Detailed Order View */}
      <OrderDetails
        bookId={bookId}
        baseToken={baseToken}
        quoteToken={quoteToken}
        baseDecimals={9}
        quoteDecimals={6}
      />

      {/* Live Order Book */}
      <OrderBookView
        bookId={bookId}
        baseToken={baseToken}
        quoteToken={quoteToken}
        baseDecimals={9}
      />
    </div>
  );
}
```

### Dashboard Page

See `/app/deepbook-dashboard/page.tsx` for a complete dashboard example with:
- Tab navigation between different views
- Order book ID input
- Token type configuration
- Auto-refresh functionality

## 🔧 View Functions Used

All components use the following DeepBook view functions defined in `contracts.ts`:

### Registry Functions
- `CREATE_GLOBAL_REGISTRY`
- `BOOK_EXISTS`
- `GET_BOOK_ADDRESS`

### Statistics Functions
- `GET_BEST_BID` - Get highest buy price
- `GET_BEST_ASK` - Get lowest sell price
- `GET_SPREAD` - Get bid-ask spread
- `GET_BID_COUNT` - Count of buy orders
- `GET_ASK_COUNT` - Count of sell orders
- `GET_MAX_DEPTH` - Maximum orders per side
- `GET_BOOK_DEPTH` - Total liquidity on both sides
- `GET_FEE_BALANCES` - Collected fees (base, quote)
- `GET_LOCKED_BALANCES` - Locked funds in orders (base, quote)

### Order Detail Functions
- `GET_ALL_BIDS` - All buy orders
- `GET_ALL_ASKS` - All sell orders
- `GET_BID_AT` - Specific buy order by index
- `GET_ASK_AT` - Specific sell order by index
- `GET_BID_ID_AT` - Buy order ID at index
- `GET_ASK_ID_AT` - Sell order ID at index
- `GET_BID_LOCKED_AMOUNT_AT` - Locked amount for buy order
- `GET_ASK_LOCKED_AMOUNT_AT` - Locked amount for sell order

### Calculation Functions
- `CALCULATE_QUOTE_AMOUNT` - Calculate quote from base
- `CALCULATE_BASE_AMOUNT` - Calculate base from quote
- `CALCULATE_QUOTE_AMOUNT_WITH_DECIMALS` - With decimal adjustment
- `CALCULATE_BASE_AMOUNT_WITH_DECIMALS` - With decimal adjustment

### Admin Functions
- `GET_BOOK_ADMIN` - Get admin address for book
- `SET_BOOK_ADMIN` - Change book admin
- `WITHDRAW_FEES` - Withdraw collected fees

## 📊 Component Features

### Auto-Refresh
All components automatically refresh data:
- **OrderBookStats**: Every 10 seconds
- **OrderDetails**: Every 15 seconds
- **OrderBookView**: Every 10 seconds

### Error Handling
- Graceful fallbacks for missing data
- User-friendly error messages
- Retry mechanisms

### Responsive Design
- Mobile-friendly layouts
- Adaptive tables and charts
- Touch-optimized controls

### Real-time Updates
- Live price tracking
- Order status monitoring
- Balance updates

## 🎯 Access the Dashboard

Visit `/deepbook-dashboard` in your app to see all components in action!

## 📝 Notes

- All components require a valid order book ID
- Make sure tokens are properly configured in `contracts.ts`
- Components use `devInspectTransactionBlock` for read-only calls
- No transaction fees for viewing data

## 🔗 Related Files

- `contracts.ts` - Function definitions and constants
- `DeepBook.move` - Smart contract source
- `/deepbook-dashboard/page.tsx` - Example dashboard implementation

## 💡 Tips

1. **Performance**: Components cache data and use efficient polling
2. **Customization**: All components accept optional styling props
3. **Integration**: Can be used standalone or combined in a dashboard
4. **Testing**: Use the dashboard page to test all features together

---

Built with ❤️ for the IOTA ecosystem
