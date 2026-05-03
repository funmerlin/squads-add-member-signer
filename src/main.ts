import { Buffer } from 'buffer/';

globalThis.Buffer = Buffer as unknown as typeof globalThis.Buffer;

void import('./app');
