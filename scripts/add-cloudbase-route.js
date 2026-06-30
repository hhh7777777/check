const { spawn } = require('node:child_process');

const routeData = {
  domain: 'cloud1-d3grv9iycce5a2003-1446886191.ap-shanghai.app.tcloudbase.com',
  routes: [
    {
      path: '/api',
      upstreamResourceType: 'CBR',
      upstreamResourceName: 'cloud',
      enable: true,
      enableAuth: false,
      enableSafeDomain: false,
      enablePathTransmission: true,
    },
  ],
};

const cmdArgs = [
  '/d',
  '/s',
  '/c',
  'npx.cmd',
  '-p',
  '@cloudbase/cli',
  'tcb',
  'routes',
  'edit',
  '-e',
  'cloud1-d3grv9iycce5a2003',
  '--data',
  JSON.stringify(routeData),
  '--json',
];

const child = spawn('cmd.exe', cmdArgs, {
  cwd: process.cwd(),
  shell: false,
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
