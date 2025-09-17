declare module "@xterm/addon-fit" {
  export class FitAddon {
    activate(terminal: any): void;
    fit(): void;
    dispose(): void;
  }
}
