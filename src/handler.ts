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

  if(response.ok){
    if (contentType?.includes('application/json')) {
      try {
        return JSON.parse(rawResponseText);
      } catch (parseError) {
        console.warn('Parse Error Occured : ' + parseError)
        return rawResponseText as any;
      }
    } else {
      return rawResponseText as any;
    }
  } else {
    throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
  }
}
