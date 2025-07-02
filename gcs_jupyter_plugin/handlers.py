import json
import subprocess

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
from traitlets import Unicode
from traitlets.config import SingletonConfigurable

import tornado

from google.cloud.jupyter_config.config import async_run_gcloud_subcommand

from gcs_jupyter_plugin import credentials
from gcs_jupyter_plugin.controllers.gcs import (
    ListBucketsController,
    ListFilesController,
    LoadFileController,
    CreateFolderController,
    SaveFileController,
    DeleteFileController,
    RenameFileController,
    DownloadFileController,
)


class GcsPluginConfig(SingletonConfigurable):
    log_path = Unicode(
        "",
        config=True,
        help="File to log ServerApp and Gcs Jupyter Plugin events.",
    )


class LoginHandler(APIHandler):
    @tornado.web.authenticated
    async def post(self):
        try:
            sub_cmd = "auth login"
            await async_run_gcloud_subcommand(sub_cmd)
            self.finish({"login": "SUCCEEDED"})
        except subprocess.CalledProcessError as e:
            self.log.exception("login failed with error: ", e)
            self.finish({"login": "FAILED"})


class CredentialsHandler(APIHandler):
    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server
    @tornado.web.authenticated
    async def post(self):
        cached = await credentials.get_cached()
        cached.pop("access_token", None) # Remove sensitive information
        if cached["config_error"] == 1:
            self.log.exception("Error fetching credentials from gcloud")
        self.finish(json.dumps(cached))


class LogHandler(APIHandler):
    @tornado.web.authenticated
    async def post(self):
        logger = self.log.getChild("CloudStoragePluginClient")
        log_body = self.get_json_body()
        logger.log(log_body["level"], log_body["message"])
        self.finish({"status": "OK"})


def setup_handlers(web_app):
    host_pattern = ".*$"

    base_url = web_app.settings["base_url"]
    application_url = "gcs-jupyter-plugin"

    def full_path(name):
        return url_path_join(base_url, application_url, name)

    handlers_map = {
        "credentials": CredentialsHandler,
        "log": LogHandler,
        "login": LoginHandler,
        "api/storage/listBuckets": ListBucketsController,
        "api/storage/listFiles": ListFilesController,
        "api/storage/loadFile": LoadFileController,
        "api/storage/createFolder": CreateFolderController,
        "api/storage/saveFile": SaveFileController,
        "api/storage/deleteFile": DeleteFileController,
        "api/storage/renameFile": RenameFileController,
        "api/storage/downloadFile": DownloadFileController,
    }
    handlers = [(full_path(name), handler) for name, handler in handlers_map.items()]
    web_app.add_handlers(host_pattern, handlers)
