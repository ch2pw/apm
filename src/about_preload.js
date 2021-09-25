const { ipcRenderer } = require('electron');
const log = require('electron-log');
const replaceText = require('./lib/replaceText');

log.catchErrors({
  onError: () => {
    ipcRenderer.invoke(
      'open-err-dialog',
      'エラー',
      `予期しないエラーが発生しました。\nログファイル: ${
        log.transports.file.getFile().path
      }`
    );
  },
});

window.addEventListener('click', () => {
  window.close();
});

window.addEventListener('DOMContentLoaded', async () => {
  const appVersion = await ipcRenderer.invoke('get-app-version');
  replaceText('app-version', appVersion);
  for (const dependency of ['chrome', 'node', 'electron']) {
    replaceText(`${dependency}-version`, process.versions[dependency]);
  }
});
