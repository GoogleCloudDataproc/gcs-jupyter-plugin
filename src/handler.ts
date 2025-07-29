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

import { URLExt } from '@jupyterlab/coreutils';

import { ServerConnection } from '@jupyterlab/services';

/**
 * Call the API extension
 *
 * @param endPoint API REST end point for the extension
 * @param init Initial values for the request
 * @returns The response body interpreted as JSON
 */
export async function requestAPI<T>(
  endPoint = '',
  init: RequestInit = {}
): Promise<T> {
  // Make request to Jupyter API
  const settings = ServerConnection.makeSettings();
  const requestUrl = URLExt.join(
    settings.baseUrl,
    'gcs-jupyter-plugin', // API Namespace
    endPoint
  );
  let response: Response;
  try {
    response = await ServerConnection.makeRequest(requestUrl, init, settings);
  } catch (error) {
    throw new ServerConnection.NetworkError(error as any);
  }

  const rawResponseText = await response.text();
  const contentType = response.headers.get('Content-Type');

  if (!response.ok) {
    // If the response is not ok, throw an error with the response status
    let errorData = undefined;
    if (rawResponseText) {
      try {
        errorData = JSON.parse(rawResponseText);
      } catch (parseError) {
        console.warn('Parse Error Occurred: ' + parseError);
        throw new ServerConnection.ResponseError(
          response,
          `API request failed with status ${response.status}: ${response.statusText}`,
          response.status + ''
        );
      }
      if (errorData?.error) {
        throw new ServerConnection.ResponseError(
          response,
          errorData.error,
          errorData.status || response.status
        );
      }
    }
    // If no error message is found, throw a generic error
    throw new ServerConnection.ResponseError(
      response,
      `API request failed with status ${response.status}: ${response.statusText}`
    );
  }

  if (!contentType?.includes('application/json')) {
    return rawResponseText as any;
  }

  // If content type is JSON, attempting to parse it
  try {
    return JSON.parse(rawResponseText);
  } catch (parseError) {
    console.warn('Parse Error Occurred: ' + parseError);
    return rawResponseText as any;
  }
}
