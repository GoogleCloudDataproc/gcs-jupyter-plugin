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

import { LabIcon } from '@jupyterlab/ui-components';
import storageIcon from '../../style/icons/storage_icon.svg';
import storageIconDark from '../../style/icons/Storage-icon-dark.svg';
import gcsNewFolderIcon from '../../style/icons/gcs_folder_new_icon.svg';
import gcsNewFolderIconDark from '../../style/icons/gcs_folder_new_icon_dark_theme.svg';
import gcsUploadIcon from '../../style/icons/gcs_upload_icon.svg';
import gcsUploadIconDark from '../../style/icons/gcs_upload_icon_dark_theme.svg';
import gcsRefreshIcon from '../../style/icons/gcs_refresh_button_icon.svg';
import gcsRefreshIconDark from '../../style/icons/gcs_refresh_button_icon_dark_theme.svg';
import gcsFilterIcon from '../../style/icons/gcs_filter_icon.svg';
import gcsFilterIconDark from '../../style/icons/gcs_filter_icon_dark_theme.svg';
import signinGoogleIcon from '../../style/icons/signin_google_icon.svg';

export const iconStorage = new LabIcon({
  name: 'launcher:storage-icon',
  svgstr: storageIcon
});

export const iconStorageDark = new LabIcon({
  name: 'launcher:storage-icon-dark',
  svgstr: storageIconDark
});

export const iconGCSNewFolder = new LabIcon({
  name: 'gcs-toolbar:gcs-folder-new-icon',
  svgstr: gcsNewFolderIcon
});

export const iconGCSUpload = new LabIcon({
  name: 'gcs-toolbar:gcs-upload-icon',
  svgstr: gcsUploadIcon
});

export const iconSigninGoogle = new LabIcon({
  name: 'launcher:signin_google_icon',
  svgstr: signinGoogleIcon
});

export const iconGCSRefresh = new LabIcon({
  name: 'gcs-toolbar:gcs-refresh-custom-icon',
  svgstr: gcsRefreshIcon
});

export const iconGCSNewFolderDark = new LabIcon({
  name: 'gcs-toolbar:gcs-folder-new-icon-dark',
  svgstr: gcsNewFolderIconDark
});

export const iconGCSUploadDark = new LabIcon({
  name: 'gcs-toolbar:gcs-upload-icon-dark',
  svgstr: gcsUploadIconDark
});

export const iconGCSRefreshDark = new LabIcon({
  name: 'gcs-toolbar:gcs-refresh-custom-icon-dark',
  svgstr: gcsRefreshIconDark
});

export const iconFileFilter = new LabIcon({
  name: 'gcs-toolbar:gcs-filter-icon',
  svgstr: gcsFilterIcon
});

export const iconFileFilterDark = new LabIcon({
  name: 'gcs-toolbar:gcs-filter-icon-dark',
  svgstr: gcsFilterIconDark
});
