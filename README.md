Short guide — token/kanari
=========================

This repository contains the `token::kanari` Move module. The README below shows how to build, publish and call the module using the `iota` CLI (PowerShell examples).

Overview
--------

The `token::kanari` module provides basic functionality for the KANARI token:

- Creates the token and returns a `TreasuryCap` during `init`.
- `mint(treasury_cap, amount, recipient)` — mint new KANARI coins using the treasury cap.
- `transfer(token, amount, recipient)` — transfer KANARI coins.
- `balance(coin)` — read the balance of a KANARI coin.

Prerequisites

Short guide — token/kanari

=========================

This repository contains the `token::kanari` Move module. The README below shows how to build, publish and call the module using the `iota` CLI (PowerShell examples).

Overview

--------

The `token::kanari` module provides basic functionality for the KANARI token:

- Creates the token and returns a `TreasuryCap` during `init`.
- `mint(treasury_cap, amount, recipient)` — mint new KANARI coins using the treasury cap.
- `transfer(token, amount, recipient)` — transfer KANARI coins.
- `balance(coin)` — read the balance of a KANARI coin.

Prerequisites
-------------

- Installed `iota` CLI and access to a keystore/private key used for signing.
- The signing address must have an IOTA native coin to pay transaction gas (or you must supply a gas object id with `--gas`).

Build and publish
-----------------

Run these commands inside the project directory (PowerShell):

```powershell
iota move build --skip-fetch-latest-git-deps
iota client publish --skip-fetch-latest-git-deps
```

Call `mint`
-----------

Move signature:

```text
public fun mint(
  treasury_cap: &mut TreasuryCap<KANARI>,
  amount: u64,
  recipient: address,
  ctx: &mut TxContext,
)
```

You must pass three runtime args (TxContext is implicit):

1. TreasuryCap object id (e.g. `0x...`)
2. Amount (u64)
3. Recipient address (e.g. `0x...`)

Examples (replace placeholders):

```powershell
# Default (CLI will auto-select gas coin if available)
iota client call --package 0x9067b08bed29cd5d6a2a582731832f35f99e509393f237ca1ef542ddf631e801 --module kanari --function mint --args 0xTREASURY_OBJECT_ID 1000000000 0xRECIPIENT_ADDRESS

# Explicit gas object (if signer has no suitable native coin)
iota client call --package 0x9067b08bed29cd5d6a2a582731832f35f99e509393f237ca1ef542ddf631e801 --module kanari --function mint --args 0xTREASURY_OBJECT_ID 1000000000 0xRECIPIENT_ADDRESS --gas-budget 1000000

# Specify sender address (must have private key in keystore)
iota client call --package <pkg> --module kanari --function mint --args 0xTREASURY_OBJECT_ID 1000000000 0xRECIPIENT_ADDRESS --sender 0xSENDER_ADDRESS
```

Finding the `TreasuryCap<KANARI>` and gas coin
--------------------------------------------

The `TreasuryCap` resource is created by `coin::create_currency` inside `init` and is transferred to the account that executed `init` (the creator). To find it, list objects for the creator account and look for a Move object with a type like `TreasuryCap<token::KANARI>`.

Example:

```powershell
iota client objects --owner 0xCREATOR_ADDRESS --json
```

Pick the object id of the `TreasuryCap<token::KANARI>` as the first argument to `mint`.

For gas, pick a native coin object owned by the signer and supply its id with `--gas` if the CLI does not select one automatically.

Troubleshooting
---------------

- "Expected N args, found 0": You omitted required positional args. Provide treasury id, amount and recipient.
- Gas errors: Fund the signing address with a native coin or provide `--gas-budget 1000000`.
- Wrong object type: Ensure the first arg is a `TreasuryCap<KANARI>` object, not metadata or a coin object.

If you'd like, paste the output of `iota client objects --owner 0xYOUR_ADDRESS --json` and I will point out which object to use as treasury and which coin to use as gas.

3.Recipient address (e.g. `0x...`)

Examples (replace placeholders):

```powershell
# Default (CLI will auto-select gas coin if available)
iota client call --package 0x9067b08bed29cd5d6a2a582731832f35f99e509393f237ca1ef542ddf631e801 --module kanari --function mint --args 0xTREASURY_OBJECT_ID 1000000000 0xRECIPIENT_ADDRESS

# Explicit gas object (if signer has no suitable native coin)
iota client call --package 0x9067b08bed29cd5d6a2a582731832f35f99e509393f237ca1ef542ddf631e801 --module kanari --function mint --args 0xTREASURY_OBJECT_ID 1000000000 0xRECIPIENT_ADDRESS --gas-budget 1000000

# Specify sender address (must have private key in keystore)
iota client call --package <pkg> --module kanari --function mint --args 0xTREASURY_OBJECT_ID 1000000000 0xRECIPIENT_ADDRESS --sender 0xSENDER_ADDRESS
```

Finding the `TreasuryCap<KANARI>` and gas coin
--------------------------------------------

The `TreasuryCap` resource is created by `coin::create_currency` inside `init` and is transferred to the account that executed `init` (the creator). To find it, list objects for the creator account and look for a Move object with a type like `TreasuryCap<token::KANARI>`.

Example:

```powershell
iota client objects --owner 0xCREATOR_ADDRESS --json
```

Pick the object id of the `TreasuryCap<token::KANARI>` as the first argument to `mint`.

For gas, pick a native coin object owned by the signer and supply its id with `--gas` if the CLI does not select one automatically.

Troubleshooting
---------------

- "Expected N args, found 0": You omitted required positional args. Provide treasury id, amount and recipient.
- Gas errors: Fund the signing address with a native coin or provide `--gas-budget 1000000`.
- Wrong object type: Ensure the first arg is a `TreasuryCap<KANARI>` object, not metadata or a coin object.

If you'd like, paste the output of `iota client objects --owner 0xYOUR_ADDRESS --json` and I will point out which object to use as treasury and which coin to use as gas.
