/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  testEnvironment: 'node',
  // Sin esto, Jest resuelve "@guau/shared" via node_modules (symlink de
  // workspaces) al "main" de su package.json: dist/index.js. CI nunca tiene
  // ese dist/ (esta gitignoreado), asi que ahi el resolver cae solo al
  // fallback de "index.ts" en la raiz del paquete. Una maquina local que SI
  // tiene el dist/ compilado (por correr `npm run build` en shared) deja de
  // caer en ese fallback y pasa a leer el compilado — si se edita shared sin
  // recompilar, los tests locales corren en verde contra la version vieja
  // mientras CI ya ve la nueva. Mapear siempre a la fuente saca esa
  // dependencia del estado de dist/ y empareja local con CI.
  moduleNameMapper: {
    '^@guau/shared$': '<rootDir>/../../../packages/shared/index.ts',
  },
};
