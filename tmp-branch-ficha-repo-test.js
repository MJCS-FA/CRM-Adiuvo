const path = require('path');
require('dotenv').config({ path: path.resolve('backend/.env') });
const repo = require('./backend/src/repositories/directoryRepository');

(async () => {
  const info = await repo.findSucursalInfoByCountryAndCode({ codigoPais: 8, codigoSucursal: 2 });
  console.log('INFO', info ? { codigoSucursal: info.codigoSucursal, nombreSucursal: info.nombreSucursal, codGA: info.codGA, codGF: info.codGF, codGO: info.codGO } : null);
  const ga = await repo.findPersonaByCodeFromTable('personasGA', info?.codGA);
  const gf = await repo.findPersonaByCodeFromTable('personasGF', info?.codGF);
  const go = await repo.findPersonaByCodeFromTable('personasGO', info?.codGO);
  console.log('GA', ga);
  console.log('GF', gf);
  console.log('GO', go);
})().catch((e) => {
  console.error('ERR', e.code || '', e.message);
  process.exit(1);
});
