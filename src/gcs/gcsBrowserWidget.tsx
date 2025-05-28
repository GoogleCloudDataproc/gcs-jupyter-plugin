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
import { Dialog, ToolbarButton, showDialog } from '@jupyterlab/apputils';
import { FileBrowser, IFileBrowserFactory } from '@jupyterlab/filebrowser';
import 'react-toastify/dist/ReactToastify.css';
import { LabIcon } from '@jupyterlab/ui-components';
import gcsNewFolderIcon from '../../style/icons/gcs_folder_new_icon.svg';
import gcsUploadIcon from '../../style/icons/gcs_upload_icon.svg';
import { GcsService } from './gcsService';
import { GCSDrive } from './gcsDrive';
import { TitleWidget } from '../controls/SidePanelTitleWidget';
import { authApi, login, toastifyCustomStyle } from '../utils/utils';
import { toast } from 'react-toastify';
import signinGoogleIcon from '../../style/icons/signin_google_icon.svg';
import { Spinner } from '@jupyterlab/apputils';

const iconGCSNewFolder = new LabIcon({
  name: 'gcs-toolbar:gcs-folder-new-icon',
  svgstr: gcsNewFolderIcon
});
const iconGCSUpload = new LabIcon({
  name: 'gcs-toolbar:gcs-upload-icon',
  svgstr: gcsUploadIcon
});

const IconsigninGoogle = new LabIcon({
  name: 'launcher:signin_google_icon',
  svgstr: signinGoogleIcon
});

const debounce = (func: any, delay: number) => {
  let timeoutId: any;
  return function (...args: any) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
};

export class GcsBrowserWidget extends Widget {
  private browser: FileBrowser;
  private fileInput: HTMLInputElement;
  private newFolder: ToolbarButton;
  private gcsUpload: ToolbarButton;
  private _browserSpinner: Spinner | null = null;
  private _gcsDrive: GCSDrive;
  private _contentPanel: HTMLElement | null = null; 
  private _wasBrowserHidden: boolean = false;

  // Function to trigger file input dialog when the upload button is clicked
  private onUploadButtonClick = () => {
    if (this.browser.model.path.split(':')[1] !== '') {
      this.fileInput.click();
    } else {
      showDialog({
        title: 'Upload Error',
        body: 'Uploading files at bucket level is not allowed',
        buttons: [Dialog.okButton()]
      });
    }
  };

  private handleFolderCreation = () => {
    if (this.browser.model.path.split(':')[1] !== '') {
      this.browser.createNewDirectory();
    } else {
      showDialog({
        title: 'Create Folder Error',
        body: 'Folders cannot be created outside of a bucket.',
        buttons: [Dialog.okButton()]
      });
    }
  };

  // Function to handle file upload
  private handleFileUpload = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);

    // Clear the input element's value to force the 'change' event on subsequent selections
    input.value = '';

    if (files && files.length > 0) {
      files.forEach((fileData: any) => {
        const file = fileData;
        const reader = new FileReader();

        reader.onloadend = async () => {
          // Upload the file content to Google Cloud Storage
          const gcsPath = this.browser.model.path.split(':')[1];
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
              toast.success(
                `${file.name} overwritten successfully.`,
                toastifyCustomStyle
              );
            }
          } else {
            await GcsService.saveFile({
              bucket: path.bucket,
              path: filePath,
              contents: reader.result as string, // assuming contents is a string
              upload: true
            });
            toast.success(
              `${file.name} uploaded successfully.`,
              toastifyCustomStyle
            );
          }

          // Optionally, update the FileBrowser model to reflect the newly uploaded file
          // Example: Refresh the current directory
          await this.browser.model.refresh();
        };

        // Read the file as text
        reader.readAsText(file);
      });
    }
  };

  private filterFilesByName = async (filterValue: string) => {
    this.browser.model.refresh();
  };

  constructor(
    drive: GCSDrive,
    private fileBrowserFactory: IFileBrowserFactory
  ) {
    super();
    this._gcsDrive = drive;
    this.browser = this.fileBrowserFactory.createFileBrowser(
      'dataproc-jupyter-plugin:gcsBrowser',
      {
        driveName: this._gcsDrive.name,
        refreshInterval: 30000
      }
    );

    this.browser.showLastModifiedColumn=false;
    this.browser.showHiddenFiles=true;

    // Create an empty panel layout initially
    this.layout = new PanelLayout();
    this.node.style.height = '100%';
    this.node.style.display = 'flex';
    this.node.style.flexDirection = 'column';

    this._contentPanel = this.browser.node;
    this.browser.node.style.overflowY = 'auto'; // Ensure vertical scrolling is enabled if needed
    this.browser.node.style.flexShrink = '1';
    this.browser.node.style.flexGrow = '1';

    // Add title widget initially
    (this.layout as PanelLayout).addWidget(
      new TitleWidget('Google Cloud Storage', false)
    );

    let filterInput = document.createElement('input');
    filterInput.id = 'filter-buckets-objects';
    filterInput.className = 'filter-search-gcs';
    filterInput.type = 'text';
    filterInput.placeholder = 'Filter by Name';
    filterInput.style.display = 'none';

    // Debounce the filterFilesByName function with a delay of 300 milliseconds
    const debouncedFilter = debounce(this.filterFilesByName, 300);

    filterInput.addEventListener('input', event => {
      const filterValue = (event.target as HTMLInputElement).value;
      //@ts-ignore
      document
        .getElementById('filter-buckets-objects')
        .setAttribute('value', filterValue);
      // Call a function to filter files based on filterValue
      debouncedFilter(filterValue);
    });

    // Listen for changes in the FileBrowser's path
    this.browser.model.pathChanged.connect(this.onPathChanged, this);

    this.browser.showFileCheckboxes = false;
    (this.layout as PanelLayout).addWidget(this.browser);
    this.browser.node.style.flexShrink = '1';
    this.browser.node.style.flexGrow = '1';

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

    // Since the default location is root. disabling upload and new folder buttons
    this.newFolder.enabled = false;
    this.gcsUpload.enabled = false;

    this.browser.toolbar.addItem('New Folder', this.newFolder);
    this.browser.toolbar.addItem('File Upload', this.gcsUpload);
    let filterItem = new Widget({ node: filterInput });
    this.browser.toolbar.addItem('Filter by Name:', filterItem);

    // Check configuration and initialize appropriately
    this.initialize();
  }

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
          googleIconContainer.innerHTML = IconsigninGoogle.svgstr;
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
    if (!this._browserSpinner) {
        this._browserSpinner = new Spinner();
        this._browserSpinner.node.classList.add('gcs-spinner-overlay');
        this.browser.node.appendChild(this._browserSpinner.node);
    }

    this._browserSpinner.node.style.backgroundColor = 'transparent';
    this._browserSpinner.show();

    if (this._contentPanel) {
        this._contentPanel.style.opacity = '0.5';
        this._contentPanel.style.pointerEvents = 'none';
    } else {
        console.warn('Content panel not found in showBrowserSpinner!');
    }

    this._wasBrowserHidden = this.browser.node.classList.contains('lm-mod-hidden');
    if (this._wasBrowserHidden) {
        this.browser.node.classList.remove('lm-mod-hidden');
    }
  }

  public hideBrowserSpinner(): void {
    if (this._browserSpinner) {
        this._browserSpinner.hide();
        if (this._browserSpinner.node.parentElement) {
            this._browserSpinner.node.parentElement.removeChild(this._browserSpinner.node);
        } else {
            console.warn('Spinner parent element not found in hideBrowserSpinner!');
        }

        if (this._contentPanel) {
            this._contentPanel.style.opacity = '';
            this._contentPanel.style.pointerEvents = '';
        }
        if (this._wasBrowserHidden) {
            this.browser.node.classList.add('lm-mod-hidden');
        }
        this._wasBrowserHidden = false;
        this._browserSpinner = null;
    } else {
        console.warn('Spinner was not active.');
    }
  }

  dispose() {
    this.browser.model.pathChanged.disconnect(this.onPathChanged, this);
    this.browser.dispose();
    this.fileInput.removeEventListener('change', this.handleFileUpload);
    this.hideBrowserSpinner();
    super.dispose();
  }

  private onPathChanged = () => {

    // Clear the filter input value when the path changes
    const filterInputElement = document.getElementById('filter-buckets-objects') as HTMLInputElement | null;
    if (filterInputElement) {
      filterInputElement.value = '';
      filterInputElement.removeAttribute('value'); // Also remove the attribute for consistency
      this.filterFilesByName(''); // Optionally refresh the content with an empty filter
    }

    // Loading Current Path
    const currentPath = this.browser.model.path.split(':')[1];
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
   
}