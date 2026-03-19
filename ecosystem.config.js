module.exports = {
  apps: [
    {
      name: 'lucent-frontend',
      cwd: './frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      interpreter: 'C:/tools/node-v20.18.3-win-x64/node.exe',
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
      script: 'C:/tools/python311/Scripts/uvicorn.exe',
      args: 'app.main:app --host 0.0.0.0 --port 8000',
      env: {
        PYTHONPATH: '.',
        PATH: 'C:/tools/mingw64/bin;C:/Users/Administrator/.cmdstan/cmdstan-2.38.0/stan/lib/stan_math/lib/tbb;' + process.env.PATH,
      },
      watch: false,
      autorestart: true,
    },
  ],
};
