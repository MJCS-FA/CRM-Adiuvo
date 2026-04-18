import {
  ArrowLeftOutlined,
  DeleteOutlined,
  PlusOutlined,
  StarFilled,
  StarOutlined
} from '@ant-design/icons';
import {
  Alert,
  Col,
  Collapse,
  DatePicker,
  Empty,
  Form,
  Row,
  Typography,
  message
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppButton, AppCard, AppInput, AppModal, AppSelect } from '../../components/ui';
import { directoryService } from '../../services/directoryService';
import { formatApiError } from '../../utils/formatApiError';

function digitsOnly(value) {
  return String(value ?? '').replace(/\D+/g, '');
}

function normalizeDate(value) {
  const text = String(value || '').trim();

  if (!text) {
    return null;
  }

  const normalized = text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function buildDoctorInitialValues(doctor = {}) {
  const fechaNacimiento = normalizeDate(doctor.fechaNacimiento);

  return {
    primerNombre: doctor.primerNombre || '',
    segundoNombre: doctor.segundoNombre || '',
    primerApellido: doctor.primerApellido || '',
    segundoApellido: doctor.segundoApellido || '',
    fechaNacimiento: fechaNacimiento ? dayjs(fechaNacimiento) : null,
    identificacion: doctor.identificacion || '',
    numeroColegiacion: doctor.numeroColegiacion || '',
    correoPersonal: doctor.correoPersonal || '',
    telefonoMovil: doctor.telefonoMovil || '',
    codigoCategoria: doctor.codigoCategoria ?? undefined,
    codigoDepartamento: doctor.codigoDepartamento ?? undefined,
    codigoMunicipio: doctor.codigoMunicipio ?? undefined,
    direccion: doctor.direccion || '',
    pacientesSemana:
      doctor.pacientesSemana !== null && doctor.pacientesSemana !== undefined
        ? String(doctor.pacientesSemana)
        : '',
    codigoRangoPrecioConsulta: doctor.codigoRangoPrecioConsulta ?? undefined
  };
}

function doctorName(doctor = {}) {
  const fullName = [
    doctor.primerNombre,
    doctor.segundoNombre,
    doctor.primerApellido,
    doctor.segundoApellido
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return fullName || `Médico ${doctor.codigoMedico || ''}`.trim();
}

export function DoctorFichaPage() {
  const navigate = useNavigate();
  const { codigoMedico } = useParams();
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm();
  const [specialtyForm] = Form.useForm();
  const [lineForm] = Form.useForm();
  const [plazaForm] = Form.useForm();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [doctor, setDoctor] = useState(null);
  const [hasVisitador, setHasVisitador] = useState(true);
  const [catalogs, setCatalogs] = useState({
    categorias: [],
    departamentos: [],
    municipios: [],
    costosConsulta: [],
    especialidades: [],
    lineas: [],
    hospitales: []
  });
  const [especialidades, setEspecialidades] = useState([]);
  const [lineas, setLineas] = useState([]);
  const [plazas, setPlazas] = useState([]);
  const [isPlazasDirty, setIsPlazasDirty] = useState(false);

  const [specialtyModalOpen, setSpecialtyModalOpen] = useState(false);
  const [lineModalOpen, setLineModalOpen] = useState(false);
  const [plazaModalOpen, setPlazaModalOpen] = useState(false);

  const selectedDepartamento = Form.useWatch('codigoDepartamento', form);

  const municipiosOptions = useMemo(() => {
    const items = catalogs.municipios || [];

    if (!selectedDepartamento) {
      return items;
    }

    return items.filter(
      (item) =>
        Number(item.departamentoId || 0) === Number(selectedDepartamento || 0)
    );
  }, [catalogs.municipios, selectedDepartamento]);

  const especialidadesDisponibles = useMemo(() => {
    const used = new Set(
      (especialidades || []).map((item) => Number(item.codigoEspecialidad))
    );

    return (catalogs.especialidades || []).filter(
      (item) => !used.has(Number(item.value))
    );
  }, [catalogs.especialidades, especialidades]);

  const lineasDisponibles = useMemo(() => {
    const used = new Set((lineas || []).map((item) => Number(item.codigoLineaProducto)));

    return (catalogs.lineas || []).filter(
      (item) => !used.has(Number(item.value))
    );
  }, [catalogs.lineas, lineas]);

  const loadDoctorFicha = async () => {
    setLoading(true);

    try {
      const response = await directoryService.getDoctorFicha(codigoMedico);
      const doctorPayload = response.doctor || null;

      setHasVisitador(Boolean(response.hasVisitador ?? true));
      setDoctor(doctorPayload);
      setCatalogs({
        categorias: response.catalogs?.categorias || [],
        departamentos: response.catalogs?.departamentos || [],
        municipios: response.catalogs?.municipios || [],
        costosConsulta: response.catalogs?.costosConsulta || [],
        especialidades: response.catalogs?.especialidades || [],
        lineas: response.catalogs?.lineas || [],
        hospitales: response.catalogs?.hospitales || []
      });
      setEspecialidades(response.especialidades || []);
      setLineas(response.lineas || []);
      setPlazas(response.plazas || []);
      setIsPlazasDirty(false);
      form.setFieldsValue(buildDoctorInitialValues(doctorPayload || {}));
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDoctorFicha();
  }, [codigoMedico]);

  useEffect(() => {
    const currentMunicipio = form.getFieldValue('codigoMunicipio');

    if (!currentMunicipio) {
      return;
    }

    const isMunicipioValid = municipiosOptions.some(
      (item) => Number(item.value) === Number(currentMunicipio)
    );

    if (!isMunicipioValid) {
      form.setFieldValue('codigoMunicipio', undefined);
    }
  }, [municipiosOptions, form]);

  const setEspecialidadPrincipal = (codigoEspecialidad) => {
    setEspecialidades((current) =>
      current.map((item) => ({
        ...item,
        isPrincipal: Number(item.codigoEspecialidad) === Number(codigoEspecialidad)
      }))
    );
  };

  const setPlazaPrincipal = (index) => {
    setIsPlazasDirty(true);
    setPlazas((current) =>
      current.map((item, currentIndex) => ({
        ...item,
        isPrincipal: currentIndex === index
      }))
    );
  };

  const removeEspecialidad = (codigoEspecialidad) => {
    setEspecialidades((current) => {
      const filtered = current.filter(
        (item) => Number(item.codigoEspecialidad) !== Number(codigoEspecialidad)
      );

      if (filtered.length === 1 && !filtered[0].isPrincipal) {
        filtered[0].isPrincipal = true;
      }

      return filtered;
    });
  };

  const removeLinea = (codigoLineaProducto) => {
    setLineas((current) =>
      current.filter(
        (item) => Number(item.codigoLineaProducto) !== Number(codigoLineaProducto)
      )
    );
  };

  const removePlaza = (index) => {
    setIsPlazasDirty(true);
    setPlazas((current) => {
      const removedItem = current[index];
      const filtered = current.filter((_, currentIndex) => currentIndex !== index);

      if (removedItem?.isPrincipal && filtered.length) {
        filtered[0].isPrincipal = true;
      }

      return filtered;
    });
  };

  const updatePlazaField = (index, field, value) => {
    setIsPlazasDirty(true);
    setPlazas((current) =>
      current.map((item, currentIndex) => {
        if (currentIndex !== index) {
          return item;
        }

        return {
          ...item,
          [field]: value
        };
      })
    );
  };

  const handleAddEspecialidad = async () => {
    try {
      const values = await specialtyForm.validateFields();
      const selected = catalogs.especialidades.find(
        (item) => Number(item.value) === Number(values.codigoEspecialidad)
      );

      setEspecialidades((current) => {
        const hasPrincipal = current.some((item) => item.isPrincipal);

        return [
          ...current,
          {
            codigoEspecialidad: Number(values.codigoEspecialidad),
            nombreEspecialidad: selected?.label || 'Especialidad',
            isPrincipal: !hasPrincipal
          }
        ];
      });

      specialtyForm.resetFields();
      setSpecialtyModalOpen(false);
    } catch (_) {
      // Validation handled by antd form
    }
  };

  const handleAddLinea = async () => {
    try {
      const values = await lineForm.validateFields();
      const selected = catalogs.lineas.find(
        (item) => Number(item.value) === Number(values.codigoLineaProducto)
      );

      setLineas((current) => [
        ...current,
        {
          codigoLineaProducto: Number(values.codigoLineaProducto),
          nombreLineaProducto: selected?.label || 'Línea'
        }
      ]);

      lineForm.resetFields();
      setLineModalOpen(false);
    } catch (_) {
      // Validation handled by antd form
    }
  };

  const handleAddPlaza = async () => {
    try {
      const values = await plazaForm.validateFields();
      const selectedHospital = catalogs.hospitales.find(
        (item) => Number(item.value) === Number(values.codigoHospitalClinica)
      );

      setIsPlazasDirty(true);
      setPlazas((current) => {
        const hasPrincipal = current.some((item) => item.isPrincipal);

        return [
          ...current,
          {
            codigoPlazaMedica: null,
            codigoHospitalClinica: Number(values.codigoHospitalClinica),
            nombreHospitalClinica: selectedHospital?.label || '',
            nombrePlaza: values.nombrePlaza?.trim() || '',
            direccion: values.direccion?.trim() || '',
            telefonoClinica: digitsOnly(values.telefonoClinica),
            nombreContacto: values.nombreContacto?.trim() || '',
            puestoContacto: values.puestoContacto?.trim() || '',
            fechaNacimientoContacto: values.fechaNacimientoContacto
              ? values.fechaNacimientoContacto.format('YYYY-MM-DD')
              : null,
            telefonoMovilContacto: digitsOnly(values.telefonoMovilContacto),
            isPrincipal: !hasPrincipal
          }
        ];
      });

      plazaForm.resetFields();
      setPlazaModalOpen(false);
    } catch (_) {
      // Validation handled by antd form
    }
  };

  const handleSave = async () => {
    if (saving) {
      return;
    }

    try {
      const values = await form.validateFields();
      setSaving(true);

      const payload = {
        doctor: {
          primerNombre: values.primerNombre,
          segundoNombre: values.segundoNombre,
          primerApellido: values.primerApellido,
          segundoApellido: values.segundoApellido,
          fechaNacimiento: values.fechaNacimiento
            ? values.fechaNacimiento.format('YYYY-MM-DD')
            : null,
          identificacion: digitsOnly(values.identificacion),
          numeroColegiacion: values.numeroColegiacion,
          correoPersonal: values.correoPersonal,
          telefonoMovil: digitsOnly(values.telefonoMovil),
          codigoCategoria: values.codigoCategoria,
          codigoDepartamento: values.codigoDepartamento,
          codigoMunicipio: values.codigoMunicipio,
          direccion: values.direccion,
          pacientesSemana: values.pacientesSemana ? Number(values.pacientesSemana) : null,
          codigoRangoPrecioConsulta: values.codigoRangoPrecioConsulta
        },
        especialidades: especialidades.map((item) => ({
          codigoEspecialidad: Number(item.codigoEspecialidad),
          isPrincipal: Boolean(item.isPrincipal)
        })),
        lineas: lineas.map((item) => ({
          codigoLineaProducto: Number(item.codigoLineaProducto)
        }))
      };

      if (isPlazasDirty) {
        payload.plazas = plazas.map((item) => ({
          codigoHospitalClinica: item.codigoHospitalClinica,
          nombrePlaza: item.nombrePlaza,
          direccion: item.direccion,
          telefonoClinica: digitsOnly(item.telefonoClinica),
          nombreContacto: item.nombreContacto,
          puestoContacto: item.puestoContacto,
          fechaNacimientoContacto: item.fechaNacimientoContacto || null,
          telefonoMovilContacto: digitsOnly(item.telefonoMovilContacto),
          isPrincipal: Boolean(item.isPrincipal)
        }));
      }

      await directoryService.updateDoctorFicha(codigoMedico, payload);
    messageApi.success('Ficha del médico actualizada correctamente.');
      await loadDoctorFicha();
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      messageApi.error(formatApiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-wrap directory-ficha-page">
      {contextHolder}

      <div className="directory-ficha-header">
        <AppButton
          variant="ghost"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          className="directory-ficha-back-btn"
          aria-label="Regresar"
        />
        <Typography.Title level={4} style={{ margin: 0 }}>
          Ficha del Médico
        </Typography.Title>
      </div>

      {!loading && !hasVisitador ? (
        <Alert
          type="warning"
          showIcon
          message="No se encontró visitador relacionado para esta sesión."
        />
      ) : null}

      <AppCard loading={loading}>
        <Typography.Text className="directory-ficha-doctor-name">
          {doctorName(doctor || {})}
        </Typography.Text>
        <Typography.Text type="secondary">
          Cod. Médico: {doctor?.codigoMedico || codigoMedico}
        </Typography.Text>
      </AppCard>

      <AppCard title="Datos del Médico" loading={loading}>
        <Form form={form} layout="vertical">
          <Row gutter={[12, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Primer Nombre *"
                name="primerNombre"
                rules={[{ required: true, message: 'Campo requerido.' }]}
              >
                <AppInput />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Segundo Nombre" name="segundoNombre">
                <AppInput />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Primer Apellido *"
                name="primerApellido"
                rules={[{ required: true, message: 'Campo requerido.' }]}
              >
                <AppInput />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Segundo Apellido" name="segundoApellido">
                <AppInput />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Fecha Nacimiento *"
                name="fechaNacimiento"
                rules={[{ required: true, message: 'Campo requerido.' }]}
              >
                <DatePicker className="calendar-form-control" format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Identificación"
                name="identificacion"
                getValueFromEvent={(event) => digitsOnly(event?.target?.value)}
              >
                <AppInput inputMode="numeric" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="N° Colegiación" name="numeroColegiacion">
                <AppInput />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Correo Personal" name="correoPersonal">
                <AppInput type="email" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Teléfono Móvil"
                name="telefonoMovil"
                getValueFromEvent={(event) => digitsOnly(event?.target?.value)}
              >
                <AppInput inputMode="numeric" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Categoría *"
                name="codigoCategoria"
                rules={[{ required: true, message: 'Campo requerido.' }]}
              >
                <AppSelect
                  placeholder="Seleccionar..."
                  options={catalogs.categorias}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Departamento *"
                name="codigoDepartamento"
                rules={[{ required: true, message: 'Campo requerido.' }]}
              >
                <AppSelect
                  placeholder="Seleccionar..."
                  options={catalogs.departamentos}
                  onChange={(value) => {
                    const nextMunicipios = (catalogs.municipios || []).filter(
                      (item) =>
                        Number(item.departamentoId || 0) === Number(value || 0)
                    );
                    const currentMunicipio = form.getFieldValue('codigoMunicipio');
                    const shouldKeepMunicipio = nextMunicipios.some(
                      (item) => Number(item.value) === Number(currentMunicipio)
                    );

                    if (!shouldKeepMunicipio) {
                      form.setFieldValue('codigoMunicipio', undefined);
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Municipio *"
                name="codigoMunicipio"
                rules={[{ required: true, message: 'Campo requerido.' }]}
              >
                <AppSelect
                  placeholder="Seleccionar..."
                  options={municipiosOptions}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Pacientes por semana" name="pacientesSemana">
                <AppInput
                  inputMode="numeric"
                  onChange={(event) =>
                    form.setFieldValue('pacientesSemana', digitsOnly(event.target.value))
                  }
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Costo Consulta" name="codigoRangoPrecioConsulta">
                <AppSelect
                  placeholder="Seleccionar..."
                  options={catalogs.costosConsulta}
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="Dirección" name="direccion">
                <AppInput type="textarea" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </AppCard>

      <AppCard
        title="Especialidades"
        loading={loading}
        extra={
          <AppButton
            variant="ghost"
            icon={<PlusOutlined />}
            onClick={() => setSpecialtyModalOpen(true)}
            disabled={!especialidadesDisponibles.length}
          >
            Agregar
          </AppButton>
        }
      >
        {!especialidades.length ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin especialidades" />
        ) : (
          <div className="directory-ficha-list">
            {especialidades.map((item) => (
              <div key={item.codigoEspecialidad} className="directory-ficha-list-row">
                <Typography.Text>{item.nombreEspecialidad}</Typography.Text>
                <div className="directory-ficha-row-actions">
                  <AppButton
                    variant="ghost"
                    icon={item.isPrincipal ? <StarFilled /> : <StarOutlined />}
                    onClick={() => setEspecialidadPrincipal(item.codigoEspecialidad)}
                    aria-label="Marcar principal"
                  />
                  <AppButton
                    variant="ghost"
                    icon={<DeleteOutlined />}
                    onClick={() => removeEspecialidad(item.codigoEspecialidad)}
                    aria-label="Eliminar especialidad"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </AppCard>

      <AppCard
        title="Líneas"
        loading={loading}
        extra={
          <AppButton
            variant="ghost"
            icon={<PlusOutlined />}
            onClick={() => setLineModalOpen(true)}
            disabled={!lineasDisponibles.length}
          >
            Agregar
          </AppButton>
        }
      >
        {!lineas.length ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin líneas" />
        ) : (
          <div className="directory-ficha-list">
            {lineas.map((item) => (
              <div key={item.codigoLineaProducto} className="directory-ficha-list-row">
                <Typography.Text>{item.nombreLineaProducto}</Typography.Text>
                <div className="directory-ficha-row-actions">
                  <AppButton
                    variant="ghost"
                    icon={<DeleteOutlined />}
                    onClick={() => removeLinea(item.codigoLineaProducto)}
                    aria-label="Eliminar línea"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </AppCard>

      <AppCard
        title="Datos Plazas (Clínicas / Hospitales)"
        loading={loading}
        extra={
          <AppButton
            variant="ghost"
            icon={<PlusOutlined />}
            onClick={() => setPlazaModalOpen(true)}
          >
            Agregar Datos
          </AppButton>
        }
      >
        {!plazas.length ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin plazas registradas" />
        ) : (
          <Collapse
            className="directory-ficha-plaza-collapse"
            items={plazas.map((item, index) => ({
              key: String(index),
              label: (
                <div className="directory-ficha-plaza-header">
                  <Typography.Text strong>
                    {item.nombreHospitalClinica || `Hospital ${item.codigoHospitalClinica || ''}`}
                  </Typography.Text>
                  {item.isPrincipal ? (
                    <Typography.Text type="secondary">Principal</Typography.Text>
                  ) : null}
                </div>
              ),
              extra: (
                <div
                  className="directory-ficha-row-actions"
                  onClick={(event) => event.stopPropagation()}
                >
                  <AppButton
                    variant="ghost"
                    icon={item.isPrincipal ? <StarFilled /> : <StarOutlined />}
                    onClick={() => setPlazaPrincipal(index)}
                    aria-label="Marcar plaza principal"
                  />
                  <AppButton
                    variant="ghost"
                    icon={<DeleteOutlined />}
                    onClick={() => removePlaza(index)}
                    aria-label="Eliminar plaza"
                  />
                </div>
              ),
              children: (
                <Row gutter={[12, 0]}>
                  <Col xs={24} md={12}>
                    <Typography.Text className="directory-filter-label">
                      Hospital
                    </Typography.Text>
                    <AppSelect
                      value={item.codigoHospitalClinica}
                      options={catalogs.hospitales}
                      onChange={(value) => {
                        const selected = (catalogs.hospitales || []).find(
                          (option) => Number(option.value) === Number(value)
                        );

                        updatePlazaField(index, 'codigoHospitalClinica', value);
                        updatePlazaField(index, 'nombreHospitalClinica', selected?.label || '');
                      }}
                    />
                  </Col>
                  <Col xs={24} md={12}>
                    <Typography.Text className="directory-filter-label">
                      Nombre de la Plaza *
                    </Typography.Text>
                    <AppInput
                      value={item.nombrePlaza}
                      onChange={(event) =>
                        updatePlazaField(index, 'nombrePlaza', event.target.value)
                      }
                    />
                  </Col>
                  <Col xs={24} md={12}>
                    <Typography.Text className="directory-filter-label">
                      Teléfono Clínica
                    </Typography.Text>
                    <AppInput
                      value={item.telefonoClinica}
                      inputMode="numeric"
                      onChange={(event) =>
                        updatePlazaField(
                          index,
                          'telefonoClinica',
                          digitsOnly(event.target.value)
                        )
                      }
                    />
                  </Col>
                  <Col xs={24} md={12}>
                    <Typography.Text className="directory-filter-label">
                      Nombre Contacto *
                    </Typography.Text>
                    <AppInput
                      value={item.nombreContacto}
                      onChange={(event) =>
                        updatePlazaField(index, 'nombreContacto', event.target.value)
                      }
                    />
                  </Col>
                  <Col xs={24} md={12}>
                    <Typography.Text className="directory-filter-label">
                      Puesto Contacto *
                    </Typography.Text>
                    <AppInput
                      value={item.puestoContacto}
                      onChange={(event) =>
                        updatePlazaField(index, 'puestoContacto', event.target.value)
                      }
                    />
                  </Col>
                  <Col xs={24} md={12}>
                    <Typography.Text className="directory-filter-label">
                      Fecha Nacimiento Contacto
                    </Typography.Text>
                    <DatePicker
                      className="calendar-form-control"
                      format="YYYY-MM-DD"
                      value={
                        item.fechaNacimientoContacto
                          ? dayjs(item.fechaNacimientoContacto)
                          : null
                      }
                      onChange={(value) =>
                        updatePlazaField(
                          index,
                          'fechaNacimientoContacto',
                          value ? value.format('YYYY-MM-DD') : null
                        )
                      }
                    />
                  </Col>
                  <Col xs={24} md={12}>
                    <Typography.Text className="directory-filter-label">
                      Teléfono Móvil Contacto
                    </Typography.Text>
                    <AppInput
                      value={item.telefonoMovilContacto}
                      inputMode="numeric"
                      onChange={(event) =>
                        updatePlazaField(
                          index,
                          'telefonoMovilContacto',
                          digitsOnly(event.target.value)
                        )
                      }
                    />
                  </Col>
                  <Col span={24}>
                    <Typography.Text className="directory-filter-label">
                      Dirección *
                    </Typography.Text>
                    <AppInput
                      type="textarea"
                      value={item.direccion}
                      onChange={(event) =>
                        updatePlazaField(index, 'direccion', event.target.value)
                      }
                    />
                  </Col>
                </Row>
              )
            }))}
          />
        )}
      </AppCard>

      <AppCard>
        <div className="directory-ficha-footer">
          <AppButton loading={saving} disabled={saving} onClick={handleSave}>
            Guardar Cambios
          </AppButton>
        </div>
      </AppCard>

      <AppModal
        open={specialtyModalOpen}
        title="Agregar Especialidad"
        onCancel={() => {
          setSpecialtyModalOpen(false);
          specialtyForm.resetFields();
        }}
        onOk={handleAddEspecialidad}
      >
        <Form layout="vertical" form={specialtyForm}>
          <Form.Item
            label="Especialidad"
            name="codigoEspecialidad"
            rules={[{ required: true, message: 'Selecciona una especialidad.' }]}
          >
            <AppSelect
              showSearch
              optionFilterProp="label"
              options={especialidadesDisponibles}
              placeholder="Seleccionar..."
            />
          </Form.Item>
        </Form>
      </AppModal>

      <AppModal
        open={lineModalOpen}
        title="Agregar Línea"
        onCancel={() => {
          setLineModalOpen(false);
          lineForm.resetFields();
        }}
        onOk={handleAddLinea}
      >
        <Form layout="vertical" form={lineForm}>
          <Form.Item
            label="Línea"
            name="codigoLineaProducto"
            rules={[{ required: true, message: 'Selecciona una línea.' }]}
          >
            <AppSelect
              showSearch
              optionFilterProp="label"
              options={lineasDisponibles}
              placeholder="Seleccionar..."
            />
          </Form.Item>
        </Form>
      </AppModal>

      <AppModal
        open={plazaModalOpen}
        title="Agregar Plaza"
        onCancel={() => {
          setPlazaModalOpen(false);
          plazaForm.resetFields();
        }}
        onOk={handleAddPlaza}
      >
        <Form layout="vertical" form={plazaForm}>
          <Row gutter={[12, 0]}>
            <Col span={24}>
              <Form.Item
                label="Hospital"
                name="codigoHospitalClinica"
                rules={[{ required: true, message: 'Selecciona un hospital.' }]}
              >
                <AppSelect
                  showSearch
                  optionFilterProp="label"
                  options={catalogs.hospitales}
                  placeholder="Seleccionar..."
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item
                label="Nombre de la Plaza *"
                name="nombrePlaza"
                rules={[{ required: true, message: 'Campo requerido.' }]}
              >
                <AppInput />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item
                label="Dirección *"
                name="direccion"
                rules={[{ required: true, message: 'Campo requerido.' }]}
              >
                <AppInput type="textarea" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Teléfono Clínica"
                name="telefonoClinica"
                getValueFromEvent={(event) => digitsOnly(event?.target?.value)}
              >
                <AppInput inputMode="numeric" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Nombre Contacto *"
                name="nombreContacto"
                rules={[{ required: true, message: 'Campo requerido.' }]}
              >
                <AppInput />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Puesto Contacto *"
                name="puestoContacto"
                rules={[{ required: true, message: 'Campo requerido.' }]}
              >
                <AppInput />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Fecha Nacimiento Contacto" name="fechaNacimientoContacto">
                <DatePicker className="calendar-form-control" format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Teléfono Móvil Contacto"
                name="telefonoMovilContacto"
                getValueFromEvent={(event) => digitsOnly(event?.target?.value)}
              >
                <AppInput inputMode="numeric" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </AppModal>
    </div>
  );
}
