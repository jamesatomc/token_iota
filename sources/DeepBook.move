module kanari_network::DeepBook;

use iota::balance::{Self, Balance};
use iota::coin::{Self, Coin};
use iota::event;

// Error codes
const E_INSUFFICIENT_LIQUIDITY: u64 = 1;
const E_INVALID_PRICE: u64 = 2;
const E_INVALID_QUANTITY: u64 = 3;
const E_ORDER_NOT_FOUND: u64 = 4;
const E_UNAUTHORIZED: u64 = 5;
const E_INVALID_FEE: u64 = 6;

// Price scale factor (normalize prices to 9 decimals)
const PRICE_SCALE: u128 = 1_000_000_000;

/// Limit order in the book
public struct LimitOrder has copy, drop, store {
    id: u64,
    maker: address,
    is_bid: bool,
    price: u64,         // price in PRICE_SCALE units
    quantity: u64,      // quantity in base token units
    filled: u64,        // filled amount
    locked_amount: u64, // locked funds (quote for bid, base for ask)
}

/// Central limit order book
public struct OrderBook<phantom Base, phantom Quote> has key {
    id: UID,
    next_order_id: u64,
    bids: vector<LimitOrder>,
    asks: vector<LimitOrder>,
    base_balance: Balance<Base>,
    quote_balance: Balance<Quote>,
    fee_balance_base: Balance<Base>,   // collected fees in base
    fee_balance_quote: Balance<Quote>, // collected fees in quote
    fee_bps: u64, // fee in basis points (e.g., 30 = 0.3%)
}

// Events
public struct OrderPlaced has copy, drop {
    book_id: address,
    order_id: u64,
    maker: address,
    is_bid: bool,
    price: u64,
    quantity: u64,
}

public struct OrderMatched has copy, drop {
    book_id: address,
    order_id: u64,
    taker: address,
    maker: address,
    price: u64,
    quantity: u64,
}

public struct OrderCancelled has copy, drop {
    book_id: address,
    order_id: u64,
}

/// Create a new order book
public entry fun create_order_book<Base, Quote>(
    fee_bps: u64,
    ctx: &mut tx_context::TxContext
) {
    assert!(fee_bps <= 1000, E_INVALID_FEE); // max 10%
    
    let book = OrderBook<Base, Quote> {
        id: object::new(ctx),
        next_order_id: 1,
        bids: vector::empty(),
        asks: vector::empty(),
        base_balance: balance::zero(),
        quote_balance: balance::zero(),
        fee_balance_base: balance::zero(),
        fee_balance_quote: balance::zero(),
        fee_bps,
    };
    
    transfer::share_object(book);
}

/// Place a limit buy order (bid)
/// price: normalized price (quote_amount * PRICE_SCALE / base_amount)
/// quantity: amount of base token to buy
/// payment: quote token payment (must be >= quantity * price / PRICE_SCALE)
public entry fun place_bid<Base, Quote>(
    book: &mut OrderBook<Base, Quote>,
    price: u64,
    quantity: u64,
    mut payment: Coin<Quote>,
    ctx: &mut tx_context::TxContext
) {
    assert!(price > 0, E_INVALID_PRICE);
    assert!(quantity > 0, E_INVALID_QUANTITY);
    
    let maker = tx_context::sender(ctx);
    
    // Calculate required quote amount: (quantity * price) / PRICE_SCALE
    let required_quote = ((quantity as u128) * (price as u128) / PRICE_SCALE) as u64;
    let payment_value = coin::value(&payment);
    assert!(payment_value >= required_quote, E_INSUFFICIENT_LIQUIDITY);
    
    // Split exact amount needed, return excess
    let locked_payment = if (payment_value > required_quote) {
        let excess = coin::split(&mut payment, payment_value - required_quote, ctx);
        transfer::public_transfer(excess, maker);
        payment
    } else {
        payment
    };
    
    // Add payment to book balance
    let payment_balance = coin::into_balance(locked_payment);
    balance::join(&mut book.quote_balance, payment_balance);
    
    let order_id = book.next_order_id;
    book.next_order_id = order_id + 1;
    
    let mut remaining = quantity;
    let mut remaining_locked = required_quote;
    
    // Try to match with existing asks
    let mut i = 0;
    while (i < vector::length(&book.asks) && remaining > 0) {
        let ask = vector::borrow_mut(&mut book.asks, i);
        
        if (ask.price <= price) {
            let available = ask.quantity - ask.filled;
            let matched = if (available <= remaining) { available } else { remaining };
            
            // Calculate amounts
            let match_price = ask.price; // use ask price for execution
            let quote_amount = ((matched as u128) * (match_price as u128) / PRICE_SCALE) as u64;
            
            // Calculate and collect fee from taker (buyer)
            let fee_amount = (quote_amount * book.fee_bps) / 10000;
            let maker_receives = quote_amount - fee_amount; // maker gets amount minus fee
            
            // Update order
            ask.filled = ask.filled + matched;
            remaining = remaining - matched;
            remaining_locked = remaining_locked - quote_amount - fee_amount;
            
            // Transfer base to taker (buyer)
            let base_to_taker = balance::split(&mut book.base_balance, matched);
            transfer::public_transfer(
                coin::from_balance(base_to_taker, ctx),
                maker
            );
            
            // Transfer quote to maker (seller)
            let quote_to_maker = balance::split(&mut book.quote_balance, maker_receives);
            transfer::public_transfer(
                coin::from_balance(quote_to_maker, ctx),
                ask.maker
            );
            
            // Collect fee
            let fee_collected = balance::split(&mut book.quote_balance, fee_amount);
            balance::join(&mut book.fee_balance_quote, fee_collected);
            
            event::emit(OrderMatched {
                book_id: object::uid_to_address(&book.id),
                order_id: ask.id,
                taker: maker,
                maker: ask.maker,
                price: match_price,
                quantity: matched,
            });
            
            // Remove fully filled order
            if (ask.filled == ask.quantity) {
                vector::remove(&mut book.asks, i);
            } else {
                i = i + 1;
            };
        } else {
            break // asks are sorted, no more matches possible
        };
    };
    
    // If there's remaining quantity, add as resting order
    if (remaining > 0) {
        let new_order = LimitOrder {
            id: order_id,
            maker,
            is_bid: true,
            price,
            quantity: remaining,
            filled: 0,
            locked_amount: remaining_locked,
        };
        
        // Insert in sorted order (highest price first)
        let len = vector::length(&book.bids);
        let mut insert_pos = len;
        let mut j = 0;
        while (j < len) {
            let bid = vector::borrow(&book.bids, j);
            if (price > bid.price) {
                insert_pos = j;
                break
            };
            j = j + 1;
        };
        
        if (insert_pos == len) {
            vector::push_back(&mut book.bids, new_order);
        } else {
            vector::insert(&mut book.bids, new_order, insert_pos);
        };
        
        event::emit(OrderPlaced {
            book_id: object::uid_to_address(&book.id),
            order_id,
            maker,
            is_bid: true,
            price,
            quantity: remaining,
        });
    };
}

/// Place a limit sell order (ask)
/// price: normalized price (quote_amount * PRICE_SCALE / base_amount)
/// quantity: amount of base token to sell
/// base_coin: base token to sell
public entry fun place_ask<Base, Quote>(
    book: &mut OrderBook<Base, Quote>,
    price: u64,
    quantity: u64,
    mut base_coin: Coin<Base>,
    ctx: &mut tx_context::TxContext
) {
    assert!(price > 0, E_INVALID_PRICE);
    assert!(quantity > 0, E_INVALID_QUANTITY);
    
    let coin_value = coin::value(&base_coin);
    assert!(coin_value >= quantity, E_INSUFFICIENT_LIQUIDITY);
    
    let maker = tx_context::sender(ctx);
    
    // Split exact amount needed, return excess
    let locked_base = if (coin_value > quantity) {
        let excess = coin::split(&mut base_coin, coin_value - quantity, ctx);
        transfer::public_transfer(excess, maker);
        base_coin
    } else {
        base_coin
    };
    
    // Add base coin to book balance
    let base_balance = coin::into_balance(locked_base);
    balance::join(&mut book.base_balance, base_balance);
    
    let order_id = book.next_order_id;
    book.next_order_id = order_id + 1;
    
    let mut remaining = quantity;
    
    // Try to match with existing bids
    let mut i = 0;
    while (i < vector::length(&book.bids) && remaining > 0) {
        let bid = vector::borrow_mut(&mut book.bids, i);
        
        if (bid.price >= price) {
            let available = bid.quantity - bid.filled;
            let matched = if (available <= remaining) { available } else { remaining };
            
            // Calculate amounts (use bid price for execution)
            let match_price = bid.price;
            let quote_amount = ((matched as u128) * (match_price as u128) / PRICE_SCALE) as u64;
            
            // Calculate and collect fee from taker (seller)
            let fee_amount = (matched * book.fee_bps) / 10000; // fee in base tokens
            
            // Update order
            bid.filled = bid.filled + matched;
            remaining = remaining - matched;
            
            // Transfer quote to taker (seller) - amount without fee
            let quote_to_taker = balance::split(&mut book.quote_balance, quote_amount);
            transfer::public_transfer(
                coin::from_balance(quote_to_taker, ctx),
                maker
            );
            
            // Transfer base to maker (buyer)
            let base_to_maker = balance::split(&mut book.base_balance, matched);
            transfer::public_transfer(
                coin::from_balance(base_to_maker, ctx),
                bid.maker
            );
            
            // Collect fee in base tokens
            let fee_collected = balance::split(&mut book.base_balance, fee_amount);
            balance::join(&mut book.fee_balance_base, fee_collected);
            
            event::emit(OrderMatched {
                book_id: object::uid_to_address(&book.id),
                order_id: bid.id,
                taker: maker,
                maker: bid.maker,
                price: match_price,
                quantity: matched,
            });
            
            // Remove fully filled order
            if (bid.filled == bid.quantity) {
                vector::remove(&mut book.bids, i);
            } else {
                i = i + 1;
            };
        } else {
            break // bids are sorted, no more matches possible
        };
    };
    
    // If there's remaining quantity, add as resting order
    if (remaining > 0) {
        let new_order = LimitOrder {
            id: order_id,
            maker,
            is_bid: false,
            price,
            quantity: remaining,
            filled: 0,
            locked_amount: remaining, // locked base amount
        };
        
        // Insert in sorted order (lowest price first)
        let len = vector::length(&book.asks);
        let mut insert_pos = len;
        let mut j = 0;
        while (j < len) {
            let ask = vector::borrow(&book.asks, j);
            if (price < ask.price) {
                insert_pos = j;
                break
            };
            j = j + 1;
        };
        
        if (insert_pos == len) {
            vector::push_back(&mut book.asks, new_order);
        } else {
            vector::insert(&mut book.asks, new_order, insert_pos);
        };
        
        event::emit(OrderPlaced {
            book_id: object::uid_to_address(&book.id),
            order_id,
            maker,
            is_bid: false,
            price,
            quantity: remaining,
        });
    };
}

/// Cancel an order and return locked funds to maker
public entry fun cancel_order<Base, Quote>(
    book: &mut OrderBook<Base, Quote>,
    order_id: u64,
    ctx: &mut tx_context::TxContext
) {
    let caller = tx_context::sender(ctx);
    
    // Search in bids
    let mut i = 0;
    let bids_len = vector::length(&book.bids);
    while (i < bids_len) {
        let bid = vector::borrow(&book.bids, i);
        if (bid.id == order_id) {
            assert!(bid.maker == caller, E_UNAUTHORIZED);
            
            // Calculate unmatched amount to refund
            let unmatched_quantity = bid.quantity - bid.filled;
            let unmatched_quote = ((unmatched_quantity as u128) * (bid.price as u128) / PRICE_SCALE) as u64;
            
            // Remove order first
            vector::remove(&mut book.bids, i);
            
            // Return locked quote tokens to maker
            if (unmatched_quote > 0) {
                let refund = balance::split(&mut book.quote_balance, unmatched_quote);
                transfer::public_transfer(
                    coin::from_balance(refund, ctx),
                    caller
                );
            };
            
            event::emit(OrderCancelled {
                book_id: object::uid_to_address(&book.id),
                order_id,
            });
            return
        };
        i = i + 1;
    };
    
    // Search in asks
    let mut j = 0;
    let asks_len = vector::length(&book.asks);
    while (j < asks_len) {
        let ask = vector::borrow(&book.asks, j);
        if (ask.id == order_id) {
            assert!(ask.maker == caller, E_UNAUTHORIZED);
            
            // Calculate unmatched amount to refund
            let unmatched_quantity = ask.quantity - ask.filled;
            
            // Remove order first
            vector::remove(&mut book.asks, j);
            
            // Return locked base tokens to maker
            if (unmatched_quantity > 0) {
                let refund = balance::split(&mut book.base_balance, unmatched_quantity);
                transfer::public_transfer(
                    coin::from_balance(refund, ctx),
                    caller
                );
            };
            
            event::emit(OrderCancelled {
                book_id: object::uid_to_address(&book.id),
                order_id,
            });
            return
        };
        j = j + 1;
    };
    
    abort E_ORDER_NOT_FOUND
}

/// Get best bid price
public fun get_best_bid<Base, Quote>(book: &OrderBook<Base, Quote>): u64 {
    if (vector::length(&book.bids) > 0) {
        let best_bid = vector::borrow(&book.bids, 0);
        best_bid.price
    } else {
        0
    }
}

/// Get best ask price
public fun get_best_ask<Base, Quote>(book: &OrderBook<Base, Quote>): u64 {
    if (vector::length(&book.asks) > 0) {
        let best_ask = vector::borrow(&book.asks, 0);
        best_ask.price
    } else {
        0
    }
}

/// Get spread (difference between best ask and best bid)
public fun get_spread<Base, Quote>(book: &OrderBook<Base, Quote>): u64 {
    let best_bid = get_best_bid(book);
    let best_ask = get_best_ask(book);
    
    if (best_bid > 0 && best_ask > 0 && best_ask > best_bid) {
        best_ask - best_bid
    } else {
        0
    }
}

/// Get total number of open bids
public fun get_bid_count<Base, Quote>(book: &OrderBook<Base, Quote>): u64 {
    vector::length(&book.bids)
}

/// Get total number of open asks
public fun get_ask_count<Base, Quote>(book: &OrderBook<Base, Quote>): u64 {
    vector::length(&book.asks)
}

/// Get order book depth (total liquidity)
public fun get_book_depth<Base, Quote>(book: &OrderBook<Base, Quote>): (u64, u64) {
    let mut total_bid_quantity = 0u64;
    let mut total_ask_quantity = 0u64;
    
    let mut i = 0;
    while (i < vector::length(&book.bids)) {
        let bid = vector::borrow(&book.bids, i);
        total_bid_quantity = total_bid_quantity + (bid.quantity - bid.filled);
        i = i + 1;
    };
    
    let mut j = 0;
    while (j < vector::length(&book.asks)) {
        let ask = vector::borrow(&book.asks, j);
        total_ask_quantity = total_ask_quantity + (ask.quantity - ask.filled);
        j = j + 1;
    };
    
    (total_bid_quantity, total_ask_quantity)
}

/// Calculate quote amount for given base amount at price
public fun calculate_quote_amount(base_amount: u64, price: u64): u64 {
    ((base_amount as u128) * (price as u128) / PRICE_SCALE) as u64
}

/// Calculate base amount for given quote amount at price
public fun calculate_base_amount(quote_amount: u64, price: u64): u64 {
    ((quote_amount as u128) * PRICE_SCALE / (price as u128)) as u64
}

/// Get all bids in the order book
public fun get_all_bids<Base, Quote>(book: &OrderBook<Base, Quote>): vector<LimitOrder> {
    book.bids
}

/// Get all asks in the order book
public fun get_all_asks<Base, Quote>(book: &OrderBook<Base, Quote>): vector<LimitOrder> {
    book.asks
}

/// Get a specific bid by index
public fun get_bid_at<Base, Quote>(book: &OrderBook<Base, Quote>, index: u64): &LimitOrder {
    vector::borrow(&book.bids, index)
}

/// Get a specific ask by index
public fun get_ask_at<Base, Quote>(book: &OrderBook<Base, Quote>, index: u64): &LimitOrder {
    vector::borrow(&book.asks, index)
}