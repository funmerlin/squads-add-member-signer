# Squads Add Member Signer

Local browser tool for preparing a Squads mainnet config transaction that adds:

- multisig: `JASQbqB7uJ3zEyVyCjrYe5CDEMHtVZrWLhSMZFzmoQcU`
- new member: `6oa6SurNZeFx88vXtGRYggmQzyu6MNZ1qW927tXzSipk`
- permissions: initiate / proposer only

The app uses wallet signing only. It never asks for private keys, never exports key material, and keeps sign-only separate from sign-and-send.

## Run Locally

```bash
npm install
npm run dev
```

Open the Vite URL in a browser with a Solana wallet extension installed. By default the app uses `https://roxy-tv7lra-fast-mainnet.helius-rpc.com`.

To use another mainnet RPC endpoint:

```bash
VITE_SOLANA_RPC_URL="https://your-rpc.example.com" npm run dev
```

## Flow

1. Connect the wallet that should create the Squads config transaction.
2. Prepare the transaction.
3. Review multisig, member, permissions, fee payer, and transaction index.
4. Use `Sign transaction` to get a signed base64 transaction without broadcasting.
5. Use `Sign and send` only when you intentionally want the wallet to broadcast.

The app uses the published `@aephia/solana-wallet-adapter` package from npm.
