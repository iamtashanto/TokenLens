export const workspace = {
  getConfiguration: (_section?: string) => ({
    get: (_key: string, defaultValue: unknown) => defaultValue,
    update: async () => {},
  }),
  workspaceFolders: [],
};

export const window = {
  showInformationMessage: async () => {},
  showWarningMessage: async () => {},
  showErrorMessage: async () => {},
  createStatusBarItem: () => ({
    show: () => {},
    hide: () => {},
    dispose: () => {},
    text: '',
    tooltip: '',
    name: '',
    command: '',
  }),
};

export const commands = {
  executeCommand: async () => {},
  registerCommand: () => ({ dispose: () => {} }),
};

export const EventEmitter = class {
  event = () => ({ dispose: () => {} });
  fire() {}
  dispose() {}
};

export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

export class ThemeColor {
  constructor(public id: string) {}
}

export class MarkdownString {
  public value = '';
  public isTrusted = false;
  public supportThemeIcons = false;
  public supportHtml = false;

  constructor(value = '', isTrusted = false) {
    this.value = value;
    this.isTrusted = isTrusted;
  }

  appendMarkdown(value: string) {
    this.value += value;
    return this;
  }

  appendText(value: string) {
    this.value += value;
    return this;
  }
}
