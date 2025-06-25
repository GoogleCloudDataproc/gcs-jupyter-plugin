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
  let data: any; // data can be string or object

  if (contentType?.includes('application/json')) {
    try {
      data = JSON.parse(rawResponseText);
    } catch (parseError) {
      data = rawResponseText;
    }
  } else {
    // For all other content types (like text/plain , octet-stream), read as raw text
    data = rawResponseText;
  }

  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, data.message ?? data);
  }

  return data;
}
