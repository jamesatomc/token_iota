
/// Module: token
module token::kanari {
    use iota::coin::{Self, TreasuryCap, Coin};
    public struct KANARI has drop {}

    fun init(witness: KANARI, ctx: &mut TxContext) {
        let (treasury, metadata) = coin::create_currency(witness, 6, b"KANARI", b"MYT", b"", option::none(), ctx);
        transfer::public_freeze_object(metadata);
        transfer::public_transfer(treasury, ctx.sender());
    }

    public fun mint(
        treasury_cap: &mut TreasuryCap<KANARI>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }

    public entry fun transfer(
        token: &mut Coin<KANARI>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let coin_to_transfer = coin::split(token, amount, ctx);
        transfer::public_transfer(coin_to_transfer, recipient);
    }


    public entry fun balance(coin: &coin::Coin<KANARI>) : u64 {
        let balance = coin::balance(coin);
        balance.value()
    }
}



