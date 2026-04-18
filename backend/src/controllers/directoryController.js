const directoryService = require('../services/directoryService');
const { asyncHandler } = require('../utils/asyncHandler');

const getVisitador = asyncHandler(async (req, res) => {
  const result = await directoryService.getVisitadorBySession(req.user.codPersonas);
  res.status(200).json(result);
});

const getAssignedDoctorsCount = asyncHandler(async (req, res) => {
  const result = await directoryService.getAssignedDoctorsCount(req.user.codPersonas);
  res.status(200).json(result);
});

const getAssignedBranchesCount = asyncHandler(async (req, res) => {
  const result = await directoryService.getAssignedBranchesCount(req.user.codPersonas);
  res.status(200).json(result);
});

const getHospitals = asyncHandler(async (req, res) => {
  const hospitals = await directoryService.getHospitalCatalog();
  res.status(200).json({ items: hospitals });
});

const getSpecialties = asyncHandler(async (req, res) => {
  const specialties = await directoryService.getSpecialtyCatalog();
  res.status(200).json({ items: specialties });
});

const getCategories = asyncHandler(async (req, res) => {
  const categories = await directoryService.getCategoryCatalog();
  res.status(200).json({ items: categories });
});

const getDepartments = asyncHandler(async (req, res) => {
  const departments = await directoryService.getDepartmentCatalog();
  res.status(200).json({ items: departments });
});

const getMunicipalities = asyncHandler(async (req, res) => {
  const municipalities = await directoryService.getMunicipalityCatalog();
  res.status(200).json({ items: municipalities });
});

const getBranchesCatalog = asyncHandler(async (req, res) => {
  const result = await directoryService.getBranchCatalog(req.user.codPersonas);
  res.status(200).json(result);
});

const getAssignedDoctors = asyncHandler(async (req, res) => {
  const result = await directoryService.getAssignedDoctors(
    req.user.codPersonas,
    req.query || {}
  );
  res.status(200).json(result);
});

const getAssignedBranches = asyncHandler(async (req, res) => {
  const result = await directoryService.getAssignedBranches(
    req.user.codPersonas,
    req.query || {}
  );
  res.status(200).json(result);
});

const getBranchFicha = asyncHandler(async (req, res) => {
  const result = await directoryService.getBranchFicha(
    req.user.codPersonas,
    req.params.codigoSucursal,
    req.query || {}
  );

  res.status(200).json(result);
});

const getBranchHistory = asyncHandler(async (req, res) => {
  const result = await directoryService.getBranchHistory(
    req.user.codPersonas,
    req.params.codigoSucursal
  );

  res.status(200).json(result);
});

const getDoctorFicha = asyncHandler(async (req, res) => {
  const result = await directoryService.getDoctorFicha(
    req.user.codPersonas,
    req.params.codigoMedico
  );

  res.status(200).json(result);
});

const getDoctorHistory = asyncHandler(async (req, res) => {
  const result = await directoryService.getDoctorHistory(
    req.user.codPersonas,
    req.params.codigoMedico
  );

  res.status(200).json(result);
});

const updateDoctorFicha = asyncHandler(async (req, res) => {
  const result = await directoryService.updateDoctorFicha(
    req.user.codPersonas,
    req.params.codigoMedico,
    req.body || {}
  );

  res.status(200).json(result);
});

module.exports = {
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
};
