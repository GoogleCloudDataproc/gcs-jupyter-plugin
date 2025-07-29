/**
 * @license
 * Copyright 2025 Google LLC
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

/** config */
export const GCLOUD_CONFIG_ERROR =
  'Please configure gcloud with account, project-id and region.';

/** jupyter server */
export const JUPYTER_SERVER_ERROR_TITLE = 'Jupyter Server Error';
export const JUPYTER_SERVER_ERROR_MESSAGE =
  'Google Cloud Storage Extension is installed. Please restart your Jupyter Server for the changes to take effect.';

/** Upload */
export const UPLOAD_ERROR_TITLE = 'Upload Error';
export const BUCKET_LEVEL_UPLOAD_MESSAGE =
  'Uploading files at bucket level is not allowed';

export const FILE_EXIST_TITLE = 'Upload file';
export const FILE_OVERWRITE_MESSAGE =
  ' already exists. Do you want to overwrite?'; // File Name added as prefix
export const OVERWRITE_BUTTON_TEXT = 'Overwrite';

/** Folder Creation */
export const FOLDER_CREATION_ERROR_TITLE = 'Error creating folder';
export const BUCKET_LEVEL_FOLDER_CREATION_MESSAGE =
  'Folders cannot be created outside of a bucket.';

/** File Creation */
export const FILE_CREATION_ERROR_TITLE = 'Error Creating File';
export const BUCKET_LEVEL_FILE_CREATION_MESSAGE =
  'Files cannot be created outside of a bucket.';

/** Notebook Creation */
export const NOTEBOOK_CREATION_ERROR_TITLE = 'Error Creating Notebook';
export const BUCKET_LEVEL_NOTEBOOK_CREATION_MESSAGE =
  'Notebooks have to be created inside a bucket. Open a bucket in the Cloud Storage Browser to create a new notebook.';
export const NOTEBOOK_CREATION_GCS_CONTEXT_MESSAGE =
  'Cloud Storage Browser has the file system context. To create a notebook in your local file system, switch the file system context by selecting a folder in File Browser.';

/** Object Creation */
export const OBJECT_CREATION_AT_ROOT_ERROR_MESSAGE =
  'Cannot create new objects in the root directory.';

/** Unsupported Type Creation */
export const UNSUPPORTED_CREATE_TITLE = 'Unsupported Type Error';
export const UNSUPPORTED_CREATE_ERROR = 'Unsupported creation type : '; // Type added as suffix

/** file operation */

/** Common */
export const NO_DATA_PROVIDED_ERROR = 'No data provided for this operation.';

/** deletion */
export const DELETION_ERROR_TITLE = 'Deletion Error';

/** rename */
export const RENAME_ERROR_TITLE = 'Rename Error';
export const NAME_EXCEEDS_MAX_LENGTH_ERROR =
  'The maximum object length is 1024 characters.';
export const BUCKET_RENAME_ERROR = 'Renaming Bucket is not allowed.';
export const INVALID_FILE_NAME_ERROR = 'Invalid File Name Provided.';

/** Pasting in root folder (Bucket) */
export const PASTE_BUCKET_TITLE = 'Invalid Destination';
export const PASTE_BUCKET_ERROR_MESSAGE =
  'Cannot paste files or folders into buckets directory.';

/** Copy Operation */
export const COPY_ERROR_TITLE = 'Error Copying File';
export const COPY_GENERAL_FILE_ERROR =
  'An error occurred while copying the file.';
export const COPY_GENERAL_FOLDER_ERROR =
  'An error occurred while copying the folder.';
export const COPY_FILE_EXISTS_ERROR =
  'File already exists in the destination directory.';
export const COPY_FOLDER_EXISTS_ERROR = 'Folder already exists.';
export const COPY_FILE_TO_SAME_LOCATION_ERROR =
  'Cannot copy file to its original location.';
