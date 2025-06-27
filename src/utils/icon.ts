import { LabIcon } from '@jupyterlab/ui-components';
import storageIcon from '../../style/icons/storage_icon.svg';
import storageIconDark from '../../style/icons/Storage-icon-dark.svg';
import gcsNewFolderIcon from '../../style/icons/gcs_folder_new_icon.svg';
import gcsUploadIcon from '../../style/icons/gcs_upload_icon.svg';
import gcsRefreshIcon from '../../style/icons/gcs_refresh_button_icon.svg';
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
