import { Form, Checkbox, Typography, message } from 'antd';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import adiuvoLogo from '../../assets/logo-adiuvo.png';
import loginBg from '../../assets/login-bg.png';
import { AppButton, AppInput } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { formatApiError } from '../../utils/formatApiError';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [messageApi, contextHolder] = message.useMessage();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await login({
        username: values.username?.trim(),
        password: values.password
      });
      const nextPath = location.state?.from?.pathname || '/directorio';
      messageApi.success('Sesión iniciada correctamente.');
      navigate(nextPath, { replace: true });
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      {contextHolder}
      
      <div className="login-wrapper">
        <div className="login-logo-area">
          <img src={adiuvoLogo} alt="Adiuvo" className="login-brand-logo" />
        </div>

        <Form layout="vertical" onFinish={handleSubmit} className="login-form">
          <Form.Item
            name="username"
            rules={[{ required: true, message: 'Ingresa tu usuario' }]}
          >
            <input
              className="login-field"
              placeholder="Usuario"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Ingresa tu contraseña' }]}
          >
            <input
              className="login-field"
              type="password"
              placeholder="Contraseña"
              autoComplete="current-password"
            />
          </Form.Item>

          <div className="login-forgot">
            <Typography.Link className="login-forgot-link">
              Olvidé Contraseña
            </Typography.Link>
          </div>

          <Form.Item>
            <button
              type="submit"
              className="login-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Ingresando...' : 'Ingresar'}
            </button>
          </Form.Item>

          <div className="login-remember">
            <Checkbox className="login-remember-check">Recordar dispositivo</Checkbox>
          </div>
        </Form>
      </div>

      <style>{`
        .login-page {
          width: 100vw;
          height: 100vh;
          background-image: url(${loginBg});
          background-size: cover;
          background-position: center;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .login-wrapper {
          width: 100%;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px;
        }

        .login-logo-area {
          margin-bottom: 48px;
        }

        .login-brand-logo {
          height: 110px;
          width: auto;
        }

        .login-form {
          width: 100%;
        }

        .login-form .ant-form-item {
          margin-bottom: 16px;
        }

        .login-field {
          width: 100%;
          height: 50px;
          border: 1px solid #d4d4d4;
          border-radius: 6px;
          padding: 0 16px;
          font-size: 15px;
          font-family: 'Inter', sans-serif;
          color: #1d1d1b;
          background: white;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .login-field:focus {
          border-color: #e83c38;
          box-shadow: 0 0 0 3px rgba(232, 60, 56, 0.12);
        }

        .login-field::placeholder {
          color: #9ca3af;
        }

        .login-forgot {
          text-align: center;
          margin-bottom: 20px;
        }

        .login-forgot-link {
          color: #1d1d1b !important;
          font-weight: 500;
          font-size: 14px;
          text-decoration: underline !important;
        }

        .login-submit {
          width: 100%;
          height: 50px;
          background: #1d1d1b;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .login-submit:hover:not(:disabled) {
          background: #333;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .login-submit:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .login-remember {
          display: flex;
          justify-content: center;
          margin-top: 20px;
        }

        .login-remember-check {
          color: #77828b !important;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
