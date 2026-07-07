import { createApp } from "./app.js";
import { assertSecureConfig, config } from "./config.js";

assertSecureConfig();

createApp().listen(config.port, () => {
  console.log(`AnytimeDiesel HRMS API listening on http://localhost:${config.port}`);
});
