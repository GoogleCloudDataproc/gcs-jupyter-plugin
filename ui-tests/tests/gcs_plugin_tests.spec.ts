import { expect, test } from '@jupyterlab/galata';

const timeout = 5 * 60 * 1000;
const gcsTab = 'Google Cloud Storage';
const testBucket = 'test_am_bucket'; // Bucket name should be changed once created in kokoro project
const folderName = 'testFolder';
const fileName = 'testFile.txt';

const openGCSTab = async page => {
  const tab = page.getByRole('tab', { name: gcsTab });
  if (await tab.isVisible()) {
    await tab.click();
    await page.waitForTimeout(20000);
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
  await page.waitForTimeout(20000);
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
      await expect(
        page
          .locator('[id="dataproc-jupyter-plugin\\:gcsBrowser"]')
          .getByText('Name')
      ).toBeVisible();
      await expect(
        page
          .locator('[id="dataproc-jupyter-plugin\\:gcsBrowser"]')
          .getByText('Modified', { exact: true })
      ).toBeVisible();
    }
  });

  test('Handle folder/file creation outside bucket', async ({ page }) => {
    test.setTimeout(timeout);

    if (await openGCSTab(page)) {      
      // Verify delete a bucket is not allowed
      const items = await page.getByRole('listitem').count();
      if (items >= 1) {
        const bucket = page.getByRole('listitem', {
          name: `Name: ${testBucket}`
        });
        await bucket.click({ button: 'right' });
        await page.getByText('Delete', { exact: true }).click();
        await expect(
          page.getByText(
            `Are you sure you want to permanently delete: ${testBucket}?`
          )
        ).toBeVisible();
        await page.getByRole('button', { name: 'Delete' }).click();
        await expect(page.getByText('Deletion Error')).toBeVisible();
        await expect(
          page.getByText('Deleting Bucket is not allowed.')
        ).toBeVisible();
        await page.getByRole('button', { name: 'Ok' }).click();
      }
    }
  });

  test('Create, rename, and delete a folder', async ({ page }) => {
    test.setTimeout(timeout);
    if (await openGCSTab(page)) {
      await openBucket(page);

      // Create folder
      await page.getByRole('button', { name: 'New Folder' }).click();
      await page.waitForTimeout(30000);
      const newFolder = page.getByRole('listitem', {
        name: 'Name: UntitledFolder' });
      await expect(newFolder).toBeVisible();

      // Rename folder
      await newFolder.getByRole('textbox').fill(folderName);
      await page
        .getByRole('region', { name: 'side panel content' })
        .getByRole('textbox')
        .press('Enter');
      await page.waitForTimeout(20000);
      await expect(
        page.getByRole('listitem', { name: `Name: ${folderName}` })
      ).toBeVisible();

      // Delete folder
      await page
        .getByRole('listitem', { name: `Name: ${folderName}` })
        .click({ button: 'right' });
      await page.getByText('Delete', { exact: true }).click();
      await page.getByRole('button', { name: 'Delete' }).click();
      await page.waitForTimeout(20000);
      await expect(
        page.getByRole('listitem', { name: `Name: ${folderName}` })
      ).not.toBeVisible();

      // Right click to create and delete a folder
      await page
        .locator("//ul[@class='jp-DirListing-content']")
        .first()
        .click({ button: 'right' });
      await page.getByText('New Folder', { exact: true }).click();
      await page.waitForTimeout(20000);
      await expect(
        page.getByRole('listitem', { name: 'Name: UntitledFolder' })
      ).toBeVisible();
      await page.getByRole('listitem', { name: 'Name: UntitledFolder' }).click({
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
      await page.waitForTimeout(30000);

      await expect(
        page.getByRole('listitem', { name: 'Name: UntitledFolder' })
      ).not.toBeVisible();
    }
  });

  test('Create, rename, and delete a file', async ({ page }) => {
    test.setTimeout(timeout);
    if (await openGCSTab(page)) {
      await openBucket(page);

      // Right-click and create file
      await page
        .locator("//ul[@class='jp-DirListing-content']")
        .first()
        .click({ button: 'right' });
      await page.getByText('New File', { exact: true }).click();
      await page.waitForTimeout(30000);
      const newFile = page.getByRole('listitem', {
        name: 'Name: untitled.txt'
      });
      await expect(newFile).toBeVisible();

      // Rename file
      await newFile.getByRole('textbox').fill(fileName);
      await page
        .getByRole('region', { name: 'side panel content' })
        .getByRole('textbox')
        .press('Enter');
      await page.waitForTimeout(20000);
      await expect(
        page.getByRole('listitem', { name: `Name: ${fileName}` })
      ).toBeVisible();

      // Delete file
      await page
        .getByRole('listitem', { name: `Name: ${fileName}` })
        .click({ button: 'right' });
      await page.getByText('Delete', { exact: true }).click();
      await page.getByRole('button', { name: 'Delete' }).click();
      await page.waitForTimeout(20000);
      await expect(
        page.getByRole('listitem', { name: `Name: ${fileName}` })
      ).not.toBeVisible();
    }
  });

  test('Can edit and save a file', async ({ page }) => {
    test.setTimeout(timeout);
    if (await openGCSTab(page)) {
      await openBucket(page);

      // Right-click and create file
      await page
        .locator("//ul[@class='jp-DirListing-content']")
        .first()
        .click({ button: 'right' });
      await page.getByText('New File', { exact: true }).click();
      await page.waitForTimeout(30000);
      const newFile = page.getByRole('listitem', {
        name: 'Name: untitled.txt'
      });
      await page
        .getByRole('region', { name: 'side panel content' })
        .getByRole('textbox')
        .press('Enter');
      await page.waitForTimeout(5000);
      await expect(newFile).toBeVisible();
      await newFile.dblclick();
      await page.waitForTimeout(20000);
      await page
        .getByLabel('notebook content')
        .getByRole('textbox')
        .fill('Test file edit validation');
      await page
        .getByLabel('notebook content')
        .getByRole('textbox')
        .press('Control+s');
      await page.waitForTimeout(30000);
      await page.getByTitle('Close untitled.txt').click();
      await page.waitForTimeout(5000);
      await newFile.dblclick();
      await page.waitForTimeout(20000);

      const content = await page
        .getByLabel('notebook content')
        .getByRole('textbox')
        .textContent();
      expect(content).toBe('Test file edit validation');
      await page.getByTitle('Close untitled.txt').click();
      await page.waitForTimeout(5000);

      // Delete file
      await page
        .getByRole('listitem', { name: `Name: untitled.txt` })
        .click({ button: 'right' });
      await page.getByText('Delete', { exact: true }).click();
      await page.getByRole('button', { name: 'Delete' }).click();
      await page.waitForTimeout(20000);
      await expect(
        page.getByRole('listitem', { name: `Name: untitled.txt` })
      ).not.toBeVisible();
    }
  });

  test('Can edit and discard with out saving a file', async ({ page }) => {
    test.setTimeout(timeout);
    if (await openGCSTab(page)) {
      await openBucket(page);

      // Right-click and create file
      await page
        .locator("//ul[@class='jp-DirListing-content']")
        .first()
        .click({ button: 'right' });
      await page.getByText('New File', { exact: true }).click();
      await page.waitForTimeout(30000);
      const newFile = page.getByRole('listitem', {
        name: 'Name: untitled.txt'
      });
      await page
        .getByRole('region', { name: 'side panel content' })
        .getByRole('textbox')
        .press('Enter');
      await page.waitForTimeout(5000);
      await expect(newFile).toBeVisible();
      await newFile.dblclick();
      await page.waitForTimeout(20000);
      // Wait till the file opened
      await page
        .locator("//div[@class='jp-SpinnerContent']")
        .waitFor({ state: 'detached' });
      await page
        .getByLabel('notebook content')
        .getByRole('textbox')
        .fill('Test file doscard validation');
      await page.getByTitle('Close untitled.txt').click();
      expect(page.getByText('Save your work')).toBeVisible();
      expect(
        page.getByText('Save changes in "untitled.txt" before closing?')
      ).toBeVisible();
      expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
      expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
      await page.getByRole('button', { name: 'Discard' }).click();
      await page.waitForTimeout(5000);
      await newFile.dblclick();
      // Wait till the file opened
      await page
        .locator("//div[@class='jp-SpinnerContent']")
        .waitFor({ state: 'detached' });

      const content = await page
        .getByLabel('notebook content')
        .getByRole('textbox')
        .textContent();
      expect(content).not.toBe('Test file doscard validation');
      await page.getByTitle('Close untitled.txt').click();
      await page.waitForTimeout(5000);

      // Delete file
      await page
        .getByRole('listitem', { name: `Name: untitled.txt` })
        .click({ button: 'right' });
      await page.getByText('Delete', { exact: true }).click();
      await page.getByRole('button', { name: 'Delete' }).click();
      await page.waitForTimeout(20000);
      await expect(
        page.getByRole('listitem', { name: `Name: untitled.txt` })
      ).not.toBeVisible();
    }
  });
});
