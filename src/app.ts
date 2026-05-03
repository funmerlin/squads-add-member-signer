import { WalletConnector } from '@aephia/solana-wallet-adapter';
import type { Adapter } from '@solana/wallet-adapter-base';
import { defineAepWalletConnectButton, defineAepWalletSelector } from '@aephia/solana-wallet-adapter/ui';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import './styles.css';

const MULTISIG_ADDRESS = 'JASQbqB7uJ3zEyVyCjrYe5CDEMHtVZrWLhSMZFzmoQcU';
const NEW_MEMBER_ADDRESS = '6oa6SurNZeFx88vXtGRYggmQzyu6MNZ1qW927tXzSipk';
const CLUSTER_CHAIN = 'solana:mainnet' as const;
const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

const { Permission, Permissions } = multisig.types;

type PreparedTransaction = {
  transaction: Transaction;
  transactionIndex: bigint;
  serializedUnsigned: string;
};

type StatusTone = 'muted' | 'ok' | 'warn' | 'error';

const availableWallets = new Map<string, Adapter>();
const connection = new Connection(RPC_URL, 'confirmed');
const multisigPda = new PublicKey(MULTISIG_ADDRESS);
const newMember = new PublicKey(NEW_MEMBER_ADDRESS);

let connectedAddress: string | null = null;
let connectedWalletName: string | null = null;
let prepared: PreparedTransaction | null = null;
let signedTransactionBase64: string | null = null;
let sentSignature: string | null = null;
let status: { tone: StatusTone; message: string } = {
  tone: 'muted',
  message: 'Connect the wallet that should create the Squads config transaction.',
};

defineAepWalletSelector();
defineAepWalletConnectButton();

document.addEventListener('aep:wc:wallet-available', (event) => {
  const wallet = event.detail;
  availableWallets.set(wallet.name, wallet);
  void syncWalletSelectorOptions();
});

const connector = new WalletConnector();

document.addEventListener('aep:wc:connection', (event) => {
  const wallet = event.detail;
  connectedWalletName = wallet?.name ?? null;
  connectedAddress = wallet?.publicKey?.toString() ?? null;
  prepared = null;
  signedTransactionBase64 = null;
  sentSignature = null;
  status = connectedAddress
    ? { tone: 'ok', message: 'Wallet connected. Prepare the transaction when ready.' }
    : { tone: 'muted', message: 'Wallet disconnected.' };
  render();
});

document.addEventListener('aep:wc:transaction-state', (event) => {
  const phase = event.detail.phase;
  if (phase === 'awaiting-approval') {
    status = { tone: 'warn', message: 'Waiting for wallet approval.' };
  }
  if (phase === 'cancelled') {
    status = { tone: 'warn', message: 'Wallet request was cancelled.' };
  }
  if (phase === 'error') {
    status = { tone: 'error', message: event.detail.message };
  }
  render();
});

function canSign(): boolean {
  return connector.canSignTransaction();
}

function canSignAndSend(): boolean {
  return connector.canSignAndSendTransaction();
}

async function prepareTransaction(): Promise<void> {
  try {
    const creator = getConnectedPublicKey();
    status = { tone: 'warn', message: 'Fetching multisig state and recent blockhash.' };
    render();

    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
    const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1);

    const addMemberInstruction = await multisig.instructions.configTransactionCreate({
      multisigPda,
      transactionIndex,
      creator,
      actions: [
        {
          __kind: 'AddMember',
          newMember: {
            key: newMember,
            permissions: Permissions.fromPermissions([Permission.Initiate]),
          },
        },
      ],
    });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({
      feePayer: creator,
      blockhash,
      lastValidBlockHeight,
    }).add(addMemberInstruction);

    prepared = {
      transaction,
      transactionIndex,
      serializedUnsigned: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
    };
    signedTransactionBase64 = null;
    sentSignature = null;
    status = { tone: 'ok', message: 'Transaction prepared. Review the details before signing.' };
  } catch (error) {
    status = { tone: 'error', message: getErrorMessage(error) };
  }
  render();
}

async function signOnly(): Promise<void> {
  if (!prepared) {
    return;
  }
  try {
    signedTransactionBase64 = null;
    sentSignature = null;
    const result = await connector.signTransaction({
      transaction: prepared.transaction,
      chain: CLUSTER_CHAIN,
    });
    signedTransactionBase64 = result.signedTransaction.serialize({ requireAllSignatures: false }).toString('base64');
    status = { tone: 'ok', message: 'Transaction signed locally. Nothing was broadcast.' };
  } catch (error) {
    status = { tone: 'error', message: getErrorMessage(error) };
  }
  render();
}

async function signAndSend(): Promise<void> {
  if (!prepared) {
    return;
  }
  try {
    signedTransactionBase64 = null;
    sentSignature = null;
    const result = await connector.signAndSendTransaction({
      transaction: prepared.transaction,
      chain: CLUSTER_CHAIN,
      sendOptions: { skipPreflight: false, preflightCommitment: 'confirmed' },
    });
    sentSignature = result.signature;
    status = { tone: 'ok', message: 'Wallet signed and broadcast the transaction.' };
  } catch (error) {
    status = { tone: 'error', message: getErrorMessage(error) };
  }
  render();
}

function getConnectedPublicKey(): PublicKey {
  const wallet = connector.getWallet();
  const publicKey = wallet?.publicKey;
  if (!wallet?.connected || !publicKey) {
    throw new Error('Connect a wallet before preparing the transaction.');
  }
  return publicKey;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error.';
}

function shortAddress(address: string | null): string {
  return address ? `${address.slice(0, 4)}...${address.slice(-4)}` : 'Not connected';
}

function explorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}`;
}

function render(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) {
    return;
  }

  app.innerHTML = `
    <section class="shell">
      <header class="topbar">
        <div>
          <h1>Squads Add Member Signer</h1>
          <p class="subtitle">Mainnet config transaction for adding one initiate-only member.</p>
        </div>
        <aep-wallet-connect-button label="Connect Wallet"></aep-wallet-connect-button>
      </header>

      <section class="status ${status.tone}" role="status">${status.message}</section>

      <section class="grid">
        <article class="panel">
          <h2>Wallet</h2>
          <dl>
            <div><dt>Wallet</dt><dd>${connectedWalletName ?? 'Not connected'}</dd></div>
            <div><dt>Account</dt><dd class="mono">${connectedAddress ?? 'Not connected'}</dd></div>
            <div><dt>Sign-only support</dt><dd>${canSign() ? 'Available' : 'Unavailable'}</dd></div>
            <div><dt>Sign-and-send support</dt><dd>${canSignAndSend() ? 'Available' : 'Unavailable'}</dd></div>
          </dl>
        </article>

        <article class="panel">
          <h2>Transaction Intent</h2>
          <dl>
            <div><dt>Cluster</dt><dd>Mainnet</dd></div>
            <div><dt>Multisig</dt><dd class="mono">${MULTISIG_ADDRESS}</dd></div>
            <div><dt>New member</dt><dd class="mono">${NEW_MEMBER_ADDRESS}</dd></div>
            <div><dt>Permissions</dt><dd>Initiate / proposer only</dd></div>
            <div><dt>Fee payer and creator</dt><dd class="mono">${connectedAddress ?? 'Connected wallet'}</dd></div>
            <div><dt>Squads transaction index</dt><dd>${prepared ? prepared.transactionIndex.toString() : 'Prepared after fetch'}</dd></div>
          </dl>
        </article>
      </section>

      <section class="review">
        <aep-wallet-selector id="wallet-selector"></aep-wallet-selector>
        <div>
          <h2>Review and Sign</h2>
          <p>
            Sign transaction returns a signed transaction only. Sign and send asks the wallet to broadcast it.
          </p>
        </div>
        <div class="actions">
          <button id="prepare" ${connectedAddress ? '' : 'disabled'}>Prepare</button>
          <button id="sign" ${prepared && canSign() ? '' : 'disabled'}>Sign transaction</button>
          <button id="send" ${prepared && canSignAndSend() ? '' : 'disabled'}>Sign and send</button>
        </div>
      </section>

      ${prepared ? renderPrepared() : ''}
      ${signedTransactionBase64 ? renderSigned() : ''}
      ${sentSignature ? renderSent() : ''}
    </section>
  `;

  app.querySelector<HTMLButtonElement>('#prepare')?.addEventListener('click', () => void prepareTransaction());
  app.querySelector<HTMLButtonElement>('#sign')?.addEventListener('click', () => void signOnly());
  app.querySelector<HTMLButtonElement>('#send')?.addEventListener('click', () => void signAndSend());
  wireWalletUi();
}

async function syncWalletSelectorOptions(): Promise<void> {
  const walletSelectorEl = document.getElementById('wallet-selector') as {
    addWalletOption(wallet: Adapter): Promise<void>;
  } | null;
  if (!walletSelectorEl) {
    return;
  }

  for (const wallet of availableWallets.values()) {
    await walletSelectorEl.addWalletOption(wallet);
  }
}

function wireWalletUi(): void {
  const walletConnectButton = document.querySelector('aep-wallet-connect-button');
  const walletSelectorEl = document.getElementById('wallet-selector') as {
    open(trigger: HTMLElement): void;
    close(): void;
    clearSigningState(): Promise<void>;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  } | null;

  if (!walletConnectButton || !walletSelectorEl) {
    return;
  }

  walletConnectButton.addEventListener('aep:wc:request-connect', async () => {
    await walletSelectorEl.clearSigningState();
    await syncWalletSelectorOptions();
    walletSelectorEl.open(walletConnectButton as HTMLElement);
  });

  walletConnectButton.addEventListener('aep:wc:request-disconnect', () => {
    void connector.disconnect();
  });

  walletSelectorEl.addEventListener('aep:wc:wallet-select', async (event) => {
    const walletName = (event as CustomEvent<string>).detail;
    try {
      await connector.connect(walletName);
      walletSelectorEl.close();
    } catch (error) {
      status = { tone: 'error', message: getErrorMessage(error) };
      render();
    }
  });

  void syncWalletSelectorOptions();
}

function renderPrepared(): string {
  if (!prepared) {
    return '';
  }
  return `
    <section class="output">
      <h2>Prepared Transaction</h2>
      <dl>
        <div><dt>Instruction count</dt><dd>${prepared.transaction.instructions.length}</dd></div>
        <div><dt>Fee payer</dt><dd class="mono">${prepared.transaction.feePayer?.toBase58() ?? shortAddress(connectedAddress)}</dd></div>
      </dl>
      <label for="unsigned">Unsigned transaction, base64</label>
      <textarea id="unsigned" readonly>${prepared.serializedUnsigned}</textarea>
    </section>
  `;
}

function renderSigned(): string {
  return `
    <section class="output success">
      <h2>Signed Transaction</h2>
      <p>This is sign-only output. It has not been sent by this action.</p>
      <label for="signed">Signed transaction, base64</label>
      <textarea id="signed" readonly>${signedTransactionBase64}</textarea>
    </section>
  `;
}

function renderSent(): string {
  return `
    <section class="output success">
      <h2>Broadcast Transaction</h2>
      <p class="mono">${sentSignature}</p>
      <a href="${explorerUrl(sentSignature ?? '')}" target="_blank" rel="noreferrer">Open in Solana Explorer</a>
    </section>
  `;
}

render();
