Tick-buckets design (draft)

Goal
- Replace linear-vector order storage with a tick-bucket structure to improve insertion and matching complexity for large books.

Concept
- Maintain a map/dictionary keyed by price tick (u64) -> PriceLevel
- Each PriceLevel stores an aggregated quantity and a linked-list (or vector) of orders at that price (time-priority preserved)
- Maintain two ordered collections of ticks for bids (descending) and asks (ascending) to find best prices quickly

API sketch
- PriceLevel struct: price: u64, total_quantity: u64, orders: vector<LimitOrder>
- Book will hold: bids_map: Map<u64, PriceLevel>, asks_map: Map<u64, PriceLevel>, bid_ticks: vector<u64>, ask_ticks: vector<u64>
- On insert: find tick (price), push to orders at that price (O(1)), update total_quantity; if new tick, insert tick into ticks vector at proper sorted position (or maintain sorted double-linked list)
- On match: iterate ticks from best to worst, take from PriceLevel.orders preserving FIFO

Migration / Implementation notes
- Move currently lacks a native map type in many standard libs; implement tick-map as two parallel vectors (ticks and price_levels) or a custom linked-list of ticks with per-tick vectors.
- Start with an intermediate implementation: keep tick arrays but de-duplicate contiguous identical prices into buckets; this allows O(n_ticks) insertion rather than O(n_orders)

Testing and benchmarking
- Add tests to compare gas/operation counts for vector-based vs tick-bucket for synthetic workloads
- Add integration tests for order lifecycle (partial fills across multiple ticks)

This is a draft. If you want I'll provide a concrete Move implementation (PR) that:
1) Introduces PriceLevel struct and book fields
2) Migrates insert/match logic
3) Adds tests and benchmarks
