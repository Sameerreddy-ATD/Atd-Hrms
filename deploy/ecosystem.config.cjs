/** PM2 process definitions for production (Lightsail / Ubuntu). */
module.exports = {
  apps: [
    {
      name: "atd-backend",
      cwd: "/opt/anytime-crew-hub",
      script: "npm",
      args: "run start:backend",
      env: {
        NODE_ENV: "production",
      },
      max_restarts: 10,
      exp_backoff_restart_delay: 2000,
    },
    {
      name: "atd-frontend",
      cwd: "/opt/anytime-crew-hub",
      script: "npm",
      args: "run start:frontend -- --host 0.0.0.0 --port 8081",
      env: {
        NODE_ENV: "production",
      },
      max_restarts: 10,
      exp_backoff_restart_delay: 2000,
    },
  ],
};
