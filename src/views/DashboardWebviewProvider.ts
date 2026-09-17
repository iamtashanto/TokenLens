import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import type { ExtensionMessage, WebviewMessage, DashboardState } from '../types/index.js';

/**
 * WebviewViewProvider for the TokenLens dashboard sidebar.
 * Pattern combines usagedock's React webview approach with ai-code-usage's message protocol.
 */
export class DashboardWebviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private latestState?: DashboardState;
  private readonly messageHandlers: Array<(msg: WebviewMessage) => void | Promise<void>> = [];
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  /** Register a handler to be called when a message arrives from the webview */
  onMessage(handler: (msg: WebviewMessage) => void | Promise<void>): void {
    this.messageHandlers.push(handler);
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
    };

    webviewView.webview.html = this.buildHtml(webviewView.webview);

    // Handle messages from webview
    this.disposables.push(
      webviewView.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
        for (const handler of this.messageHandlers) {
          await handler(msg);
        }
      }),
    );

    // When view becomes visible again, resend latest state
    this.disposables.push(
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible && this.latestState) {
          this.postState(this.latestState);
        }
      }),
    );
  }

  /** Post the full dashboard state to the webview */
  postState(state: DashboardState): void {
    this.latestState = state;
    this.post({ type: 'state', data: state });
  }

  /** Post a loading indicator */
  postLoading(loading: boolean): void {
    this.post({ type: 'loading', loading });
  }

  /** Post a per-provider refreshing indicator */
  postRefreshing(id: string, refreshing: boolean): void {
    this.post({ type: 'refreshing', id, refreshing });
  }

  /** Post an error message */
  postError(message: string): void {
    this.post({ type: 'error', message });
  }

  private post(msg: ExtensionMessage): void {
    this.view?.webview.postMessage(msg);
  }

  private buildHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(24).toString('base64url');

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'main.js'),
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'main.css'),
    );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    img-src ${webview.cspSource} https: data: blob:;
    script-src 'nonce-${nonce}';
    style-src ${webview.cspSource} 'unsafe-inline';
    font-src ${webview.cspSource};
    connect-src 'none';
  " />
  <title>TokenLens Dashboard</title>
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
