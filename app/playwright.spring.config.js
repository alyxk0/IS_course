import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
// Existing tests use this flag to exercise the HTTP transport rather than Socket.IO.
process.env.TEST_RUNTIME='worker';
export default defineConfig({
 ...base,timeout:90000,outputDir:'test-results-spring',
 use:{...base.use,channel:'chrome'},
 webServer:{command:'java -Xmx768m -jar backend/target/sheets-1.0.0.jar',url:'http://127.0.0.1:3101/api/me',timeout:120000,reuseExistingServer:false,
  env:{PORT:'3101',DB_URL:'jdbc:postgresql://127.0.0.1:54330/sheets_test',DB_USER:'journals',DB_PASSWORD:process.env.DB_PASSWORD,AUTH_LIMIT:'10000'}}
});
