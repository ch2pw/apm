const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  shell,
} = require('electron');
const { download } = require('electron-dl');
const log = require('electron-log');
const debug = require('electron-debug');
const windowStateKeeper = require('electron-window-state');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const prompt = require('electron-prompt');
const { getHash } = require('./lib/getHash');
const shortcut = require('./lib/shortcut');

log.catchErrors({
  showDialog: false,
  onError: () => {
    const options = {
      title: 'エラー',
      message: `予期しないエラーが発生したため、AviUtl Package Managerを終了します。\nログファイル: ${
        log.transports.file.getFile().path
      }`,
      type: 'error',
    };
    if (app.isReady()) {
      dialog.showMessageBoxSync(options);
    } else {
      dialog.showErrorBox(options.title, options.message);
    }

    app.quit();
  },
});

shortcut.uninstaller(app.getPath('appData'));
if (require('electron-squirrel-startup')) app.quit();

require('update-electron-app')();

const isDevEnv = process.env.NODE_ENV === 'development';
if (isDevEnv) app.setPath('userData', app.getPath('userData') + '_Dev');
debug({ showDevTools: false }); // Press F12 to open DevTools

const Store = require('electron-store');
Store.initRenderer();

log.debug(process.versions);

const icon =
  process.platform === 'linux'
    ? path.join(__dirname, '../icon/apm1024.png')
    : undefined;

ipcMain.handle('get-app-version', (event) => {
  return app.getVersion();
});

ipcMain.handle('app-get-path', (event, name) => {
  return app.getPath(name);
});

ipcMain.handle('app-quit', (event) => {
  app.quit();
});

ipcMain.handle('open-path', (event, relativePath) => {
  const folderPath = path.join(app.getPath('userData'), 'Data/', relativePath);
  const folderExists = fs.existsSync(folderPath);
  if (folderExists) execSync(`start "" "${folderPath}"`);
  return folderExists;
});

ipcMain.handle('exists-temp-file', (event, relativePath, keyText) => {
  let filePath = path.join(app.getPath('userData'), 'Data/', relativePath);
  if (keyText) {
    filePath = path.join(
      path.dirname(filePath),
      getHash(keyText) + '_' + path.basename(filePath)
    );
  }
  return { exists: fs.existsSync(filePath), path: filePath };
});

ipcMain.handle('open-dir-dialog', async (event, title, defaultPath) => {
  const win = BrowserWindow.getFocusedWindow();
  const dir = await dialog.showOpenDialog(win, {
    title: title,
    defaultPath: defaultPath,
    properties: ['openDirectory'],
  });
  return dir.filePaths;
});

ipcMain.handle('open-err-dialog', async (event, title, message) => {
  const win = BrowserWindow.getFocusedWindow();
  await dialog.showMessageBox(win, {
    title: title,
    message: message,
    type: 'error',
  });
});

ipcMain.handle('open-yes-no-dialog', async (event, title, message) => {
  const win = BrowserWindow.getFocusedWindow();
  const response = await dialog.showMessageBox(win, {
    title: title,
    message: message,
    type: 'warning',
    buttons: ['はい', `いいえ`],
    cancelId: 1,
  });
  if (response.response === 0) {
    return true;
  } else {
    return false;
  }
});

const allowedHosts = [];

app.on(
  'certificate-error',
  async (event, webContents, url, error, certificate, callback) => {
    if (error === 'net::ERR_SSL_OBSOLETE_VERSION') {
      event.preventDefault();
      const host = new URL(url).hostname;
      if (allowedHosts.includes(host)) {
        callback(true);
      } else {
        const win = BrowserWindow.getFocusedWindow();
        const response = await dialog.showMessageBox(win, {
          title: '安全ではない接続',
          message: `このサイトでは古いセキュリティ設定を使用しています。このサイトに情報を送信すると流出する恐れがあります。`,
          detail: error,
          type: 'warning',
          buttons: ['戻る', `${host}にアクセスする（安全ではありません）`],
          cancelId: 0,
        });
        if (response.response === 1) {
          allowedHosts.push(host);
          callback(true);
        } else {
          callback(false);
        }
      }
    }
  }
);

/**
 * Launch the app.
 */
function launch() {
  const splashWindow = new BrowserWindow({
    width: 640,
    height: 360,
    center: true,
    frame: false,
    show: false,
    icon: icon,
  });

  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));

  const mainWindowState = windowStateKeeper({
    defaultWidth: 800,
    defaultHeight: 600,
  });

  const mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 320,
    minHeight: 240,
    show: false,
    icon: icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.match(/^http/)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.url.match(/^http/)) {
      shell.openExternal(details.url);
    }
    return { action: 'deny' };
  });

  mainWindow.once('show', () => {
    mainWindowState.manage(mainWindow);
  });

  const template = [
    {
      label: 'apm',
      submenu: [
        {
          label: `${app.name}について`,
          click: () => {
            const aboutPath = path.join(__dirname, 'about.html');
            const aboutWindow = new BrowserWindow({
              width: 480,
              height: 360,
              frame: false,
              resizable: false,
              modal: true,
              parent: mainWindow,
              icon: icon,
              webPreferences: {
                preload: path.join(__dirname, 'about_preload.js'),
              },
            });
            aboutWindow.once('close', () => {
              if (!aboutWindow.isDestroyed()) {
                aboutWindow.destroy();
              }
            });
            aboutWindow.once('ready-to-show', () => {
              aboutWindow.show();
            });
            aboutWindow.loadFile(aboutPath);
          },
        },
        {
          label: `インストール用データの作成`,
          click: () => {
            const packageMakerPath = path.join(__dirname, 'package_maker.html');
            const packageMakerWindow = new BrowserWindow({
              width: 480,
              height: 360,
              modal: true,
              parent: mainWindow,
              icon: icon,
              webPreferences: {
                preload: path.join(__dirname, 'package_maker_preload.js'),
              },
            });
            packageMakerWindow.once('close', () => {
              if (!packageMakerWindow.isDestroyed()) {
                packageMakerWindow.destroy();
              }
            });
            packageMakerWindow.once('ready-to-show', () => {
              packageMakerWindow.show();
            });
            packageMakerWindow.loadFile(packageMakerPath);
          },
        },
        {
          label: 'フィードバックを送る（GitHub）（外部ブラウザが開きます）',
          click: () => {
            shell.openExternal('https://github.com/hal-shu-sato/apm/issues');
          },
        },
        {
          label:
            'フィードバックを送る（Googleフォーム）（外部ブラウザが開きます）',
          click: () => {
            shell.openExternal(
              'https://docs.google.com/forms/d/e/1FAIpQLSf0N-X_u_abi8rrWHVDdiK3YeYuQ7J1f8bQAy6QTD-OR94DWQ/viewform?usp=sf_link'
            );
          },
        },
        {
          label: '終了',
          click: () => {
            app.quit();
          },
        },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  ipcMain.handle('migration1to2-confirm-dialog', async (event) => {
    return (
      await dialog.showMessageBox(mainWindow, {
        title: '確認',
        message: `お使いのバージョンのapmは現在設定されているデータ取得先に対応しておりません。新しいデータ取得先への移行が必要です。`,
        type: 'warning',
        buttons: [
          'キャンセル',
          '新しいデータ取得先を入力する',
          'デフォルトのデータ取得先を使う',
        ],
        cancelId: 0,
      })
    ).response;
  });

  ipcMain.handle('migration1to2-dataurl-input-dialog', async (event) => {
    return await prompt(
      {
        title: '新しいデータ取得先の入力',
        label: '新しいデータ取得先のURL（例: https://example.com/data/）',
        width: 500,
        height: 300,
        type: 'input',
      },
      mainWindow
    );
  });

  ipcMain.handle('change-main-zoom-factor', (event, zoomFactor) => {
    mainWindow.webContents.setZoomFactor(zoomFactor);
  });

  ipcMain.handle(
    'download',
    async (event, url, loadCache = false, subDir = '', keyText) => {
      const tmpDirectory = path.join(app.getPath('userData'), 'Data/', subDir);
      const opt = {
        overwrite: true,
        directory: ['.zip', '.lzh', '.7z', '.rar'].includes(path.extname(url))
          ? path.join(tmpDirectory, 'archive')
          : tmpDirectory,
      };

      const tmpFilePath = keyText
        ? path.join(opt.directory, getHash(keyText) + '_' + path.basename(url))
        : path.join(opt.directory, path.basename(url));
      if (loadCache && fs.existsSync(tmpFilePath)) return tmpFilePath;

      let savePath;
      if (url.startsWith('http')) {
        savePath = (await download(mainWindow, url, opt)).getSavePath();
      } else {
        savePath = path.join(opt.directory, path.basename(url));
        fs.mkdir(path.dirname(savePath), { recursive: true });
        fs.copyFileSync(url, savePath);
      }

      if (keyText) {
        const renamedPath = path.join(
          path.dirname(savePath),
          getHash(keyText) + '_' + path.basename(savePath)
        );
        fs.renameSync(savePath, renamedPath);
        savePath = renamedPath;
      }
      return savePath;
    }
  );

  ipcMain.handle('open-browser', async (event, url, type) => {
    const browserWindow = new BrowserWindow({
      width: 800,
      height: 600,
      minWidth: 240,
      minHeight: 320,
      sandbox: true,
      parent: mainWindow,
      modal: true,
      icon: icon,
    });

    mainWindow.once('closed', (event) => {
      if (!browserWindow.isDestroyed()) {
        browserWindow.destroy();
      }
    });

    browserWindow.loadURL(url);

    return await new Promise((resolve) => {
      browserWindow.webContents.session.once(
        'will-download',
        (event, item, webContents) => {
          if (!browserWindow.isDestroyed()) browserWindow.hide();

          const ext = path.extname(item.getFilename());
          const dir = path.join(app.getPath('userData'), 'Data');
          if (['.zip', '.lzh', '.7z', '.rar'].includes(ext)) {
            item.setSavePath(
              path.join(dir, type, 'archive/', item.getFilename())
            );
          } else {
            item.setSavePath(path.join(dir, type, item.getFilename()));
          }

          item.once('done', (e, state) => {
            resolve(item.getSavePath());
            browserWindow.destroy();
          });
        }
      );

      browserWindow.once('closed', (event) => {
        resolve('close');
      });
    });
  });

  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      mainWindow.show();
      splashWindow.hide();
      splashWindow.destroy();
    }, 2000);
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  launch();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) launch();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
