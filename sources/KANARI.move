/// Module: token
module kanari_network::KANARI;

use iota::coin::{Self, TreasuryCap, Coin};
use iota::url;

public struct KANARI has drop {}

fun init(witness: KANARI, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        9,
        b"KANARI",
        b"KANARI Token",
        b"",
        option::some(
            url::new_unsafe_from_bytes(
                b"https://magenta-able-pheasant-388.mypinata.cloud/ipfs/QmNVQ3LQSbLC8bJDnXrbuftf2dC7LWJp4oXVkXxVRrDRfk",
            ),
        ),
        ctx,
    );
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

// Function to burn KANARI tokens
public entry fun burn(cap: &mut TreasuryCap<KANARI>, coin: Coin<KANARI>) {
    coin::burn(cap, coin);
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

public entry fun balance(coin: &coin::Coin<KANARI>): u64 {
    let balance = coin::balance(coin);
    balance.value()
}