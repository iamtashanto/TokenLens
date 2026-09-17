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
