import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { GCSDrive } from './gcs/gcsDrive';
import { Panel } from '@lumino/widgets';
import { CloudStorageLoggingService, LOG_LEVEL } from './utils/loggingService';
import { GcsBrowserWidget } from './gcs/gcsBrowserWidget';
import { IDocumentManager } from '@jupyterlab/docmanager';
import {
  IDefaultFileBrowser,
  IFileBrowserFactory
} from '@jupyterlab/filebrowser';
import { IThemeManager } from '@jupyterlab/apputils';
import { iconStorage, iconStorageDark } from './utils/icon';
import { NAMESPACE, PLUGIN_ID } from './utils/const';

/**
 * Initialization data for the gcs-jupyter-plugin extension.
 */

const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: 'A JupyterLab extension.',
  autoStart: true,
  requires: [
    IFileBrowserFactory,
    IThemeManager,
    IDocumentManager,
    IDefaultFileBrowser
  ],
  activate: (
    app: JupyterFrontEnd,
    factory: IFileBrowserFactory,
    themeManager: IThemeManager,
    documentManager: IDocumentManager,
    defaultBrowser: IDefaultFileBrowser
  ) => {
    console.log('JupyterLab extension gcs-jupyter-plugin is activated!');

    const onThemeChanged = () => {
      const isLightTheme = themeManager.theme
        ? themeManager.isLight(themeManager.theme)
        : true;
      if (isLightTheme) {
        if (panelGcs) {
          panelGcs.title.icon = iconStorage;
        }
      } else {
        if (panelGcs) {
          panelGcs.title.icon = iconStorageDark;
        }
      }
    };

    const gcsDrive = new GCSDrive(app);

    const gcsBrowser = factory.createFileBrowser(NAMESPACE, {
      driveName: gcsDrive.name,
      refreshInterval: 300000 // 5 mins
    });

    const gcsBrowserWidget = new GcsBrowserWidget(gcsDrive, gcsBrowser, themeManager);
    gcsDrive.setBrowserWidget(gcsBrowserWidget);
    documentManager.services.contents.addDrive(gcsDrive);

    const panelGcs = new Panel();
    panelGcs.id = 'GCS-bucket-tab';
    panelGcs.title.caption = 'Google Cloud Storage';
    panelGcs.title.className = 'panel-icons-custom-style';
    panelGcs.addWidget(gcsBrowserWidget);

    defaultBrowser.model.restored.then(() => {
      defaultBrowser.showFileFilter = true;
      defaultBrowser.showFileFilter = false;
    });

    onThemeChanged();
    app.shell.add(panelGcs, 'left', { rank: 1002 });
    CloudStorageLoggingService.log('Cloud storage is enabled', LOG_LEVEL.INFO);

    // Filter enabling and disabling when left sidebar changes to streamline notebook creation from launcher.
    app.restored
      .then(() => {
        themeManager.themeChanged.connect(onThemeChanged);

        const shellAny = app.shell as any;

        if (shellAny?._leftHandler?._sideBar?.currentChanged) {
          shellAny._leftHandler._sideBar.currentChanged.connect(
            (sender: any, args: any) => {
              if (args.currentTitle._caption === 'Google Cloud Storage') {
                gcsDrive.selected_panel = args.currentTitle._caption;
                gcsBrowserWidget.browser.showFileFilter = true;
                gcsBrowserWidget.browser.showFileFilter = false;
              }else {
                gcsDrive.selected_panel = args.currentTitle._caption;
                defaultBrowser.showFileFilter = true;
                defaultBrowser.showFileFilter = false;
              }
            }
          );
        }
      })
      .catch(error => {
        console.error('Error during app restoration:', error);
      });
  }
};

export default plugin;
