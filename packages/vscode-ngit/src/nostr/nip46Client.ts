import { BunkerSigner, parseBunkerInput } from "nostr-tools/nip46";
import { generateSecretKey, SimplePool } from "nostr-tools";

export class Nip46Client {
  private pool: SimplePool;
  private signer?: BunkerSigner;
  private secretKey: Uint8Array;

  constructor() {
    this.secretKey = generateSecretKey();
    this.pool = new SimplePool();
  }

  async connect(uri: string): Promise<void> {
    const pointer = await parseBunkerInput(uri);
    if (!pointer) throw new Error("Invalid NIP-46 URI");

    this.signer = new BunkerSigner(this.secretKey, pointer, {
      pool: this.pool,
    });

    await this.signer.connect();
  }

  async getPublicKey(): Promise<string> {
    if (!this.signer) throw new Error("Signer not connected");
    return await this.signer.getPublicKey();
  }

  async signEvent(event: any): Promise<any> {
    if (!this.signer) throw new Error("Signer not connected");
    return await this.signer.signEvent(event);
  }

  async disconnect(): Promise<void> {
    if (this.signer) {
      await this.signer.close();
    }
    //this.pool.close();
  }
}
