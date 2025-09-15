/**
 * Configuration for Playwright using default from @jupyterlab/galata
 */
const baseConfig = require('@jupyterlab/galata/lib/playwright-config');

/** --allow-root flag is added here as build script is being executed in the Kokoro env as the root user,
* this is needed to provide sufficient permissions for build tasks like installing software
*/
module.exports = {
  ...baseConfig,
  webServer: {
    command: 'jlpm start --allow-root',
    url: 'http://localhost:8888/lab',
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI
  }
};
