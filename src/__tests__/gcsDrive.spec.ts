/**
 * @license
 * Copyright 2026 Google LLC
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

import { JupyterFrontEnd } from '@jupyterlab/application';
import { Dialog, showDialog } from '@jupyterlab/apputils';
import { Contents } from '@jupyterlab/services';
import { GCSDrive } from '../gcs/gcsDrive';
import { GcsBrowserWidget } from '../gcs/gcsBrowserWidget';
import { GcsService } from '../gcs/gcsService';
import {
  DIRECTORY,
  FILE,
  RENAME_SIGNAL,
  UNTITLED_DIRECTORY_NAME
} from '../utils/const';
import { RENAME_ERROR_TITLE } from '../utils/message';

jest.mock('@jupyterlab/apputils', () => ({
  Dialog: {
    okButton: jest.fn(() => ({ label: 'OK' }))
  },
  showDialog: jest.fn().mockResolvedValue({ button: { accept: true } }),
  Spinner: jest.fn()
}));

describe('GCSDrive.rename', () => {
  let drive: GCSDrive;
  let mockBrowserWidget: {
    showProgressBar: jest.Mock;
    hideProgressBar: jest.Mock;
    refreshContents: jest.Mock;
  };
  let renameFileSpy: jest.SpyInstance;
  let deleteFileSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    const mockApp = {
      shell: { currentWidget: null }
    } as unknown as JupyterFrontEnd;

    drive = new GCSDrive(mockApp);
    mockBrowserWidget = {
      showProgressBar: jest.fn(),
      hideProgressBar: jest.fn(),
      refreshContents: jest.fn().mockResolvedValue(undefined)
    };
    drive.setBrowserWidget(mockBrowserWidget as unknown as GcsBrowserWidget);

    renameFileSpy = jest.spyOn(GcsService, 'renameFile');
    deleteFileSpy = jest
      .spyOn(GcsService, 'deleteFile')
      .mockResolvedValue({ status: 200 });
  });

  afterEach(() => {
    drive.dispose();
    jest.restoreAllMocks();
  });

  it('does not call deleteFile after renaming an extensionless file', async () => {
    renameFileSpy.mockResolvedValue({ status: 200 });

    const result = await drive.rename(
      'victim-bucket/reports',
      'victim-bucket/reports_old'
    );

    expect(renameFileSpy).toHaveBeenCalledTimes(1);
    expect(renameFileSpy).toHaveBeenCalledWith({
      oldBucket: 'victim-bucket',
      oldPath: 'reports',
      newBucket: 'victim-bucket',
      newPath: 'reports_old'
    });
    expect(deleteFileSpy).not.toHaveBeenCalled();
    expect(result.name).toBe('reports_old');
    expect(mockBrowserWidget.showProgressBar).toHaveBeenCalledTimes(1);
    expect(mockBrowserWidget.refreshContents).toHaveBeenCalledTimes(1);
    expect(mockBrowserWidget.hideProgressBar).toHaveBeenCalledTimes(1);
  });

  it('does not call deleteFile and emits rename signal for a file with extension', async () => {
    renameFileSpy.mockResolvedValue({ status: 200 });
    const emitted: Contents.IChangedArgs[] = [];
    drive.fileChanged.connect((_, args) => emitted.push(args));

    const result = await drive.rename(
      'victim-bucket/data.csv',
      'victim-bucket/data_new.csv'
    );

    expect(renameFileSpy).toHaveBeenCalledTimes(1);
    expect(renameFileSpy).toHaveBeenCalledWith({
      oldBucket: 'victim-bucket',
      oldPath: 'data.csv',
      newBucket: 'victim-bucket',
      newPath: 'data_new.csv'
    });
    expect(deleteFileSpy).not.toHaveBeenCalled();
    expect(result.type).toBe(FILE);
    expect(result.path).toBe('victim-bucket/data_new.csv');
    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe(RENAME_SIGNAL);
    expect(emitted[0].oldValue?.path).toBe('victim-bucket/data.csv');
    expect(emitted[0].newValue?.path).toBe('victim-bucket/data_new.csv');
  });

  it('does not call deleteFile when renaming an untitled folder', async () => {
    renameFileSpy.mockResolvedValue({ status: 200 });

    const result = await drive.rename(
      `victim-bucket/${UNTITLED_DIRECTORY_NAME}`,
      'victim-bucket/my_folder'
    );

    expect(renameFileSpy).toHaveBeenCalledTimes(1);
    expect(renameFileSpy).toHaveBeenCalledWith({
      oldBucket: 'victim-bucket',
      oldPath: `${UNTITLED_DIRECTORY_NAME}/`,
      newBucket: 'victim-bucket',
      newPath: 'my_folder/'
    });
    expect(deleteFileSpy).not.toHaveBeenCalled();
    expect(result.type).toBe(DIRECTORY);
    expect(result.name).toBe('my_folder');
  });

  it('does not call deleteFile after cross-bucket move via rename', async () => {
    renameFileSpy.mockResolvedValue({ status: 200 });

    await drive.rename('bucket-a/reports', 'bucket-b/reports');

    expect(renameFileSpy).toHaveBeenCalledTimes(1);
    expect(renameFileSpy).toHaveBeenCalledWith({
      oldBucket: 'bucket-a',
      oldPath: 'reports',
      newBucket: 'bucket-b',
      newPath: 'reports'
    });
    expect(deleteFileSpy).not.toHaveBeenCalled();
  });

  it('shows error dialog and does not call deleteFile when rename fails', async () => {
    renameFileSpy.mockResolvedValue({
      status: 409,
      error: 'A file with name data_new.csv already exists in the destination.'
    });
    const emitted: Contents.IChangedArgs[] = [];
    drive.fileChanged.connect((_, args) => emitted.push(args));

    const result = await drive.rename(
      'victim-bucket/data.csv',
      'victim-bucket/data_new.csv'
    );

    expect(deleteFileSpy).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(0);
    expect(showDialog).toHaveBeenCalledWith({
      title: RENAME_ERROR_TITLE,
      body: 'A file with name data_new.csv already exists in the destination.',
      buttons: [Dialog.okButton()]
    });
    expect(result.path).toBe('');
  });
});
