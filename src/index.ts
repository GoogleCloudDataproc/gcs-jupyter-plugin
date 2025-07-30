/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
import { Dialog, IThemeManager, showDialog } from '@jupyterlab/apputils';
import { iconStorage, iconStorageDark } from './utils/icon';
import {
  GCS_PLUGIN_TITLE,
  HEALTH_ENDPOINT,
  NAMESPACE,
  PLUGIN_ID
} from './utils/const';
import { requestAPI } from './handler';
import {
  JUPYTER_SERVER_ERROR_MESSAGE,
  JUPYTER_SERVER_ERROR_TITLE
} from './utils/message';

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
  activate: async (
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
      panelGcs.title.icon = isLightTheme ? iconStorage : iconStorageDark;
    };

    const gcsDrive = new GCSDrive(app);

    const gcsBrowser = factory.createFileBrowser(NAMESPACE, {
      driveName: gcsDrive.name,
      refreshInterval: 300000 // 5 mins
    });

    const gcsBrowserWidget = new GcsBrowserWidget(
      gcsDrive,
      gcsBrowser,
      themeManager
    );
    gcsDrive.setBrowserWidget(gcsBrowserWidget);
    documentManager.services.contents.addDrive(gcsDrive);

    const panelGcs = new Panel();
    panelGcs.id = 'GCS-bucket-tab';
    panelGcs.title.caption = GCS_PLUGIN_TITLE;
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
      .then(async () => {
        try {
          const url = HEALTH_ENDPOINT;
          await requestAPI(url);
        } catch (error) {
          console.error('GCS backend health check failed:', error);
          await showDialog({
            title: JUPYTER_SERVER_ERROR_TITLE,
            body: JUPYTER_SERVER_ERROR_MESSAGE,
            buttons: [Dialog.okButton()]
          });
        }

        themeManager.themeChanged.connect(onThemeChanged);

        const shellAny = app.shell as any;

        if (shellAny?._leftHandler?._sideBar?.currentChanged) {
          shellAny._leftHandler._sideBar.currentChanged.connect(
            (sender: any, args: any) => {
              if (args.currentTitle._caption === GCS_PLUGIN_TITLE) {
                gcsDrive.selected_panel = args.currentTitle._caption;
                gcsBrowserWidget.browser.showFileFilter = true;
                gcsBrowserWidget.browser.showFileFilter = false;
              } else {
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
