const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

const customJestConfig = {
  testEnvironment:        'jsdom',
  setupFilesAfterEnv:     ['@testing-library/jest-dom'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  // next/jest arma su propio moduleNameMapper (mocks de css/imagenes/fuentes)
  // pero NO mapea "paths" de tsconfig.json — sin esto, Jest resuelve
  // "@guau/shared" via node_modules (symlink de workspaces) al "main" del
  // package.json: dist/index.js. Mismo riesgo que en apps/api/jest.config.js:
  // CI nunca tiene ese dist/ (gitignoreado) y lee siempre la fuente; una
  // maquina local que lo compilo lee el compilado, y diverge en silencio si
  // alguien edita shared sin recompilar. next/jest mergea este objeto con el
  // suyo (verificado: no lo pisa), asi que esto solo agrega la entrada.
  moduleNameMapper: {
    '^@guau/shared$': '<rootDir>/../../packages/shared/index.ts',
  },
};

module.exports = createJestConfig(customJestConfig);
