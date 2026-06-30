// 모노레포 Metro 설정 — 워크스페이스 감시 + react/react-dom 단일 인스턴스 강제.
// expo 내부에 끼어든 react@19 가 web 번들 JSX 런타임에 섞여 react-dom@18 과
// element 심볼이 충돌하는 문제를 막기 위해, 모든 react* import 를 모바일 사본으로 리다이렉트.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

const FORCE = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  for (const [pkg, dir] of Object.entries(FORCE)) {
    if (moduleName === pkg || moduleName.startsWith(pkg + '/')) {
      const sub = moduleName.slice(pkg.length); // '' | '/jsx-runtime' | '/client' ...
      return { type: 'sourceFile', filePath: require.resolve(dir + sub) };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
