import { expect, test } from '@jupyterlab/galata';

const timeout = 5 * 60 * 1000;
const gcsTab = 'Google Cloud Storage';
const testBucket = 'acn-gcs-test-bucket';
const folderName = 'testFolder';
const fileName = 'testFile.txt';

const waitForProgressBarToDisappear = async page => {
  await page
    .locator(
      "//*[@id='GCS-bucket-tab']//div[contains(@class, 'lm-Widget') and contains(@class, 'lm-mod-hidden')]"
    )
    .waitFor({ state: 'attached' });
  await page.waitForTimeout(2000);
};

const openGCSTab = async page => {
  const tab = page.getByRole('tab', { name: gcsTab });
  if (await tab.isVisible()) {
    await tab.click();
    await waitForProgressBarToDisappear(page);
    return true;
  }
  console.warn('GCS tab is not available');
  return false;
};

const openBucket = async (page, bucketName = testBucket) => {
  await expect(
    page.getByRole('listitem', { name: `Name: ${bucketName}` })
  ).toBeVisible();
  await page.getByRole('listitem', { name: `Name: ${bucketName}` }).dblclick();
  await waitForProgressBarToDisappear(page);
};

async function createAndRenameFolder(page, folderName) {
  await page.getByRole('button', { name: 'New Folder' }).click();
  await waitForProgressBarToDisappear(page);

  const newFolder = page.getByRole('listitem', {
    name: 'Name: UntitledFolder'
  });
  await expect(newFolder).toBeVisible();

  await newFolder.getByRole('textbox').fill(folderName);
  await page
    .getByRole('region', { name: 'side panel content' })
    .getByRole('textbox')
    .press('Enter');
  await waitForProgressBarToDisappear(page);

  const renamedFolder = page.getByRole('listitem', {
    name: `Name: ${folderName}`
  });
  await expect(renamedFolder).toBeVisible();
}

async function deleteFolderOrFile(page, folderOrFileName) {
  await page
    .getByRole('listitem', { name: `Name: ${folderOrFileName}` })
    .click({ button: 'right' });
  await page.getByText('Delete', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await waitForProgressBarToDisappear(page);
  await page.waitForTimeout(5000);
  await expect(
    page.getByRole('listitem', { name: `Name: ${folderOrFileName}` })
  ).not.toBeVisible();
}

async function createFile(page) {
  await page
    .locator("//ul[@class='jp-DirListing-content']")
    .first()
    .click({ button: 'right' });
  await page.getByText('New File', { exact: true }).click();
  await waitForProgressBarToDisappear(page);
  const newFile = page.getByRole('listitem', {
    name: 'Name: untitled.txt'
  });
  await expect(newFile).toBeVisible();
  return newFile;
}

async function pasteContent(page) {
  await page.getByRole('list').click({ button: 'right' });
  await page.getByText('Paste', { exact: true }).click();
  await waitForProgressBarToDisappear(page);
}

const resetBucket = async page => {
  while (true) {
    const listItems = page.getByRole('listitem');

    if ((await listItems.count()) === 0) break;

    const item = listItems.nth(0);
    await item.click({ button: 'right' });
    await page.getByText('Delete', { exact: true }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await waitForProgressBarToDisappear(page);
    await page.waitForTimeout(5000);
  }
};

test.describe('GCS tests', () => {
  test('Verify GCS tab UI elements', async ({ page }) => {
    test.setTimeout(timeout);

    if (await openGCSTab(page)) {
      await expect(page.getByText(gcsTab)).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'New Folder' })
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'File Upload' })
      ).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();

      // Verify search box is visible on cliking toggle file filer button
      await page.getByRole('button', { name: 'Toggle File Filter' }).click();
      await expect(page.getByRole('searchbox')).toBeVisible();

      // Verify search box is not visible on cliking toggle file filer button again
      await page.getByRole('button', { name: 'Toggle File Filter' }).click();
      await expect(page.getByRole('searchbox')).not.toBeVisible();
      await expect(
        page.locator('[id="gcs-jupyter-plugin:gcsBrowser"]').getByText('Name')
      ).toBeVisible();
    }
  });
  
  test('Handle folder/file creation outside bucket', async ({ page }) => {
    test.setTimeout(timeout);

    if (await openGCSTab(page)) {
      const bucket = page.getByRole('listitem', {
        name: `Name: ${testBucket}`
      });
      const visible = await bucket.isVisible();
      if (visible) {
        // Verify folder creation is not allowed
        await bucket.click({ button: 'right' });
        await page.getByText('New Folder', { exact: true }).click();
        await expect(page.getByText('Error creating folder')).toBeVisible();
        await expect(
          page.getByText('Folders cannot be created outside of a bucket.')
        ).toBeVisible();
        await page.getByRole('button', { name: 'Ok' }).click();

        // Verify file creation is not allowed
        await bucket.click({ button: 'right' });
        await page.getByText('New File', { exact: true }).click();
        await expect(page.getByText('Error Creating File')).toBeVisible();
        await expect(
          page.getByText('Files cannot be created outside of a bucket.')
        ).toBeVisible();
        await page.getByRole('button', { name: 'Ok' }).click();
      } else {
        console.log('Test bucket is not present');
      }
    }
  });

  test('Verify delete a bucket is not allowed', async ({ page }) => {
    test.setTimeout(timeout);

    if (await openGCSTab(page)) {
      const bucket = page.getByRole('listitem', {
        name: `Name: ${testBucket}`
      });
      const visible = await bucket.isVisible();
      if (visible) {
        // Verify delete a bucket is not allowed
        await bucket.click({ button: 'right' });
        await page.getByText('Delete', { exact: true }).click();
        await expect(
          page.getByText(
            `Are you sure you want to permanently delete: ${testBucket}?`
          )
        ).toBeVisible();
        await page.getByRole('button', { name: 'Delete' }).click();
        await page.waitForTimeout(5000);
        await expect(page.getByText('Deletion Error')).toBeVisible();
        await expect(
          page.getByText('Deleting Bucket is not allowed.')
        ).toBeVisible();
        await page.getByRole('button', { name: 'Ok' }).click();
      } else {
        console.log('Test bucket is not present');
      }
    }
  });

  test('Create, rename, and delete a folder', async ({ page }) => {
    test.setTimeout(timeout);
    if (await openGCSTab(page)) {
      const bucket = page.getByRole('listitem', {
        name: `Name: ${testBucket}`
      });
      const visible = await bucket.isVisible();
      if (visible) {
        await openBucket(page);

        // Create and rename a folder
        await createAndRenameFolder(page, folderName);

        // Delete a folder
        await deleteFolderOrFile(page, folderName);

        // Right-click to create and delete folder
        await page
          .locator("//ul[@class='jp-DirListing-content']")
          .first()
          .click({ button: 'right' });
        await page.getByText('New Folder', { exact: true }).click();
        await waitForProgressBarToDisappear(page);
        await expect(
          page.getByRole('listitem', { name: 'Name: UntitledFolder' })
        ).toBeVisible();
        await page
          .getByRole('listitem', { name: 'Name: UntitledFolder' })
          .click({
            button: 'right'
          });
        await page.getByText('Delete', { exact: true }).click();

        expect(page.getByText('Delete', { exact: true }).first()).toBeVisible();
        expect(
          page.getByText(
            'Are you sure you want to permanently delete: UntitledFolder?'
          )
        ).toBeVisible();
        expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
        expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();

        await page.getByRole('button', { name: 'Delete' }).click();
        await waitForProgressBarToDisappear(page);
        await page.waitForTimeout(5000);
        await expect(
          page.getByRole('listitem', { name: 'Name: UntitledFolder' })
        ).not.toBeVisible();
      } else {
        console.log('Test bucket is not present');
      }
    }
  });

  test('Create, rename, and delete a file', async ({ page }) => {
    test.setTimeout(timeout);
    if (await openGCSTab(page)) {
      const bucket = page.getByRole('listitem', {
        name: `Name: ${testBucket}`
      });
      const visible = await bucket.isVisible();
      if (visible) {
        await openBucket(page);

        // Right-click and create a file
        const newTextFile = await createFile(page);

        // Rename a file
        await newTextFile.getByRole('textbox').fill(fileName);
        await page
          .getByRole('region', { name: 'side panel content' })
          .getByRole('textbox')
          .press('Enter');
        await waitForProgressBarToDisappear(page);
        await expect(
          page.getByRole('listitem', { name: `Name: ${fileName}` })
        ).toBeVisible();

        // Delete a file
        await deleteFolderOrFile(page, fileName);
      } else {
        console.log('Test bucket is not present');
      }
    }
  });

  test('Can edit and save a file', async ({ page }) => {
    test.setTimeout(timeout);
    if (await openGCSTab(page)) {
      const bucket = page.getByRole('listitem', {
        name: `Name: ${testBucket}`
      });
      const visible = await bucket.isVisible();
      if (visible) {
        await openBucket(page);

        // Right-click and create a file
        const newTextFile = await createFile(page);
        await page
          .getByRole('region', { name: 'side panel content' })
          .getByRole('textbox')
          .press('Enter');
        await newTextFile.dblclick();
        await page
          .locator('div.lm-Widget.jp-Spinner')
          .waitFor({ state: 'detached' });
        await page.waitForTimeout(2000);

        await page
          .getByLabel('notebook content')
          .getByRole('textbox')
          .fill('Test file edit validation');
        await page
          .getByLabel('notebook content')
          .getByRole('textbox')
          .press('Control+s');
        await page.waitForTimeout(15000);
        await page.getByTitle('Close untitled.txt').click();
        await page.waitForTimeout(2000);
        await newTextFile.dblclick();
        await page
          .locator('div.lm-Widget.jp-Spinner')
          .waitFor({ state: 'detached' });

        const content = await page
          .getByLabel('notebook content')
          .getByRole('textbox')
          .textContent();
        expect(content).toBe('Test file edit validation');
        await page.getByTitle('Close untitled.txt').click();
        await page.waitForTimeout(2000);

        // Delete a file
        await deleteFolderOrFile(page, 'untitled.txt');
      } else {
        console.log('Test bucket is not present');
      }
    }
  });

  test('Can edit and discard with out saving a file', async ({ page }) => {
    test.setTimeout(timeout);
    if (await openGCSTab(page)) {
      const bucket = page.getByRole('listitem', {
        name: `Name: ${testBucket}`
      });
      const visible = await bucket.isVisible();
      if (visible) {
        await openBucket(page);

        // Right-click and create a file
        const newTextFile = await createFile(page);
        await page
          .getByRole('region', { name: 'side panel content' })
          .getByRole('textbox')
          .press('Enter');
        await newTextFile.dblclick();

        // Verify file discard validation
        await page
          .locator("//div[@class='jp-SpinnerContent']")
          .waitFor({ state: 'detached' });
        await page
          .getByLabel('notebook content')
          .getByRole('textbox')
          .fill('Test file discard validation');
        await page.getByTitle('Close untitled.txt').click();
        expect(page.getByText('Save your work')).toBeVisible();
        expect(
          page.getByText('Save changes in "untitled.txt" before closing?')
        ).toBeVisible();
        expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
        expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
        await page.getByRole('button', { name: 'Discard' }).click();
        await page.waitForTimeout(5000);

        // Verify the content is not present
        await newTextFile.dblclick();
        await page
          .locator("//div[@class='jp-SpinnerContent']")
          .waitFor({ state: 'detached' });
        const content = await page
          .getByLabel('notebook content')
          .getByRole('textbox')
          .textContent();
        expect(content).not.toBe('Test file discard validation');
        await page.getByTitle('Close untitled.txt').click();
        await page.waitForTimeout(5000);

        // Delete a file
        await deleteFolderOrFile(page, 'untitled.txt');
      } else {
        console.log('Test bucket is not present');
      }
    }
  });

  test('Copy a file and paste at diffrent location', async ({ page }) => {
    test.setTimeout(timeout);
    if (await openGCSTab(page)) {
      const bucket = page.getByRole('listitem', {
        name: `Name: ${testBucket}`
      });
      const visible = await bucket.isVisible();
      if (visible) {
        await openBucket(page);

        // Create and rename a folder
        const testFolderName = 'testFolder1';
        await createAndRenameFolder(page, testFolderName);

        // Open folder
        await page
          .getByRole('listitem', { name: `Name: ${testFolderName}` })
          .dblclick();
        await waitForProgressBarToDisappear(page);

        // Right-click and create a file
        const newTextFile = await createFile(page);

        // Copy the file
        await newTextFile.click({ button: 'right' });
        await page.getByText('Copy', { exact: true }).click();
        await page.getByText(testBucket).click();
        await waitForProgressBarToDisappear(page);

        // Paste the file and verify
        await pasteContent(page);
        await expect(newTextFile).toBeVisible();
        await resetBucket(page);
      }
    }
  });

  test('Cut a folder and paste at diffrent location', async ({ page }) => {
    test.setTimeout(timeout);
    if (await openGCSTab(page)) {
      const bucket = page.getByRole('listitem', {
        name: `Name: ${testBucket}`
      });
      const visible = await bucket.isVisible();
      if (visible) {
        await openBucket(page);

        // Create and rename source folder
        const sourceFolderName = 'testFolder2';
        await createAndRenameFolder(page, 'testFolder2');

        // Open a folder
        await page
          .getByRole('listitem', { name: `Name: ${sourceFolderName}` })
          .dblclick();
        await waitForProgressBarToDisappear(page);

        // Right-click and create a file
        const newTextFile = await createFile(page);

        // Go back to bucket level
        await page.getByText(testBucket).click();
        await waitForProgressBarToDisappear(page);

        // Create and rename destination folder
        const destinationFolderName = 'testFolder3';
        await createAndRenameFolder(page, destinationFolderName);

        // Cut a folder
        await page
          .getByRole('listitem', { name: `Name: ${sourceFolderName}` })
          .click({ button: 'right' });
        await page.getByText('Cut', { exact: true }).click();

        // Paste inside another folder
        await page
          .getByRole('listitem', { name: `Name: ${destinationFolderName}` })
          .dblclick();
        await waitForProgressBarToDisappear(page);
        await pasteContent(page);

        // Verify the cut folder and file is visible
        await expect(
          page.getByRole('listitem', { name: `Name: ${sourceFolderName}` })
        ).toBeVisible();

        await page
          .getByRole('listitem', { name: `Name: ${sourceFolderName}` })
          .dblclick();
        await waitForProgressBarToDisappear(page);

        await expect(newTextFile).toBeVisible();
        await page.getByText(destinationFolderName).click();
        await waitForProgressBarToDisappear(page);

        await page.getByText(testBucket).click();
        await waitForProgressBarToDisappear(page);

        await expect(
          page.getByRole('listitem', { name: `Name: ${sourceFolderName}` })
        ).not.toBeVisible();

        await resetBucket(page);
      }
    }
  });

  test('Clean up bucket data', async ({ page }) => {
    test.setTimeout(timeout);
    if (await openGCSTab(page)) {
      const bucket = page.getByRole('listitem', {
        name: `Name: ${testBucket}`
      });
      const visible = await bucket.isVisible();
      if (visible) {
        await openBucket(page);

        await resetBucket(page);
      }
    }
  });
});
