/// Module: token
module kanari_network::USDC;

use iota::coin::{Self, TreasuryCap, Coin};
use iota::url;

public struct USDC has drop {}

fun init(witness: USDC, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"USDC",
        b"USDC Token",
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
    treasury_cap: &mut TreasuryCap<USDC>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    let coin = coin::mint(treasury_cap, amount, ctx);
    transfer::public_transfer(coin, recipient);
}

// Function to burn USDC tokens
public entry fun burn(cap: &mut TreasuryCap<USDC>, coin: Coin<USDC>) {
    coin::burn(cap, coin);
}

public entry fun transfer(
    token: &mut Coin<USDC>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    let coin_to_transfer = coin::split(token, amount, ctx);
    transfer::public_transfer(coin_to_transfer, recipient);
}

public entry fun balance(coin: &coin::Coin<USDC>): u64 {
    let balance = coin::balance(coin);
    balance.value()
}
