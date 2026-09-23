import type { AxiosRequestConfig } from 'axios';
import type { FC, FormEvent } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RoutePath } from '../../../router/RoutePath';
import { getUserData } from '../../../api/httpClient';
import type { LoginUser, UserData } from '../../../interfaces/User';
import { LoginFormMode } from '../../../interfaces/User';
import AuthLayout from '../AuthLayout';

const defaultLoginUser: LoginUser = {
  user: '',
  password: '',
  op: LoginFormMode.BASIC
};

export const LoginNew: FC = () => {
  const [form, setForm] = useState<LoginUser>(defaultLoginUser);
  const { user } = form;
  const [errorText, setErrorText] = useState<string | null>();

  const onInput = ({ target }: { target: EventTarget | null }) => {
    const { name, value } = target as HTMLInputElement;
    setForm({ ...form, [name]: value });
  };

  const sendUser = (e: FormEvent) => {
    e.preventDefault();
    const config: Pick<AxiosRequestConfig, 'headers'> = {
      headers: { 'content-type': 'application/x-www-form-urlencoded' }
    };

    getUserData(form.user, config)
      .then((data: UserData) => data)
      .then(({ email }) => {
        if (!email) {
          setErrorText('User doesn`t exist, try to signup');
        } else {
          sessionStorage.setItem('email', email);
          window.location.href = RoutePath.PasswordCheck;
        }
      });
  };

  return (
    <AuthLayout>
      <div className="login-form">
        <form onSubmit={sendUser}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              className="au-input au-input--full"
              type="text"
              name="user"
              id="email"
              placeholder="Email"
              aria-label="Email"
              value={user}
              onInput={onInput}
            />
          </div>
          <button
            className="au-btn au-btn--block au-btn--green mb-4"
            type="submit"
            aria-label="Proceed to password entry"
          >
            Enter password
          </button>
        </form>
        <div>
          {errorText && <div className="error-text">{errorText}</div>}
          <b>Hint</b>: if you are looking for an authentication protected
          endpoint, try using:
          <a href="/api/products">
            {`${window.location.origin}/api/products`}
          </a>
        </div>
        <div className="register-link">
          <p>
            Don't have an account?{' '}
            <Link to={RoutePath.Register} aria-label="Sign Up">
              Sign Up Here
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
};

export default LoginNew;
