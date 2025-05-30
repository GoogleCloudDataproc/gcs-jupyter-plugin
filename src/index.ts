import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { GCSDrive } from './gcs/gcsDrive';
import { Panel } from '@lumino/widgets';
import { CloudStorageLoggingService, LOG_LEVEL } from './utils/loggingService';
import { GcsBrowserWidget } from './gcs/gcsBrowserWidget';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IFileBrowserFactory } from '@jupyterlab/filebrowser';
import { IThemeManager } from '@jupyterlab/apputils';
import { iconStorage, iconStorageDark } from './utils/icon';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';

/**
 * Initialization data for the gcs-jupyter-plugin extension.
 */

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'gcs-jupyter-plugin:plugin',
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
    defaultFileBrowser: IDefaultFileBrowser
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

    let gcsDrive: GCSDrive | undefined;
    gcsDrive?.dispose();
    gcsDrive = undefined;
    gcsDrive = new GCSDrive(app);

    const gcsBrowserWidget = new GcsBrowserWidget(
      gcsDrive,
      factory as IFileBrowserFactory,
      defaultFileBrowser
    );
    gcsDrive.setBrowserWidget(gcsBrowserWidget);
    documentManager.services.contents.addDrive(gcsDrive);

    let panelGcs: Panel | undefined;
    panelGcs?.dispose();
    panelGcs = undefined;
    panelGcs = new Panel();
    panelGcs.id = 'GCS-bucket-tab';
    panelGcs.title.caption = 'Google Cloud Storage';
    panelGcs.title.className = 'panel-icons-custom-style';
    panelGcs.addWidget(gcsBrowserWidget);

    onThemeChanged();
    app.shell.add(panelGcs, 'left', { rank: 1002 });
    CloudStorageLoggingService.log('Cloud storage is enabled', LOG_LEVEL.INFO);
  }
};

export default plugin;
