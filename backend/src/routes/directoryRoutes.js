const express = require('express');
const {
  getVisitador,
  getAssignedDoctorsCount,
  getAssignedBranchesCount,
  getHospitals,
  getSpecialties,
  getCategories,
  getDepartments,
  getMunicipalities,
  getBranchesCatalog,
  getAssignedDoctors,
  getAssignedBranches,
  getBranchFicha,
  getBranchHistory,
  getDoctorFicha,
  getDoctorHistory,
  updateDoctorFicha
} = require('../controllers/directoryController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/visitador', getVisitador);
router.get('/medicos/count', getAssignedDoctorsCount);
router.get('/sucursales/count', getAssignedBranchesCount);
router.get('/catalogs/hospitals', getHospitals);
router.get('/catalogs/specialties', getSpecialties);
router.get('/catalogs/categories', getCategories);
router.get('/catalogs/departments', getDepartments);
router.get('/catalogs/municipalities', getMunicipalities);
router.get('/catalogs/sucursales', getBranchesCatalog);
router.get('/medicos', getAssignedDoctors);
router.get('/sucursales', getAssignedBranches);
router.get('/sucursales/:codigoSucursal/ficha', getBranchFicha);
router.get('/sucursales/:codigoSucursal/historial', getBranchHistory);
router.get('/medicos/:codigoMedico/ficha', getDoctorFicha);
router.get('/medicos/:codigoMedico/historial', getDoctorHistory);
router.put('/medicos/:codigoMedico/ficha', updateDoctorFicha);

module.exports = router;
