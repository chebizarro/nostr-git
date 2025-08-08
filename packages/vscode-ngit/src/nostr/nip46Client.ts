import { BunkerSigner, parseBunkerInput } from "nostr-tools/nip46";
import { generateSecretKey, SimplePool } from "nostr-tools";

export class Nip46Client {
  private pool: SimplePool;
  private signer?: BunkerSigner;
  private secretKey: Uint8Array;
  private isConnected: boolean = false;

  constructor() {
    this.secretKey = generateSecretKey();
    this.pool = new SimplePool();
    // Workaround for enablePing property
    (this.pool as any).enablePing = true;
  }

  async connect(uri: string): Promise<void> {
    try {
      const pointer = await parseBunkerInput(uri);
      if (!pointer) throw new Error("Invalid NIP-46 URI");

      this.signer = new BunkerSigner(this.secretKey, pointer, {
        pool: this.pool,
      });

      await this.signer.connect();
      this.isConnected = true;
    } catch (err) {
      throw new Error(`Failed to connect to NIP-46 signer: ${(err as Error).message}`);
    }
  }

  async getPublicKey(): Promise<string> {
    if (!this.signer) throw new Error("Signer not connected");
    if (!this.isConnected) throw new Error("Signer not connected");
    
    try {
      return await this.signer.getPublicKey();
    } catch (err) {
      throw new Error(`Failed to retrieve public key: ${(err as Error).message}`);
    }
  }

  async signEvent(event: any): Promise<any> {
    if (!this.signer) throw new Error("Signer not connected");
    if (!this.isConnected) throw new Error("Signer not connected");
    
    try {
      return await this.signer.signEvent(event);
    } catch (err) {
      throw new Error(`Failed to sign event: ${(err as Error).message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.signer) {
      try {
        await this.signer.close();
      } catch (err) {
        console.warn(`Error closing signer: ${(err as Error).message}`);
      }
      this.signer = undefined;
    }
    this.isConnected = false;
  }

  isConnectedState(): boolean {
    return this.isConnected;
  }
}
