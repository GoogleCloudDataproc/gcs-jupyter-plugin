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
import { Widget, PanelLayout } from '@lumino/widgets';
import { Dialog, ToolbarButton, showDialog, Spinner } from '@jupyterlab/apputils';
import { FileBrowser } from '@jupyterlab/filebrowser';
import { GcsService } from './gcsService';
import { GCSDrive } from './gcsDrive';
import { TitleWidget } from '../controls/SidePanelTitleWidget';
import { ProgressBarWidget } from './ProgressBarWidget';
import { authApi, login } from '../utils/utils';
import { Message } from '@lumino/messaging';

import {
  iconGCSNewFolder,
  iconGCSRefresh,
  iconGCSUpload,
  iconSigninGoogle
} from '../utils/icon';

export class GcsBrowserWidget extends Widget {

  private readonly fileInput: HTMLInputElement;
  private readonly newFolder: ToolbarButton;
  private readonly gcsUpload: ToolbarButton;
  private readonly refreshButton: ToolbarButton;
  private readonly _progressBarWidget: ProgressBarWidget;



  private readonly _browser: FileBrowser;
  private _browserSpinner: Spinner | null = null;
  private readonly _contentPanel: HTMLElement | null = null;
  private _wasBrowserHidden: boolean = false;
  private _spinnerRefCount: number = 0;

  private readonly _titleWidget: TitleWidget;

  constructor(
    drive: GCSDrive,
    browser: FileBrowser
  ) {
    super();
    this._browser = browser;

    this._browser.showLastModifiedColumn = false;
    /*this._browser.showFileFilter = true;*/
    this._browser.showHiddenFiles = true;

    // Create an empty panel layout initially
    this.layout = new PanelLayout();
    this.node.style.height = '100%';
    this.node.style.display = 'flex';
    this.node.style.flexDirection = 'column';

    this._contentPanel = this._browser.node;
    this._browser.node.style.overflowY = 'auto'; // Ensure vertical scrolling is enabled if needed
    this._browser.node.style.flexShrink = '1';
    this._browser.node.style.flexGrow = '1';

    // Title widget for the GCS Browser
    this._titleWidget = new TitleWidget('Google Cloud Storage', false);
    (this.layout as PanelLayout).addWidget(this._titleWidget);

    this._progressBarWidget = new ProgressBarWidget();
    (this.layout as PanelLayout).addWidget(this._progressBarWidget);


    // Adding the progress bar container at the last
    //this.node.appendChild(this._progressBarContainer);

    // this div not found at the time of constructor call and Post constructor too (onAfterAttach).
    //const targetElement = this.node.querySelector('.gcs-explorer-refresh-container');

    // Listen for changes in the FileBrowser's path
    this._browser.model.pathChanged.connect(this.onPathChanged, this);

    const originalCd = this._browser.model.cd;
    this._browser.model.cd = async (path: string) => {
        this.showProgressBar();
        try {
            const result = await originalCd.call(this._browser.model, path);
            return result;
        } finally {
            this.hideProgressBar();
        }
    };

    this._browser.showFileCheckboxes = false;
    (this.layout as PanelLayout).addWidget(this._browser);
    this._browser.node.style.flexShrink = '1';
    this._browser.node.style.flexGrow = '1';

    this.newFolder = new ToolbarButton({
      icon: iconGCSNewFolder,
      className: 'icon-white',
      onClick: this.handleFolderCreation,
      tooltip: 'New Folder'
    });

    // Create a file input element
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.multiple = true; // Enable multiple file selection
    this.fileInput.style.display = 'none';

    // Attach event listener for file selection
    this.fileInput.addEventListener('change', this.handleFileUpload);

    // Append the file input element to the widget's node
    this.node.appendChild(this.fileInput);
    this.gcsUpload = new ToolbarButton({
      icon: iconGCSUpload,
      className: 'icon-white jp-UploadIcon',
      onClick: this.onUploadButtonClick,
      tooltip: 'File Upload'
    });

    this.refreshButton = new ToolbarButton({
      icon: iconGCSRefresh,
      className: 'icon-white',
      onClick: () => { void this.onRefreshButtonClick(); },
      tooltip: 'Refresh'
    });

    // Since the default location is root. disabling upload and new folder buttons
    this.newFolder.enabled = false;
    this.gcsUpload.enabled = false;

    this._browser.toolbar.addItem('New Folder', this.newFolder);
    this._browser.toolbar.addItem('File Upload', this.gcsUpload);
    this._browser.toolbar.addItem('Refresh', this.refreshButton);

    // Check configuration and initialize appropriately
    // this.initialize();

  }

   protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    // Call initialize asynchronously after widget is attached
    void this.initialize();
  }

  // Function to trigger file input dialog when the upload button is clicked
  private readonly onUploadButtonClick = () => {
    if (this._browser.model.path.split(':')[1] !== '') {
      this.fileInput.click();
    } else {
      showDialog({
        title: 'Upload Error',
        body: 'Uploading files at bucket level is not allowed',
        buttons: [Dialog.okButton()]
      });
    }
  };

  private readonly handleFolderCreation = () => {
    if (this._browser.model.path.split(':')[1] !== '') {
      this._browser.createNewDirectory();
    } else {
      showDialog({
        title: 'Create Folder Error',
        body: 'Folders cannot be created outside of a bucket.',
        buttons: [Dialog.okButton()]
      });
    }
  };

  // Function to handle file upload
  private readonly handleFileUpload = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);

    // Clear the input element's value to force the 'change' event on subsequent selections
    input.value = '';

    if (files && files.length > 0) {
      files.forEach((fileData: any) => {
        const file = fileData;
        const reader = new FileReader();

        this.showProgressBar(); // Show spinner for file upload
        reader.onloadend = async () => {
          // Upload the file content to Google Cloud Storage
          const gcsPath = this._browser.model.path.split(':')[1];
          const path = GcsService.pathParser(gcsPath);
          let filePath;

          if (path.path === '') {
            filePath = file.name;
          } else {
            filePath = path.path + '/' + file.name;
          }

          const content = await GcsService.listFiles({
            prefix: filePath,
            bucket: path.bucket
          });

          if (content.files && content.files.length > 0) {
            const result = await showDialog({
              title: 'Upload files',
              body: file.name + ' already exists. Do you want to overwrite?',
              buttons: [
                Dialog.cancelButton(),
                Dialog.okButton({ label: 'Overwrite' })
              ]
            });

            if (result.button.accept) {
              await GcsService.saveFile({
                bucket: path.bucket,
                path: filePath,
                contents: reader.result as string, // assuming contents is a string
                upload: false
              });
            }
          } else {
            await GcsService.saveFile({
              bucket: path.bucket,
              path: filePath,
              contents: reader.result as string, // assuming contents is a string
              upload: true
            });
          }

          // Optionally, update the FileBrowser model to reflect the newly uploaded file
          // Example: Refresh the current directory
          await this._browser.model.refresh();
        };
        this.hideProgressBar(); // Hide spinner after file upload is initiated

        // Read the file as text
        reader.readAsText(file);
      });
    }
  };

  private readonly onRefreshButtonClick = async () => {
    this.showProgressBar(); // Show spinner for explicit refresh
    try {
      await this._browser.model.refresh();
    } finally {
      this.hideProgressBar(); // Hide after refresh completes
    }
  };

  private async initialize(): Promise<void> {
    try {
      const credentials = await authApi();
      const errorMessageNode = document.createElement('div');
      errorMessageNode.className = 'gcs-error-message';
      errorMessageNode.style.textAlign = 'center';
      errorMessageNode.style.marginTop = '20px';
      errorMessageNode.style.alignItems = 'center';
      errorMessageNode.style.justifyContent = 'center';
      errorMessageNode.style.display = 'flex';
      errorMessageNode.style.flexDirection = 'column';
      errorMessageNode.style.fontSize = '15px';
      errorMessageNode.style.fontWeight = '600';
      errorMessageNode.style.padding = '11px';

      if (credentials) {
        if (credentials.config_error === 1) {
          // Config error
          errorMessageNode.textContent =
            'Please configure gcloud with account, project-id and region.';
          this.node.appendChild(errorMessageNode);
          return;
        }

        if (credentials.login_error === 1) {
          // Login error
          const loginContainer = document.createElement('div');
          loginContainer.style.display = 'flex';
          loginContainer.style.flexDirection = 'column';
          loginContainer.style.alignItems = 'center';
          loginContainer.style.marginTop = '20px';
          loginContainer.style.justifyContent = 'center';
          loginContainer.style.fontSize = '15px';
          loginContainer.style.fontWeight = '600';
          loginContainer.style.padding = '11px';

          const loginText = document.createElement('div');
          loginText.className = 'login-error';
          loginText.textContent = 'Please login to continue';

          const loginButton = document.createElement('div');
          loginButton.className = 'signin-google-icon logo-alignment-style';
          loginButton.setAttribute('role', 'button');
          loginButton.style.cursor = 'pointer';

          loginButton.onclick = () => {
            // Assuming `login` is globally available
            login((value: boolean | ((prevState: boolean) => boolean)) => {
              if (typeof value === 'boolean' && !value) {
                // Retry initialization after successful login
                this.initialize();
              }
            });
          };

          const googleIconContainer = document.createElement('div');
          googleIconContainer.style.marginTop = '20px';
          googleIconContainer.innerHTML = iconSigninGoogle.svgstr;
          loginButton.appendChild(googleIconContainer);
          loginContainer.appendChild(loginText);
          loginContainer.appendChild(loginButton);
          this.node.appendChild(loginContainer);
          return;
        }
      }
    } catch (error) {
      console.error('Error during initialization:', error);
    }
  }

  public showBrowserSpinner(): void {
    this._spinnerRefCount++;
    if (!this._browserSpinner) {
      this._browserSpinner = new Spinner();
      this._browserSpinner.node.classList.add('gcs-spinner-overlay');
      this._browser.node.appendChild(this._browserSpinner.node);
    }

    this._browserSpinner.node.style.backgroundColor = 'transparent';
    this._browserSpinner.show();

    if (this._contentPanel) {
      this._contentPanel.style.opacity = '0.5';
      this._contentPanel.style.pointerEvents = 'none';
    } else {
      console.warn('Content panel not found in showBrowserSpinner!');
    }

    this._wasBrowserHidden =
      this._browser.node.classList.contains('lm-mod-hidden');
    if (this._wasBrowserHidden) {
      this._browser.node.classList.remove('lm-mod-hidden');
    }
  }

  public async refreshContents() {
    await this._browser.model.refresh();
  }

  public async hideBrowserSpinner(): Promise<void> {
    this._spinnerRefCount--;
    if (this._spinnerRefCount <= 0) { // Only hide if no more active requests
      this._spinnerRefCount = 0;
      if (this._browserSpinner) {
        this._browserSpinner.hide();
        if (this._browserSpinner.node.parentElement) {
          this._browserSpinner.node.parentElement.removeChild(
            this._browserSpinner.node
          );
        } else {
          console.warn('Spinner parent element not found in hideBrowserSpinner!');
        }

        if (this._contentPanel) {
          this._contentPanel.style.opacity = '';
          this._contentPanel.style.pointerEvents = '';
        }
        if (this._wasBrowserHidden) {
          this._browser.node.classList.add('lm-mod-hidden');
        }
        this._wasBrowserHidden = false;
        this._browserSpinner = null;
      } else {
        console.warn('Spinner was not active.');
      }
    }
  }

  public showProgressBar(): void {
    if (this._progressBarWidget) {
      this._progressBarWidget.show();
    }
  }

  public hideProgressBar(): void {
    if (this._progressBarWidget) {
      this._progressBarWidget.hide();
    }
  }

  dispose() {
    this._browser.model.pathChanged.disconnect(this.onPathChanged, this);
    this._browser.dispose();
    this.fileInput.removeEventListener('change', this.handleFileUpload);
    this.hideProgressBar();
    super.dispose();
  }

  private readonly onPathChanged = () => {
    const currentPath = this._browser.model.path.split(':')[1];
    // Check if the current path is the root (empty string or just '/')
    const isRootPath = currentPath === '' || currentPath === '/';

    // Freeze upload button if path is root
    if (this.gcsUpload) {
      this.gcsUpload.enabled = !isRootPath;
    }

    // Freeze new folder button if path is root
    if (this.newFolder) {
      this.newFolder.enabled = !isRootPath;
    }
  };

  public get browser(): FileBrowser {
    return this._browser;
  }

}
