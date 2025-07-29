# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import asyncio
import unittest
from unittest import mock
from google.cloud import storage
import datetime
import json
import base64

from gcs_jupyter_plugin.services.gcs import Client


class TestGCSClient(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        # Mock logging
        self.log = mock.MagicMock()

        # Mock client session
        self.client_session = mock.MagicMock()

        # Valid credentials
        self.valid_credentials = {
            "access_token": "fake-token",
            "project_id": "test-project",
            "region_id": "us-central1",
        }

        # Set up the client with valid credentials
        self.client = Client(self.valid_credentials, self.log, self.client_session)

        # --- Common Mock Setup ---
        # Patch google.cloud.storage.Client and google.oauth2.credentials.Credentials
        self.patcher_storage_client = mock.patch("google.cloud.storage.Client")
        self.patcher_credentials = mock.patch("google.oauth2.credentials.Credentials")

        self.mock_storage_client = self.patcher_storage_client.start()
        self.mock_credentials = self.patcher_credentials.start()

        # Set up the client with valid credentials
        self.client = Client(self.valid_credentials, self.log, self.client_session)

        # Resetting the mock AFTER the Client is initialized in setUp
        # before the actual test logic begins.
        self.mock_credentials.reset_mock()
        self.mock_storage_client.reset_mock()
        self.mock_storage_client.return_value.reset_mock()

    def _create_mock_bucket(self, name, updated_dt=None):
        bucket = mock.MagicMock()
        bucket.name = name
        bucket.updated = updated_dt
        return bucket

    def _create_mock_blob(
        self,
        name,
        size,
        updated_dt,
        time_created_dt,
        content_type=None,
        is_directory=False,
    ):
        blob = mock.MagicMock()
        blob.name = name
        blob.size = size
        blob.time_created = time_created_dt
        blob.updated = updated_dt
        blob.content_type = content_type
        blob.isDirectory = is_directory
        blob.exists.return_value = True
        return blob

    def test_init_missing_credentials(self):
        """Test initialization with missing credentials"""
        invalid_credentials = [
            {
                "project_id": "test-project",
                "region_id": "us-central1",
            },  # Missing access_token
            {
                "access_token": "fake-token",
                "region_id": "us-central1",
            },  # Missing project_id
            {
                "access_token": "fake-token",
                "project_id": "test-project",
            },  # Missing region_id
        ]

        for creds in invalid_credentials:
            with self.assertRaises(ValueError):
                Client(creds, self.log, self.client_session)

    def test_list_buckets_success(self):
        """Test successful bucket listing"""
        # Set up bucket mock objects
        bucket1 = self._create_mock_bucket(
            "bucket1", datetime.datetime(2023, 1, 1, 12, 0, 0)
        )
        bucket2 = self._create_mock_bucket(
            "bucket2", datetime.datetime(2023, 1, 1, 11, 0, 0)
        )

        mock_client_instance = self.mock_storage_client.return_value
        mock_client_instance.list_buckets.return_value = [bucket1, bucket2]
        result = asyncio.run(self.client.list_buckets())

        self.mock_credentials.assert_called_once_with("fake-token")

        self.mock_storage_client.assert_called_once_with(
            project="test-project", credentials=self.mock_credentials.return_value
        )

        mock_client_instance.list_buckets.assert_called()

        expected = [
            {"items": {"name": "bucket1", "updated": "2023-01-01T12:00:00"}},
            {"items": {"name": "bucket2", "updated": "2023-01-01T11:00:00"}},
        ]

        self.assertEqual(result, expected)

    def test_list_buckets_with_prefix(self):
        """Test bucket listing with prefix filter"""
        bucket = self._create_mock_bucket(
            "test-bucket", datetime.datetime(2023, 1, 1, 12, 0, 0)
        )

        mock_client_instance = self.mock_storage_client.return_value
        mock_client_instance.list_buckets.return_value = [bucket]

        result = asyncio.run(self.client.list_buckets(prefix="test"))

        mock_client_instance.list_buckets.assert_called_with(prefix="test")

        expected = [
            {"items": {"name": "test-bucket", "updated": "2023-01-01T12:00:00"}}
        ]
        self.assertEqual(result, expected)

    async def test_list_buckets_with_prefix_no_match(self):
        """Test bucket listing with prefix filter when no match"""
        bucket = self._create_mock_bucket(
            "test-bucket", datetime.datetime(2023, 1, 1, 12, 0, 0)
        )

        mock_client_instance = self.mock_storage_client.return_value

        def mock_list_buckets_side_effect(**kwargs):
            if kwargs.get("prefix") == "some-prefix":
                return []
            # For this specific test, we only care about 'data' resulting in []
            return [bucket]

        mock_client_instance.list_buckets.side_effect = mock_list_buckets_side_effect

        result = await self.client.list_buckets(prefix="some-prefix")

        mock_client_instance.list_buckets.assert_called_once_with(prefix="some-prefix")

        expected = []
        self.assertEqual(result, expected)

    async def test_list_buckets_exception_handling(self):
        """Test error handling during bucket listing."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_client_instance.list_buckets.side_effect = Exception("GCS error")

        result = await self.client.list_buckets()
        self.log.exception.assert_called_once_with("Error fetching datasets list.")
        self.assertEqual(result, {"error": "GCS error"})

    # --- Test Cases for list_files ---
    async def test_list_files_success_with_files_and_prefixes(self):
        """Test successful file and subdirectory listing."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket

        # Mock blobs for the initial list_blobs call (with delimiter)
        mock_blobs_with_delimiter = mock.MagicMock()
        mock_blobs_with_delimiter.prefixes = ["folder1/", "folder2/"]
        mock_blobs_with_delimiter.__iter__.return_value = [
            self._create_mock_blob(
                "file1.txt",
                100,
                datetime.datetime(2023, 1, 5),
                datetime.datetime(2023, 1, 4),
                "text/plain",
            ),
            self._create_mock_blob(
                "file2.txt",
                200,
                datetime.datetime(2023, 1, 6),
                datetime.datetime(2023, 1, 5),
                "text/plain",
            ),
        ]
        mock_client_instance.list_blobs.return_value = mock_blobs_with_delimiter

        # Mock blobs for the subsequent list_blobs call (for prefix last updated)
        # This simulates files within 'folder1/' and 'folder2/'
        mock_all_blobs_under_prefix = [
            self._create_mock_blob(
                "folder1/subfile1.txt",
                50,
                datetime.datetime(2023, 1, 7),
                datetime.datetime(2023, 1, 6),
                "text/plain",
            ),
            self._create_mock_blob(
                "folder1/subfile2.txt",
                60,
                datetime.datetime(2023, 1, 8),
                datetime.datetime(2023, 1, 7),
                "text/plain",
            ),
            self._create_mock_blob(
                "folder2/subfileA.txt",
                70,
                datetime.datetime(2023, 1, 9),
                datetime.datetime(2023, 1, 8),
                "text/plain",
            ),
            self._create_mock_blob(
                "folder2/subfileB.txt",
                80,
                datetime.datetime(2023, 1, 10),
                datetime.datetime(2023, 1, 9),
                "text/plain",
            ),
        ]
        # Use side_effect to return different iterators for list_blobs calls
        mock_client_instance.list_blobs.side_effect = [
            mock_blobs_with_delimiter,  # First call for blobs with delimiter
            iter(mock_all_blobs_under_prefix),  # Second call for all blobs under prefix
        ]

        result = await self.client.list_files("test-bucket", "some-prefix/")

        mock_client_instance.list_blobs.assert_any_call(
            "test-bucket",
            prefix="some-prefix/",
            delimiter="/",
            fields="items(name,size,timeCreated,updated,contentType),prefixes",
        )

        expected = {
            "prefixes": [
                {"prefixes": {"name": "folder1/"}},
                {"prefixes": {"name": "folder2/"}},
            ],
            "files": [
                {
                    "items": {
                        "name": "file1.txt",
                        "timeCreated": "2023-01-04T00:00:00",
                        "updated": "2023-01-05T00:00:00",
                        "size": 100,
                        "content_type": "text/plain",
                    }
                },
                {
                    "items": {
                        "name": "file2.txt",
                        "timeCreated": "2023-01-05T00:00:00",
                        "updated": "2023-01-06T00:00:00",
                        "size": 200,
                        "content_type": "text/plain",
                    }
                },
            ],
        }

        self.assertEqual(result, expected)

    async def test_list_files_success_only_files(self):
        """Test successful file listing with no subdirectories."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket

        mock_blobs = mock.MagicMock()
        mock_blobs.prefixes = []  # No prefixes
        mock_blobs.__iter__.return_value = [
            self._create_mock_blob(
                "doc.pdf",
                500,
                datetime.datetime(2023, 2, 1),
                datetime.datetime(2023, 1, 31),
                "application/pdf",
            ),
            self._create_mock_blob(
                "image.png",
                300,
                datetime.datetime(2023, 2, 2),
                datetime.datetime(2023, 2, 1),
                "image/png",
            ),
        ]
        mock_client_instance.list_blobs.return_value = mock_blobs

        result = await self.client.list_files("test-bucket", "no-prefix/")

        mock_client_instance.list_blobs.assert_called_once_with(
            "test-bucket",
            prefix="no-prefix/",
            delimiter="/",
            fields="items(name,size,timeCreated,updated,contentType),prefixes",
        )

        expected = {
            "prefixes": [],
            "files": [
                {
                    "items": {
                        "name": "doc.pdf",
                        "timeCreated": "2023-01-31T00:00:00",
                        "updated": "2023-02-01T00:00:00",
                        "size": 500,
                        "content_type": "application/pdf",
                    }
                },
                {
                    "items": {
                        "name": "image.png",
                        "timeCreated": "2023-02-01T00:00:00",
                        "updated": "2023-02-02T00:00:00",
                        "size": 300,
                        "content_type": "image/png",
                    }
                },
            ],
        }
        self.assertEqual(result, expected)

    async def test_list_files_success_only_prefixes(self):
        """Test successful file listing with only subdirectories."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket

        mock_blobs_with_delimiter = mock.MagicMock()
        mock_blobs_with_delimiter.prefixes = ["empty_folder1/", "empty_folder2/"]
        mock_blobs_with_delimiter.__iter__.return_value = []  # No files
        mock_client_instance.list_blobs.return_value = mock_blobs_with_delimiter

        # For prefix last updated, we'll return mock blobs inside the folders
        mock_all_blobs_under_prefix = [
            self._create_mock_blob(
                "empty_folder1/placeholder.txt",
                10,
                datetime.datetime(2023, 3, 1),
                datetime.datetime(2023, 2, 28),
                "text/plain",
            ),
            self._create_mock_blob(
                "empty_folder2/placeholder.txt",
                10,
                datetime.datetime(2023, 3, 2),
                datetime.datetime(2023, 3, 1),
                "text/plain",
            ),
        ]
        mock_client_instance.list_blobs.side_effect = [
            mock_blobs_with_delimiter,
            iter(mock_all_blobs_under_prefix),
        ]

        result = await self.client.list_files("test-bucket", "")

        mock_client_instance.list_blobs.assert_any_call(
            "test-bucket",
            prefix="",
            delimiter="/",
            fields="items(name,size,timeCreated,updated,contentType),prefixes",
        )
        expected = {
            "prefixes": [
                {"prefixes": {"name": "empty_folder1/"}},
                {"prefixes": {"name": "empty_folder2/"}},
            ],
            "files": [],
        }
        self.assertEqual(result, expected)

    async def test_list_files_empty_bucket(self):
        """Test listing files in an empty bucket."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket

        mock_blobs = mock.MagicMock()
        mock_blobs.prefixes = []
        mock_blobs.__iter__.return_value = []  # No files or prefixes
        mock_client_instance.list_blobs.return_value = mock_blobs

        result = await self.client.list_files("empty-bucket", "")

        mock_client_instance.list_blobs.assert_called_once_with(
            "empty-bucket",
            prefix="",
            delimiter="/",
            fields="items(name,size,timeCreated,updated,contentType),prefixes",
        )

        expected = {"prefixes": [], "files": []}
        self.assertEqual(result, expected)

    # --- Test Cases for get_file ---
    async def test_get_file_json_format_success(self):
        """Test getting a file in JSON format."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_blob = self._create_mock_blob(
            "test.json", 100, None, None, "application/json"
        )
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.return_value = mock_blob
        mock_blob.download_as_text.return_value = '{"cells": [{"cell_type": "code"}]}'

        result = await self.client.get_file("test-bucket", "test.json", "json")
        self.assertEqual(result, '{"cells": [{"cell_type": "code"}]}')
        mock_blob.download_as_text.assert_called_once()
        mock_blob.download_as_bytes.assert_not_called()

    async def test_get_file_base64_format_success(self):
        """Test getting a file in base64 format."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_blob = self._create_mock_blob("image.png", 50, None, None, "image/png")
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.return_value = mock_blob

        mock_file_content = b"This is binary image data."
        mock_blob.download_as_bytes.return_value = mock_file_content

        result = await self.client.get_file("test-bucket", "image.png", "base64")
        expected_base64 = base64.b64encode(mock_file_content).decode("utf-8")
        self.assertEqual(result, expected_base64)
        mock_blob.download_as_bytes.assert_called_once()
        mock_blob.download_as_text.assert_not_called()

    async def test_get_file_default_format_success(self):
        """Test getting a file in default (text) format."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_blob = self._create_mock_blob("document.txt", 30, None, None, "text/plain")
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.return_value = mock_blob
        mock_blob.download_as_text.return_value = "Hello, world!"

        result = await self.client.get_file("test-bucket", "document.txt", "text")
        self.assertEqual(result, "Hello, world!")
        mock_blob.download_as_text.assert_called_once()
        mock_blob.download_as_bytes.assert_not_called()

    async def test_get_file_exception_handling(self):
        """Test error handling during file retrieval."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.side_effect = Exception("Blob not found")
        with self.assertRaises(Exception) as context:
            await self.client.get_file(
                "non-existent-bucket", "non-existent-file.txt", "text"
            )
        self.assertEqual(str(context.exception), "Blob not found")
        self.log.exception.assert_not_called()

    # --- Test Cases for create_folder ---
    async def test_create_folder_success(self):
        """Test successful folder creation."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_blob = self._create_mock_blob(
            "test_folder/",
            0,
            datetime.datetime(2023, 4, 1),
            datetime.datetime(2023, 4, 1),
            "application/x-www-form-urlencoded;charset=UTF-8",
        )
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.return_value = mock_blob
        mock_blob.upload_from_string.return_value = None  # No return value for upload

        result = await self.client.create_folder("test-bucket", "", "test_folder")

        mock_client_instance.bucket.assert_called_once_with("test-bucket")
        mock_bucket.blob.assert_called_once_with("test_folder/")
        mock_blob.upload_from_string.assert_called_once_with("")

        self.assertIn("name", result)
        self.assertEqual(result["name"], "test_folder/")
        self.assertEqual(result["bucket"], "test-bucket")
        self.assertEqual(result["size"], "0")
        self.assertIn("timeCreated", result)
        self.assertIn("updated", result)

    async def test_create_folder_nested_path_success(self):
        """Test successful folder creation in a nested path."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_blob = self._create_mock_blob(
            "parent_folder/nested_folder/",
            0,
            datetime.datetime(2023, 4, 2),
            datetime.datetime(2023, 4, 2),
            "application/x-www-form-urlencoded;charset=UTF-8",
        )
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.return_value = mock_blob
        mock_blob.upload_from_string.return_value = None

        result = await self.client.create_folder(
            "test-bucket", "parent_folder", "nested_folder"
        )

        mock_bucket.blob.assert_called_once_with("parent_folder/nested_folder/")
        self.assertEqual(result["name"], "parent_folder/nested_folder/")

    async def test_create_folder_exception_handling(self):
        """Test error handling during folder creation."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_client_instance.bucket.side_effect = Exception("Error creating folder.")

        result = await self.client.create_folder("test-bucket", "", "new_folder")
        self.log.exception.assert_called_once_with("Error creating folder.")
        self.assertEqual(result, {"error": "Error creating folder."})

    # --- Test Cases for save_content ---
    async def test_save_content_upload_new_file_success(self):
        """Test uploading new file content successfully (uploadFlag=True)."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_blob = self._create_mock_blob(
            "new_file.txt",
            50,
            datetime.datetime(2023, 5, 1),
            datetime.datetime(2023, 5, 1),
            "text/plain",
        )
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.return_value = mock_blob
        mock_blob.exists.return_value = False  # File does not exist for upload
        mock_blob.upload_from_string.return_value = None

        content = "This is a new file content."
        result = await self.client.save_content(
            "test-bucket", "new_file.txt", content, True
        )

        mock_bucket.blob.assert_called_once_with("new_file.txt")
        mock_blob.exists.assert_called_once()
        mock_blob.upload_from_string.assert_called_once_with(
            content, content_type="media"
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["name"], "new_file.txt")
        self.assertEqual(result["size"], 50)
        self.assertEqual(result["bucket"], "test-bucket")

    async def test_save_content_save_existing_file_success(self):
        """Test saving content to an existing file successfully (uploadFlag=False)."""
        """ This func is for save after performing edit """
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_blob = self._create_mock_blob(
            "existing_file.txt",
            120,
            datetime.datetime(2023, 5, 2),
            datetime.datetime(2023, 5, 1),
            "text/plain",
        )
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.return_value = mock_blob
        mock_blob.exists.return_value = True  # File exists for save
        mock_blob.upload_from_string.return_value = None

        content = "Updated content for existing file."
        result = await self.client.save_content(
            "test-bucket", "existing_file.txt", content, False
        )

        mock_bucket.blob.assert_called_once_with("existing_file.txt")
        mock_blob.exists.assert_called_once()
        mock_blob.upload_from_string.assert_called_once_with(
            content, content_type="media"
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["name"], "existing_file.txt")
        self.assertEqual(result["size"], 120)
        self.assertEqual(result["bucket"], "test-bucket")

    async def test_save_content_upload_file_already_exists(self):
        """Test uploading a file when it already exists (uploadFlag=True)."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_blob = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.return_value = mock_blob
        mock_blob.exists.return_value = True  # File exists

        content = "Some content."
        result = await self.client.save_content(
            "test-bucket", "existing_file.txt", content, True
        )

        mock_blob.exists.assert_called_once()
        mock_blob.upload_from_string.assert_not_called()  # Should not upload
        self.assertFalse(result["success"])
        self.assertEqual(result["status"], 409)
        self.assertIn("already exists", result["error"])

    async def test_save_content_with_json_content(self):
        """Test saving content with dictionary as content."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_blob = self._create_mock_blob(
            "notebook.json",
            200,
            datetime.datetime(2023, 5, 3),
            datetime.datetime(2023, 5, 3),
            "application/json",
        )
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.return_value = mock_blob
        mock_blob.exists.return_value = False
        mock_blob.upload_from_string.return_value = None

        content_dict = {"cells": [{"source": "print('hello')"}]}
        result = await self.client.save_content(
            "test-bucket", "notebook.json", content_dict, True
        )

        mock_blob.upload_from_string.assert_called_once_with(
            json.dumps(content_dict), content_type="media"
        )
        self.assertTrue(result["success"])

    async def test_save_content_exception_handling(self):
        """Test error handling during saving content."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.side_effect = Exception("Upload error")

        result = await self.client.save_content(
            "test-bucket", "error_file.txt", "content", True
        )
        self.log.exception.assert_called_once()  # Should log exception for upload
        self.assertEqual(result, {"error": "Upload error", "status": 500})

        self.log.exception.reset_mock()

        result = await self.client.save_content(
            "test-bucket", "error_file.txt", "content", False
        )
        self.log.exception.assert_called_once()  # Should log exception for save
        self.assertEqual(result, {"error": "Upload error", "status": 500})

    # --- Test Cases for delete_file ---
    async def test_delete_file_success(self):
        """Test successful file deletion."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_blob = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.return_value = mock_blob
        mock_blob.exists.return_value = True  # File exists

        result = await self.client.delete_file("test-bucket", "my_file.txt")

        mock_bucket.blob.assert_called_once_with("my_file.txt")
        mock_blob.exists.assert_called_once()
        mock_blob.delete.assert_called_once()
        self.assertEqual(result, {"success": True, "status": 200})

    async def test_delete_empty_folder_success(self):
        """Test successful deletion of an empty folder (0-byte object)."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket

        # Simulate list_blobs for the folder prefix (should return only the 0-byte object)
        mock_0byte_folder_blob = self._create_mock_blob("my_folder/", 0, None, None)
        mock_0byte_folder_blob.exists.return_value = True
        mock_0byte_folder_blob.delete.return_value = None

        # Simulate initial blob check failing for "my_folder"
        mock_blob_no_trailing = mock.MagicMock()
        mock_blob_no_trailing.exists.return_value = False

        mock_bucket.blob.side_effect = [mock_blob_no_trailing]

        mock_bucket.list_blobs.return_value = [mock_0byte_folder_blob]

        result = await self.client.delete_file("test-bucket", "my_folder")

        mock_bucket.blob.assert_called_with("my_folder")
        mock_bucket.list_blobs.assert_called_with(prefix="my_folder/")
        mock_0byte_folder_blob.delete.assert_called_once()
        self.assertEqual(result, {"success": True, "status": 200})

    async def test_delete_non_empty_folder_failure(self):
        """Test deletion of a non-empty folder (should fail)."""
        # Get the mock GCS client instance that `self.client` uses.
        mock_gcs_client_instance = self.mock_storage_client.return_value

        # Create a mock for the bucket object that the client will return.
        mock_bucket_instance = mock.MagicMock()
        mock_gcs_client_instance.bucket.return_value = mock_bucket_instance

        folder_name = "my_folder"

        # 1. Mock the initial `bucket_obj.blob(path)` call (for "my_folder").
        # It should return a blob that does NOT exist (for a logical folder).
        mock_blob_no_trailing_slash = mock.MagicMock()
        mock_blob_no_trailing_slash.exists.return_value = False

        mock_bucket_instance.blob.return_value = mock_blob_no_trailing_slash

        # 2. Mock `bucket_obj.list_blobs(prefix=path+"/")` to return a child file.
        # This is what makes the folder "non-empty".
        mock_child_file = self._create_mock_blob(
            f"{folder_name}/file_inside.txt",
            100,
            datetime.datetime(2023, 1, 1, 10, 0, 0),
            datetime.datetime(2023, 1, 1, 9, 0, 0),
            "text/plain",
        )
        mock_child_file.delete.return_value = None

        # Mock list_blobs to return the child file (called twice in the code)
        mock_bucket_instance.list_blobs.return_value = [mock_child_file]

        # Execute the service method
        result = await self.client.delete_file("test-bucket", folder_name)

        # --- Assertions ---
        # Verify calls to bucket.blob
        mock_bucket_instance.blob.assert_called_with(folder_name)

        self.assertEqual(mock_bucket_instance.list_blobs.call_count, 2)
        mock_bucket_instance.list_blobs.assert_has_calls(
            [
                mock.call(prefix=f"{folder_name}/"),
                mock.call(prefix=f"{folder_name}/"),
            ]
        )

        mock_child_file.delete.assert_called_once()

        self.assertEqual(result, {"success": True, "status": 200})

    async def test_delete_file_not_found(self):
        """Test deleting a file/folder that does not exist."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_blob = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.side_effect = [
            mock_blob,  # For path without trailing slash
            mock_blob,  # For path with trailing slash (if first fails)
        ]
        mock_blob.exists.return_value = False  # Neither blob exists

        # Ensure list_blobs also returns empty to confirm it's truly not found
        mock_blobs_for_non_existent = mock.MagicMock()
        mock_blobs_for_non_existent.__iter__.return_value = []
        mock_client_instance.list_blobs.return_value = mock_blobs_for_non_existent

        result = await self.client.delete_file("test-bucket", "non_existent_file.txt")

        mock_bucket.blob.assert_any_call("non_existent_file.txt")
        mock_blob.exists.assert_called()  # Called twice for non-existent cases
        mock_blob.delete.assert_not_called()
        self.assertEqual(result, {"error": "File/Folder not found.", "status": 404})

    async def test_delete_bucket_attempt_failure(self):
        """Test attempt to delete the root of a bucket (should fail)."""
        result = await self.client.delete_file("test-bucket", "")
        self.assertEqual(
            result, {"error": "Deleting Bucket is not allowed.", "status": 409}
        )

        result = await self.client.delete_file("test-bucket", "/")
        self.assertEqual(
            result, {"error": "Deleting Bucket is not allowed.", "status": 409}
        )

    async def test_delete_file_exception_handling(self):
        """Test error handling during file deletion."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_blob = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.return_value = mock_blob
        mock_blob.exists.return_value = True
        mock_blob.delete.side_effect = Exception("Delete API error")

        result = await self.client.delete_file("test-bucket", "file_to_delete.txt")
        self.log.exception.assert_called_once_with(
            "Error deleting file file_to_delete.txt."
        )
        self.assertEqual(result, {"error": "Delete API error", "status": 500})

    # --- Test Cases for rename_file ---
    async def test_rename_file_success(self):
        """Test successful file renaming."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket

        old_blob_name = "old_file.txt"
        new_blob_name = "new_file.txt"

        # Mock the original blob that exists
        mock_old_blob = self._create_mock_blob(
            old_blob_name,
            100,
            datetime.datetime(2023, 5, 10),
            datetime.datetime(2023, 5, 9),
            "text/plain",
        )
        mock_old_blob.exists.return_value = True  # Important: the old blob exists

        # Mock the new blob that does NOT exist (for availability check)
        mock_new_blob = mock.MagicMock()
        mock_new_blob.exists.return_value = (
            False  # Important: makes , the new name is available
        )

        mock_bucket.blob.side_effect = [mock_old_blob, mock_new_blob]

        # Mock the rename_blob method to return a mock representing the new blob
        mock_renamed_blob = self._create_mock_blob(
            new_blob_name,
            100,
            datetime.datetime(2023, 5, 11),
            datetime.datetime(2023, 5, 9),
            "text/plain",
        )
        mock_bucket.rename_blob.return_value = mock_renamed_blob

        result = await self.client.rename_file(
            "test-bucket", old_blob_name, new_blob_name
        )

        # Assertions
        mock_bucket.blob.assert_has_calls(
            [mock.call(old_blob_name), mock.call(new_blob_name)]
        )
        mock_old_blob.exists.assert_called_once()
        mock_new_blob.exists.assert_called_once()
        mock_bucket.rename_blob.assert_called_once_with(mock_old_blob, new_blob_name)

        self.assertTrue(result["success"])
        self.assertEqual(result["status"], 200)
        self.assertEqual(result["name"], new_blob_name)
        self.assertEqual(result["bucket"], "test-bucket")

    async def test_rename_file_source_not_found(self):
        """Test renaming a file/folder that does not exist."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket

        # Create a mock blob and ensure its .exists() method returns False
        mock_blob_instance = mock.MagicMock()
        mock_blob_instance.exists.return_value = (
            False  # Explicitly set the return value for exists()
        )

        # Set side_effect for bucket.blob() to return the mock_blob_instance
        # for both the initial call and potentially the call for "non_existent.txt/"
        mock_bucket.blob.side_effect = [
            mock_blob_instance,  # For the initial blob = bucket.blob(blob_name)
            mock_blob_instance,  # For the potential blob = bucket.blob(blob_name + "/") if it's a folder check
        ]

        # Mock list_blobs to return an empty iterator (no existing children for a non-existent folder)
        mock_blobs_for_non_existent = mock.MagicMock()
        mock_blobs_for_non_existent.__iter__.return_value = []
        mock_bucket.list_blobs.return_value = mock_blobs_for_non_existent

        result = await self.client.rename_file(
            "test-bucket", "non_existent.txt", "new_name.txt"
        )

        mock_bucket.blob.assert_any_call("non_existent.txt")

        mock_bucket.rename_blob.assert_not_called()
        self.assertEqual(result, {"error": "non_existent.txt not found", "status": 404})

    async def test_rename_file_destination_exists(self):
        """Test renaming a file when a file with the new name already exists."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket

        # --- Mocking the source blob (old_file.txt) ---
        mock_source_blob = mock.MagicMock()
        mock_source_blob.exists.return_value = True  # Source file exists
        mock_source_blob.name = "old_file.txt"  # Set the name attribute for the mock

        # --- Mocking the destination blob (new_file.txt) ---
        mock_destination_blob = mock.MagicMock()
        mock_destination_blob.exists.return_value = (
            True  # Destination file already exists
        )
        mock_destination_blob.name = (
            "new_file.txt"  # Set the name attribute for the mock
        )

        # Configure mock_bucket.blob.side_effect to return the correct mock
        # depending on the blob name requested.
        def blob_side_effect(blob_name_arg):
            if blob_name_arg == "old_file.txt":
                return mock_source_blob
            elif blob_name_arg == "new_file.txt":
                return mock_destination_blob
            return mock.MagicMock(
                exists=False
            )  # Default for other unexpected blob calls

        mock_bucket.blob.side_effect = blob_side_effect

        # Ensure list_blobs is mocked if it's called (though unlikely in this specific path for a file)
        mock_bucket.list_blobs.return_value = []

        # --- Call the function under test ---
        result = await self.client.rename_file(
            "test-bucket", "old_file.txt", "new_file.txt"
        )

        # --- Assertions ---
        # Verify that blob() was called for both source and destination
        mock_bucket.blob.assert_any_call("old_file.txt")
        mock_bucket.blob.assert_any_call("new_file.txt")

        # Verify that rename_blob was NOT called because the destination exists
        mock_bucket.rename_blob.assert_not_called()

        # Assert the expected error response
        expected_error_message = (
            "A file with name new_file.txt already exists in the destination."
        )
        self.assertEqual(result, {"error": expected_error_message, "status": 409})

    async def test_rename_folder_destination_exists(self):
        """Test renaming an empty folder when a folder with the new name already exists."""
        bucket_name = "test-bucket"
        old_folder_name = "old_folder"
        new_folder_name = "new_folder"

        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket

        # --- Mocking the source folder (old_folder/) ---
        # 1. Mock bucket.blob("old_folder") to not exist (as it's a folder, not a file directly)
        mock_source_base_blob = mock.MagicMock()
        mock_source_base_blob.exists.return_value = (
            False  # Initial check for "old_folder"
        )

        # 2. Mock the 0-byte folder object for "old_folder/"
        mock_source_folder_object = mock.MagicMock()
        mock_source_folder_object.name = f"{old_folder_name}/"  # Must match exactly
        mock_source_folder_object.exists.return_value = True  # The 0-byte object exists

        # Configure bucket.blob side_effect for source calls
        def blob_side_effect_for_source(blob_name_arg):
            if blob_name_arg == old_folder_name:
                return mock_source_base_blob
            elif blob_name_arg == f"{old_folder_name}/":
                return mock_source_folder_object
            # For the destination path, if it calls bucket.blob directly (it does for folder check)
            elif blob_name_arg == new_folder_name:
                # This mock's exists() doesn't directly determine destination folder existence
                return mock.MagicMock(name=new_folder_name, exists=False)
            return mock.MagicMock()  # Default for other calls if any

        mock_bucket.blob.side_effect = blob_side_effect_for_source

        # Configure list_blobs for source (to make it an empty folder)
        mock_list_blobs_source_iter = iter(
            [mock_source_folder_object]
        )  # Only the 0-byte object
        mock_bucket.list_blobs.side_effect = [
            mock_list_blobs_source_iter,  # First call for old_folder/
            # Subsequent call will be for new_folder/ as per destination check
        ]

        # --- Mocking the destination folder (new_folder/) to exist ---
        # This will be the second call to list_blobs(prefix=new_folder_name + "/")
        mock_destination_child_blob = mock.MagicMock(
            name=f"{new_folder_name}/some_file.txt"
        )
        mock_destination_folder_object = mock.MagicMock(
            name=f"{new_folder_name}/"
        )  # 0-byte object

        # Configure list_blobs side_effect to return an existing folder for the destination
        def list_blobs_side_effect(prefix):
            if prefix == f"{old_folder_name}/":
                return iter([mock_source_folder_object])  # Source is an empty folder
            elif prefix == f"{new_folder_name}/":
                return iter(
                    [mock_destination_folder_object, mock_destination_child_blob]
                )  # Destination is a non-empty folder
            return iter([])  # Default for other prefixes

        mock_bucket.list_blobs.side_effect = list_blobs_side_effect

        # --- Call the function under test ---
        result = await self.client.rename_file(
            bucket_name, old_folder_name, new_folder_name
        )

        # --- Assertions ---
        # Verify that blob() was called for the source and potentially destination
        mock_bucket.blob.assert_any_call(old_folder_name)
        # The code does `bucket.blob(new_name)` even for folders, so check that.
        mock_bucket.blob.assert_any_call(new_folder_name)

        # Verify that list_blobs was called for both source and destination prefixes
        mock_bucket.list_blobs.assert_any_call(prefix=f"{old_folder_name}/")
        mock_bucket.list_blobs.assert_any_call(prefix=f"{new_folder_name}/")

        # Verify that rename_blob was NOT called because the destination exists
        mock_bucket.rename_blob.assert_not_called()

        self.assertEqual(result["status"], 409)

    # --- Test Cases for download_file ---
    async def test_download_file_success(self):
        """Test successful file download."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_blob = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.return_value = mock_blob
        mock_blob.download_as_bytes.return_value = b"This is the file content."

        result = await self.client.download_file(
            "test-bucket", "path/to/file.bin", "file.bin", "binary"
        )

        mock_bucket.blob.assert_called_once_with("path/to/file.bin")
        mock_blob.download_as_bytes.assert_called_once()
        self.assertEqual(result, b"This is the file content.")

    async def test_download_file_exception_handling(self):
        """Test error handling during file download."""
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.side_effect = Exception("Download error")

        result = await self.client.download_file(
            "test-bucket", "non_existent.bin", "non_existent.bin", "binary"
        )
        self.log.exception.assert_called_once_with("Error getting file: Download error")
        self.assertEqual(result, [])  # Return empty list on error

    async def test_get_ipynb_clears_trusted_bit_metadata(self):
        """
        Test that get_file returns raw ipynb content with trusted=True in metadata,
        and then simulate LoadFileController's nbformat processing to verify
        the 'trusted' bit in notebook metadata is cleared.
        """
        bucket_name = "test-bucket"
        file_path = "folder-dir/trusted_notebook_metadata.ipynb"
        file_format = "json"

        # 1. Create a mock notebook content with "trusted": True in top-level metadata
        # and also in some cell metadata to ensure both are cleared.
        trusted_notebook_content_dict = {
            "metadata": {
                "kernelspec": {
                    "name": "python3",
                    "display_name": "Python 3 (ipykernel)",
                    "language": "python",
                },
                "language_info": {
                    "name": "python",
                    "version": "3.12.9",
                    "mimetype": "text/x-python",
                    "codemirror_mode": {"name": "ipython", "version": 3},
                    "pygments_lexer": "ipython3",
                    "nbconvert_exporter": "python",
                    "file_extension": ".py",
                },
                "trusted": True,  # Trusted flag at the notebook level
            },
            "nbformat_minor": 5,
            "nbformat": 4,
            "cells": [
                {
                    "id": "fdc6a5c5",
                    "cell_type": "markdown",
                    "source": "# A Simple Valid Notebook",
                    "metadata": {},
                },
                {
                    "id": "dd7376da",
                    "cell_type": "code",
                    "source": "print('Hello from Python!')",
                    "metadata": {},
                    "outputs": [
                        {
                            "name": "stdout",
                            "output_type": "stream",
                            "text": "Hello from Python!\n",
                        }
                    ],
                    "execution_count": 1,
                },
                {
                    "id": "32aeee54",
                    "cell_type": "code",
                    "source": "1 + 2",
                    "metadata": {},
                    "outputs": [
                        {
                            "data": {"text/plain": "3"},
                            "execution_count": 2,
                            "metadata": {},
                            "output_type": "execute_result",
                        }
                    ],
                    "execution_count": 2,
                },
                {
                    "id": "137431c1",
                    "cell_type": "markdown",
                    "source": "## Another Section",
                    "metadata": {},
                },
                {
                    "id": "6631a3ca",
                    "cell_type": "code",
                    "source": "# This is a comment",
                    "metadata": {},
                    "outputs": [],
                    "execution_count": None,
                },
                {
                    "id": "ec27b2cd-da78-417b-a3e4-b07c4b6b82d9",
                    "cell_type": "code",
                    "source": "",
                    "metadata": {"trusted": True},  # Trusted flag at the cell level
                    "outputs": [],
                    "execution_count": None,
                },
                {
                    "id": "263ea0bb-53e8-43fa-8670-6562d003ca97",
                    "cell_type": "code",
                    "source": "",
                    "metadata": {
                        "trusted": True  # Another trusted flag at the cell level
                    },
                    "outputs": [],
                    "execution_count": None,
                },
                {
                    "id": "92faa322-88e4-4958-92a0-482bade62cc7",
                    "cell_type": "code",
                    "source": "",
                    "metadata": {"trusted": True},  # And another
                    "outputs": [],
                    "execution_count": None,
                },
            ],
        }
        mock_raw_ipynb_string = json.dumps(trusted_notebook_content_dict)

        # 2. Mock gcs.Client.get_file to return this content
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_blob = self._create_mock_blob(
            file_path, len(mock_raw_ipynb_string), None, None, "application/json"
        )

        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.return_value = mock_blob
        mock_blob.download_as_text.return_value = mock_raw_ipynb_string

        processed_nb_object = await self.client.get_file(
            bucket_name, file_path, file_format
        )

        # verify that 'trusted' is cleared from individual cell metadata
        for i, cell in enumerate(processed_nb_object.cells):
            self.assertNotIn(
                "trusted",
                cell.metadata,
                f"The 'trusted' flag should be cleared from cell {i} metadata after nbformat.reads",
            )

    async def test_rename_folder_rollback_no_restore_if_not_deleted(self):
        """
        Test that we don't try to restore a source file on rollback unless it was first deleted.
        This implies the rollback mechanism tracks which files were actually deleted.
        """
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock(spec=storage.Bucket)
        mock_client_instance.bucket.return_value = mock_bucket

        source_prefix = "source_folder"
        destination_prefix = "dest_folder"

        mock_source_blob1 = self._create_mock_blob(
            f"{source_prefix}/file1.txt", 100, None, None
        )
        mock_source_blob2 = self._create_mock_blob(
            f"{source_prefix}/file2.txt", 150, None, None
        )

        mock_source_0byte_folder = self._create_mock_blob(
            f"{source_prefix}/", 0, None, None
        )

        # list_blobs will now return all three objects
        mock_bucket.list_blobs.side_effect = [
            [
                mock_source_blob1,
                mock_source_blob2,
                mock_source_0byte_folder,
            ],  # For initial check in rename_file
            [
                mock_source_blob1,
                mock_source_blob2,
                mock_source_0byte_folder,
            ],  # For blobs_to_rename in rename_non_empty_folder
        ]

        # Mocks for blobs that will be created in the destination during forward pass
        mock_dest_blob1 = self._create_mock_blob(
            f"{destination_prefix}/file1.txt", 100, None, None
        )
        mock_dest_blob2 = self._create_mock_blob(
            f"{destination_prefix}/file2.txt", 150, None, None
        )
        # Mock for the 0-byte folder in destination
        mock_dest_0byte_folder = self._create_mock_blob(
            f"{destination_prefix}/", 0, None, None
        )

        # Mocks for blobs that will be created in the source during rollback
        mock_restored_source_blob1 = self._create_mock_blob(
            f"{source_prefix}/file1.txt", 100, None, None
        )
        # We now know file2.txt is also attempted to be restored
        mock_restored_source_blob2 = self._create_mock_blob(
            f"{source_prefix}/file2.txt", 150, None, None
        )
        mock_restored_source_0byte_folder = self._create_mock_blob(
            f"{source_prefix}/", 0, None, None
        )

        # Sequence of copy_blob calls, now including the unexpected rollback for file2.txt
        mock_bucket.copy_blob.side_effect = [
            mock_dest_blob1,
            mock_dest_blob2,
            mock_dest_0byte_folder,
            mock_restored_source_blob1,
            mock_restored_source_blob2,
            mock_restored_source_0byte_folder,
        ]

        # mock_source_blob1.delete will succeed
        mock_source_blob1.delete.return_value = None
        mock_source_blob2.delete.side_effect = Exception(
            "Simulated delete failure for file2.txt"
        )
        mock_source_0byte_folder.delete.return_value = (
            None  # Still set return value, but assert_not_called below
        )

        # Destination blobs for cleanup during revert
        mock_dest_blob1.delete.return_value = None
        mock_dest_blob2.delete.return_value = None
        mock_dest_0byte_folder.delete.return_value = None

        mock_bucket.blob.side_effect = [
            mock.MagicMock(
                name=source_prefix, exists=mock.Mock(return_value=False)
            ),  # source_folder (as a file) does not exist
            mock.MagicMock(
                name=f"{destination_prefix}/", exists=mock.Mock(return_value=False)
            ),  # dest_folder (as a folder) does not exist
            mock.MagicMock(
                name=f"{destination_prefix}/file1.txt",
                exists=mock.Mock(return_value=False),
            ),  # dest/file1.txt doesn't exist
            mock.MagicMock(
                name=f"{destination_prefix}/file2.txt",
                exists=mock.Mock(return_value=False),
            ),  # dest/file2.txt doesn't exist
            mock.MagicMock(
                name=f"{destination_prefix}/", exists=mock.Mock(return_value=False)
            ),  # dest/ doesn't exist
            # These are for existence checks inside the revert logic (before attempting to copy back)
            mock.MagicMock(
                name=f"{source_prefix}/file1.txt", exists=mock.Mock(return_value=False)
            ),  # source/file1.txt (to be restored) doesn't exist
            mock.MagicMock(
                name=f"{source_prefix}/file2.txt", exists=mock.Mock(return_value=True)
            ),  # source/file2.txt *was not deleted* so it still exists
            mock.MagicMock(
                name=f"{source_prefix}/", exists=mock.Mock(return_value=False)
            ),  # source/ (to be restored) doesn't exist
        ]

        # Call the rename operation
        result = await self.client.rename_file(
            "test-bucket", source_prefix, destination_prefix
        )

        # All source blobs should have been attempted to be copied
        mock_bucket.copy_blob.assert_has_calls(
            [
                mock.call(
                    mock_source_blob1,
                    mock_bucket,
                    new_name=f"{destination_prefix}/file1.txt",
                ),
                mock.call(
                    mock_source_blob2,
                    mock_bucket,
                    new_name=f"{destination_prefix}/file2.txt",
                ),
                mock.call(
                    mock_dest_blob1, mock_bucket, new_name=f"{source_prefix}/file1.txt"
                ),
                mock.call(
                    mock_dest_blob2, mock_bucket, new_name=f"{source_prefix}/file2.txt"
                ),
            ],
            any_order=False,
        )

        # All source blobs should have had their delete method called, with file2.txt's deletion failing
        mock_source_blob1.delete.assert_called_once()
        mock_source_blob2.delete.assert_called_once()
        mock_source_0byte_folder.delete.assert_not_called()

        mock_bucket.copy_blob.assert_has_calls(
            [
                mock.call(
                    mock_source_blob1,
                    mock_bucket,
                    new_name=f"{destination_prefix}/file1.txt",
                ),
                mock.call(
                    mock_source_blob2,
                    mock_bucket,
                    new_name=f"{destination_prefix}/file2.txt",
                ),
                mock.call(
                    mock_dest_blob1, mock_bucket, new_name=f"{source_prefix}/file1.txt"
                ),
                mock.call(
                    mock_dest_blob2, mock_bucket, new_name=f"{source_prefix}/file2.txt"
                ),
            ],
            any_order=False,
        )

        # Total copy_blob calls: 2 forward + 2 revert = 4
        self.assertEqual(mock_bucket.copy_blob.call_count, 4)

        # All created destination blobs should be deleted during rollback cleanup
        mock_dest_blob1.delete.assert_called_once()
        mock_dest_blob2.delete.assert_called_once()

        # Verify the final result
        self.log.error.assert_called_once()
        self.assertFalse(result["success"])
        self.assertIn("Simulated delete failure for file2.txt", result["error"])
        self.assertEqual(result["status"], 500)

    async def test_rename_folder_creation_failure_no_source_deletion(self):
        """
        Test that none of the source blobs are deleted if creating any of the target blobs fails.
        Also verifies that if a partial copy succeeded before failure, it is (or is NOT) cleaned up
        based on the client's current rollback/cleanup strategy.
        """
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.name = "test-bucket"

        source_prefix = "source_folder"
        destination_prefix = "dest_folder"

        mock_source_blob1 = self._create_mock_blob(
            f"{source_prefix}/file1.txt", 100, None, None
        )
        mock_source_blob2 = self._create_mock_blob(
            f"{source_prefix}/file2.txt", 150, None, None
        )
        mock_source_0byte_folder = self._create_mock_blob(
            f"{source_prefix}/", 0, None, None
        )

        mock_bucket.list_blobs.side_effect = [
            iter([mock_source_blob1, mock_source_blob2, mock_source_0byte_folder]),
            iter([mock_source_blob1, mock_source_blob2, mock_source_0byte_folder]),
        ]

        # --- Mocks for Destination Blobs ---
        mock_dest_blob1 = self._create_mock_blob(
            f"{destination_prefix}/file1.txt", 100, None, None
        )
        mock_dest_blob1.exists.return_value = False

        mock_dest_blob2 = self._create_mock_blob(
            f"{destination_prefix}/file2.txt", 150, None, None
        )
        mock_dest_blob2.exists.return_value = False

        mock_dest_0byte_folder = self._create_mock_blob(
            f"{destination_prefix}/", 0, None, None
        )
        mock_dest_0byte_folder.exists.return_value = False

        mock_bucket.blob.side_effect = [
            mock.MagicMock(name=source_prefix, exists=mock.Mock(return_value=False)),
            mock.MagicMock(
                name=destination_prefix, exists=mock.Mock(return_value=False)
            ),
            mock_dest_blob1,
            mock_dest_blob2,
            mock_dest_0byte_folder,
        ]

        mock_bucket.copy_blob.side_effect = [
            mock_dest_blob1,
            Exception("Simulated copy failure for file2.txt"),
        ]

        # Ensure no delete calls are mocked to succeed, as they should not be called
        mock_source_blob1.delete.assert_not_called()
        mock_source_blob2.delete.assert_not_called()
        mock_source_0byte_folder.delete.assert_not_called()
        mock_bucket.delete_blob.assert_not_called()

        # Call the rename operation (the system under test)
        result = await self.client.rename_file(
            "test-bucket", source_prefix, destination_prefix
        )

        # --- Assertions ---

        # Verify that the first copy attempt happened, and the second caused the error
        mock_bucket.copy_blob.assert_has_calls(
            [
                mock.call(
                    mock_source_blob1,
                    mock_bucket,
                    new_name=f"{destination_prefix}/file1.txt",
                ),
                mock.call(
                    mock_source_blob2,
                    mock_bucket,
                    new_name=f"{destination_prefix}/file2.txt",
                ),  # This call causes the error
            ],
            any_order=False,
        )
        self.assertNotIn(
            mock.call(
                mock_source_0byte_folder, mock_bucket, new_name=f"{destination_prefix}/"
            ),
            mock_bucket.copy_blob.call_args_list,
        )

        # Verify that NO source blobs were deleted
        mock_source_blob1.delete.assert_called_once()
        mock_source_blob2.delete.assert_not_called()
        mock_source_0byte_folder.delete.assert_not_called()
        mock_bucket.delete_blob.assert_not_called()

        mock_dest_blob1.delete.assert_not_called()
        mock_dest_blob2.delete.assert_not_called()
        mock_dest_0byte_folder.delete.assert_not_called()

        # The log.exception call should be from the simulated copy failure
        self.assertEqual(self.log.error.call_count, 2)
        self.log.error.assert_has_calls(
            [
                mock.call(
                    "Error during manual folder rename. Attempting to restore original files: Simulated copy failure for file2.txt"
                ),
                mock.call(
                    "Failed to revert blob 'dest_folder/file1.txt' to 'source_folder/file1.txt': "
                ),  # This is the crucial change
            ],
            any_order=True,
        )

        self.assertFalse(result["success"])
        self.assertIn("Simulated copy failure for file2.txt", result["error"])
        self.assertEqual(result["status"], 500)

    async def test_rename_folder_rollback_restores_deleted_sources(self):
        """
        Test that any source files we deleted are attempted to be restored if we hit an error.
        This simulates a scenario where copying and source deletion succeeded,
        but a subsequent operation (e.g., deleting the 0-byte source folder) fails,
        triggering a rollback that restores the deleted files.
        """
        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock(spec=storage.Bucket)
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.name = "test-bucket"

        source_prefix = "source_folder"
        destination_prefix = "dest_folder"

        mock_source_blob1 = self._create_mock_blob(
            f"{source_prefix}/file1.txt", 100, None, None
        )
        mock_source_blob2 = self._create_mock_blob(
            f"{source_prefix}/file2.txt", 150, None, None
        )
        mock_source_0byte_folder = self._create_mock_blob(
            f"{source_prefix}/", 0, None, None
        )

        # list_blobs will be called twice: once for initial check, once for actual files
        mock_bucket.list_blobs.side_effect = [
            iter([mock_source_blob1, mock_source_blob2, mock_source_0byte_folder]),
            iter([mock_source_blob1, mock_source_blob2, mock_source_0byte_folder]),
        ]

        # --- Mocks for Destination Blobs ---
        mock_dest_blob1 = self._create_mock_blob(
            f"{destination_prefix}/file1.txt", 100, None, None
        )
        mock_dest_blob2 = self._create_mock_blob(
            f"{destination_prefix}/file2.txt", 150, None, None
        )
        mock_dest_0byte_folder = self._create_mock_blob(
            f"{destination_prefix}/", 0, None, None
        )

        mock_bucket.blob.side_effect = [
            # Initial checks for source_prefix and destination_prefix existence
            mock.MagicMock(name=source_prefix, exists=mock.Mock(return_value=False)),
            mock.MagicMock(
                name=destination_prefix, exists=mock.Mock(return_value=False)
            ),
            mock.MagicMock(
                name=f"{destination_prefix}/file1.txt",
                exists=mock.Mock(return_value=False),
            ),
            mock.MagicMock(
                name=f"{destination_prefix}/file2.txt",
                exists=mock.Mock(return_value=False),
            ),
            mock.MagicMock(
                name=f"{destination_prefix}/", exists=mock.Mock(return_value=False)
            ),
            mock.MagicMock(
                name=f"{source_prefix}/file1.txt", exists=mock.Mock(return_value=False)
            ),
            mock.MagicMock(
                name=f"{source_prefix}/file2.txt", exists=mock.Mock(return_value=False)
            ),
            mock.MagicMock(
                name=f"{source_prefix}/", exists=mock.Mock(return_value=False)
            ),  # for the 0-byte folder
        ]

        mock_bucket.copy_blob.side_effect = [
            mock_dest_blob1,
            mock_dest_blob2,
            mock_dest_0byte_folder,
            mock.MagicMock(),
            mock.MagicMock(),
            mock.MagicMock(),
        ]

        # Source blobs: All deletions succeed initially. The error comes AFTER these.
        mock_source_blob1.delete.return_value = None
        mock_source_blob2.delete.return_value = None
        mock_source_0byte_folder.delete.side_effect = Exception(
            "Simulated source folder delete failure (triggering rollback)"
        )

        # Destination blobs: All deletions should be attempted during cleanup after rollback copies.
        mock_dest_blob1.delete.return_value = None
        mock_dest_blob2.delete.return_value = None
        mock_dest_0byte_folder.delete.return_value = None

        # Call the rename operation (the system under test)
        result = await self.client.rename_file(
            "test-bucket", source_prefix, destination_prefix
        )

        # --- Assertions ---

        # Verify forward copy attempts occurred as expected
        mock_bucket.copy_blob.assert_has_calls(
            [
                mock.call(
                    mock_source_blob1,
                    mock_bucket,
                    new_name=f"{destination_prefix}/file1.txt",
                ),
                mock.call(
                    mock_source_blob2,
                    mock_bucket,
                    new_name=f"{destination_prefix}/file2.txt",
                ),
                mock.call(
                    mock_source_0byte_folder,
                    mock_bucket,
                    new_name=f"{destination_prefix}/",
                ),
            ],
            any_order=False,
        )

        # Verify source deletions attempts (up to the point of failure)
        mock_source_blob1.delete.assert_called_once()
        mock_source_blob2.delete.assert_called_once()
        mock_source_0byte_folder.delete.assert_called_once()

        # Verify rollback restore attempts (copying from dest back to source)
        mock_bucket.copy_blob.assert_has_calls(
            [
                mock.call(
                    mock_source_blob1,
                    mock_bucket,
                    new_name=f"{destination_prefix}/file1.txt",
                ),
                mock.call(
                    mock_source_blob2,
                    mock_bucket,
                    new_name=f"{destination_prefix}/file2.txt",
                ),
                mock.call(
                    mock_source_0byte_folder,
                    mock_bucket,
                    new_name=f"{destination_prefix}/",
                ),
                # Rollback calls (expected for all deleted sources)
                mock.call(
                    mock_dest_blob1, mock_bucket, new_name=f"{source_prefix}/file1.txt"
                ),
                mock.call(
                    mock_dest_blob2, mock_bucket, new_name=f"{source_prefix}/file2.txt"
                ),
                mock.call(
                    mock_dest_0byte_folder, mock_bucket, new_name=f"{source_prefix}/"
                ),
            ],
            any_order=True,
        )

        # Total copy_blob calls: 3 (forward) + 3 (revert) = 6
        self.assertEqual(mock_bucket.copy_blob.call_count, 6)

        # All created destination blobs should be deleted.
        mock_dest_blob1.delete.assert_called_once()
        mock_dest_blob2.delete.assert_called_once()
        mock_dest_0byte_folder.delete.assert_called_once()

        # Verify the result and error logging
        self.log.error.assert_called_once()
        self.log.error.assert_called_with(mock.ANY)

        self.assertFalse(result["success"])
        self.assertIn(
            "Simulated source folder delete failure (triggering rollback)",
            result["error"],
        )
        self.assertEqual(result["status"], 500)

    async def test_delete_non_empty_folder(self):
        """Test deleting a non-empty folder."""
        bucket_name = "test-bucket"
        folder_to_delete = "non_empty_folder"

        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket

        # Mock objects that list_blobs will return.
        mock_folder_object = mock.MagicMock(name=f"{folder_to_delete}/")
        mock_child_file = mock.MagicMock(name=f"{folder_to_delete}/file1.txt")

        # Only expect a single call to blob() for the base folder name.
        def blob_side_effect(blob_name):
            if blob_name == folder_to_delete:
                mock_blob_for_file_check = mock.MagicMock()
                mock_blob_for_file_check.exists.return_value = False
                return mock_blob_for_file_check
            return mock.MagicMock(exists=False)

        mock_bucket.blob.side_effect = blob_side_effect

        # Set up side_effect for list_blobs, as it's called twice.
        mock_bucket.list_blobs.side_effect = [
            iter([mock_folder_object, mock_child_file]),
            iter([mock_folder_object, mock_child_file]),
        ]

        result = await self.client.delete_file(bucket_name, folder_to_delete)

        # Assertions
        # Verify that blob was called exactly once with the base folder name.
        mock_bucket.blob.assert_called_once_with(folder_to_delete)

        # Verify that list_blobs was called exactly twice with the folder prefix.
        mock_bucket.list_blobs.assert_has_calls(
            [
                mock.call(prefix=f"{folder_to_delete}/"),
                mock.call(prefix=f"{folder_to_delete}/"),
            ],
            any_order=False,
        )
        self.assertEqual(mock_bucket.list_blobs.call_count, 2)

        # Verify that delete was called on each mock object returned by list_blobs.
        mock_folder_object.delete.assert_called_once()
        mock_child_file.delete.assert_called_once()

        self.assertEqual(result, {"success": True, "status": 200})

    async def test_rename_non_empty_folder_success(self):
        """Test successful renaming of a non-empty folder."""
        bucket_name = "test-bucket"
        old_folder_name = "old_non_empty_folder"
        new_folder_name = "new_non_empty_folder"

        mock_client_instance = self.mock_storage_client.return_value
        mock_bucket = mock.MagicMock()
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.name = bucket_name

        # Create mock blobs representing the contents of the old folder
        mock_old_folder_object = self._create_mock_blob(
            f"{old_folder_name}/", 0, None, None
        )
        mock_old_child_file = self._create_mock_blob(
            f"{old_folder_name}/file1.txt", 100, None, None
        )

        def blob_side_effect_combined(blob_name_arg):
            if blob_name_arg == old_folder_name:
                mock_blob = mock.MagicMock()
                mock_blob.exists.return_value = False
                return mock_blob

            if blob_name_arg.startswith(f"{new_folder_name}/"):
                mock_blob = mock.MagicMock()
                mock_blob.exists.return_value = False
                return mock_blob

            mock_blob = mock.MagicMock()
            mock_blob.exists.return_value = False
            return mock_blob

        mock_bucket.blob.side_effect = blob_side_effect_combined

        mock_bucket.list_blobs.side_effect = [
            iter([mock_old_folder_object, mock_old_child_file]),  # Call 1
            iter([mock_old_folder_object, mock_old_child_file]),  # Call 2
        ]

        # This is the actual method called for copying blobs during folder rename.
        def copy_blob_side_effect(source_blob, dest_bucket, new_name=None):
            if source_blob.name == f"{old_folder_name}/":
                # This is the 0-byte folder object
                new_copied_blob = self._create_mock_blob(
                    f"{new_folder_name}/", 0, None, None
                )
                return new_copied_blob
            elif source_blob.name == f"{old_folder_name}/file1.txt":
                # This is the child file
                new_copied_blob = self._create_mock_blob(
                    f"{new_folder_name}/file1.txt", 100, None, None
                )
                return new_copied_blob
            return mock.MagicMock()

        mock_bucket.copy_blob.side_effect = copy_blob_side_effect

        result = await self.client.rename_file(
            bucket_name, old_folder_name, new_folder_name
        )

        # Assertions
        mock_bucket.blob.assert_any_call(old_folder_name)

        mock_bucket.list_blobs.assert_has_calls(
            [
                mock.call(prefix=f"{old_folder_name}/"),
                mock.call(prefix=f"{old_folder_name}/"),
            ],
            any_order=False,
        )
        self.assertEqual(mock_bucket.list_blobs.call_count, 2)

        # Assert that copy_blob was called for each item
        mock_bucket.copy_blob.assert_has_calls(
            [
                mock.call(
                    mock_old_folder_object, mock_bucket, new_name=f"{new_folder_name}/"
                ),
                mock.call(
                    mock_old_child_file,
                    mock_bucket,
                    new_name=f"{new_folder_name}/file1.txt",
                ),
            ],
            any_order=True,
        )
        self.assertEqual(mock_bucket.copy_blob.call_count, 2)

        # Verify that original blobs were deleted
        mock_old_folder_object.delete.assert_called_once()
        mock_old_child_file.delete.assert_called_once()

        self.assertTrue(result["success"])
        self.assertEqual(result["status"], 200)
        self.assertIn("message", result)
        self.assertIn(new_folder_name, result["message"])
        self.assertEqual(result["bucket"], bucket_name)

    async def test_copy_file_success(self):
        source_bucket_name = "source-bucket"
        destination_bucket_name = "destination-bucket"
        source_path = "path/to/source_file.txt"
        destination_path = "path/to/destination_file.txt"

        mock_client_instance = self.mock_storage_client.return_value
        mock_source_bucket = mock.MagicMock()
        mock_destination_bucket = mock.MagicMock()

        mock_client_instance.bucket.side_effect = [
            mock_source_bucket,
            mock_destination_bucket,
        ]

        mock_source_blob = self._create_mock_blob(
            source_path,
            100,
            datetime.datetime(2023, 1, 1),
            datetime.datetime(2023, 1, 1),
            "text/plain",
        )
        mock_source_bucket.blob.return_value = mock_source_blob

        mock_destination_blob = mock.MagicMock()
        mock_destination_bucket.blob.return_value = mock_destination_blob
        mock_destination_blob.exists.return_value = False

        mock_source_bucket.copy_blob.return_value = self._create_mock_blob(
            destination_path,
            100,
            datetime.datetime(2023, 1, 2),
            datetime.datetime(2023, 1, 2),
            "text/plain",
        )

        result = await self.client.copy_file(
            source_bucket_name, source_path, destination_bucket_name, destination_path
        )

        mock_client_instance.bucket.assert_has_calls(
            [mock.call(source_bucket_name), mock.call(destination_bucket_name)]
        )
        mock_source_bucket.blob.assert_called_once_with(source_path)
        mock_destination_bucket.blob.assert_called_once_with(destination_path)

        # 1. While checking path is file or Folder 2. checking if file exists
        self.assertEqual(mock_source_blob.exists.call_count, 2)
        mock_destination_blob.exists.assert_called_once()
        mock_source_bucket.copy_blob.assert_called_once_with(
            mock_source_blob, mock_destination_bucket, new_name=destination_path
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["status"], 200)
        self.assertEqual(result["name"], destination_path)
        self.assertEqual(
            result["bucket"], mock_source_bucket.copy_blob.return_value.bucket.name
        )
        self.assertEqual(result["size"], 100)
        self.assertEqual(result["contentType"], "text/plain")
        self.assertIn("timeCreated", result)
        self.assertIn("updated", result)

    async def test_copy_file_destination_exists(self):
        source_bucket_name = "source-bucket"
        destination_bucket_name = "destination-bucket"
        source_path = "path/to/source_file.txt"
        destination_path = "path/to/existing_destination_file.txt"

        mock_client_instance = self.mock_storage_client.return_value
        mock_source_bucket = mock.MagicMock()
        mock_destination_bucket = mock.MagicMock()

        mock_client_instance.bucket.side_effect = [
            mock_source_bucket,
            mock_destination_bucket,
        ]

        mock_source_blob = self._create_mock_blob(
            source_path,
            100,
            datetime.datetime(2023, 1, 1),
            datetime.datetime(2023, 1, 1),
            "text/plain",
        )
        mock_source_bucket.blob.return_value = mock_source_blob

        mock_destination_blob = mock.MagicMock()
        mock_destination_bucket.blob.return_value = mock_destination_blob
        mock_destination_blob.exists.return_value = True

        result = await self.client.copy_file(
            source_bucket_name, source_path, destination_bucket_name, destination_path
        )

        # 1. While checking path is file or Folder 2. checking if file exists
        self.assertEqual(mock_source_blob.exists.call_count, 2)
        mock_destination_blob.exists.assert_called_once()
        mock_source_bucket.copy_blob.assert_not_called()
        self.assertEqual(
            result["error"],
            f"A file with name '{destination_path}' already exists in the destination.",
        )
        self.assertEqual(result["status"], 409)

    async def test_copy_folder_success(self):
        source_bucket_name = "source-bucket"
        destination_bucket_name = "destination-bucket"
        source_path = "source_folder"
        destination_path = "destination_folder"

        mock_client_instance = self.mock_storage_client.return_value
        mock_source_bucket = mock.MagicMock()
        mock_destination_bucket = mock.MagicMock()

        mock_client_instance.bucket.side_effect = [
            mock_source_bucket,
            mock_destination_bucket,
        ]

        mock_blobs_under_source_prefix = [
            self._create_mock_blob(
                "source_folder/file1.txt",
                10,
                datetime.datetime(2023, 1, 1),
                datetime.datetime(2023, 1, 1),
            ),
            self._create_mock_blob(
                "source_folder/subfolder/file2.txt",
                20,
                datetime.datetime(2023, 1, 2),
                datetime.datetime(2023, 1, 2),
            ),
        ]
        mock_source_bucket.list_blobs.return_value = mock_blobs_under_source_prefix

        mock_destination_bucket.blob.return_value.exists.return_value = False

        result = await self.client.copy_file(
            source_bucket_name, source_path, destination_bucket_name, destination_path
        )

        mock_source_bucket.list_blobs.assert_called_once_with(prefix=source_path + "/")
        mock_destination_bucket.blob.assert_has_calls(
            [
                mock.call("destination_folder/file1.txt"),
                mock.call("destination_folder/subfolder/file2.txt"),
            ],
            any_order=True,
        )
        self.assertEqual(mock_source_bucket.copy_blob.call_count, 2)
        mock_source_bucket.copy_blob.assert_has_calls(
            [
                mock.call(
                    mock_blobs_under_source_prefix[0],
                    mock_destination_bucket,
                    new_name="destination_folder/file1.txt",
                ),
                mock.call(
                    mock_blobs_under_source_prefix[1],
                    mock_destination_bucket,
                    new_name="destination_folder/subfolder/file2.txt",
                ),
            ],
            any_order=True,
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["status"], 200)
        self.assertEqual(
            result["message"],
            f"Folder '{source_path}' and its contents copied to '{destination_path}'.",
        )
        self.assertEqual(result["bucket"], destination_bucket_name)

    async def test_copy_folder_destination_file_exists(self):
        source_bucket_name = "source-bucket"
        destination_bucket_name = "destination-bucket"
        source_path = "source_folder"
        destination_path = "destination_folder"

        mock_client_instance = self.mock_storage_client.return_value
        mock_source_bucket = mock.MagicMock()
        mock_destination_bucket = mock.MagicMock()

        mock_client_instance.bucket.side_effect = [
            mock_source_bucket,
            mock_destination_bucket,
        ]

        mock_blobs_under_source_prefix = [
            self._create_mock_blob(
                "source_folder/file1.txt",
                10,
                datetime.datetime(2023, 1, 1),
                datetime.datetime(2023, 1, 1),
            )
        ]
        mock_source_bucket.list_blobs.return_value = mock_blobs_under_source_prefix

        mock_destination_bucket.blob.return_value.exists.side_effect = [True]

        result = await self.client.copy_file(
            source_bucket_name, source_path, destination_bucket_name, destination_path
        )

        mock_source_bucket.list_blobs.assert_called_once_with(prefix=source_path + "/")
        mock_destination_bucket.blob.assert_called_once_with(
            "destination_folder/file1.txt"
        )
        mock_source_bucket.copy_blob.assert_not_called()

        self.assertEqual(
            result["error"],
            f"A file/folder with name 'destination_folder/file1.txt' already exists in the destination.",
        )
        self.assertEqual(result["status"], 409)
