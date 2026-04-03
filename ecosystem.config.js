const nodeExe = process.env.LUCENT_NODE || 'node';
const uvicornExe = process.env.LUCENT_UVICORN || 'uvicorn';
const extraPath = process.env.LUCENT_EXTRA_PATH
  ? process.env.LUCENT_EXTRA_PATH + ';' + process.env.PATH
  : process.env.PATH;

module.exports = {
  apps: [
    {
      name: 'lucent-frontend',
      cwd: './frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      interpreter: nodeExe,
      env: {
        PORT: 3840,
        NODE_ENV: 'production',
      },
      watch: false,
      autorestart: true,
    },
    {
      name: 'lucent-backend',
      cwd: './backend',
      script: uvicornExe,
      args: 'app.main:app --host 0.0.0.0 --port 8000',
      env: {
        PYTHONPATH: '.',
        PATH: extraPath,
      },
      watch: false,
      autorestart: true,
    },
  ],
};
