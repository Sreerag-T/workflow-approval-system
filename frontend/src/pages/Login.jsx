import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Workflow, Send, Check, Clock, ShieldCheck } from 'lucide-react';
import { useLoginMutation } from '../api/apiSlice';
import { Field } from '../components/ui';

const DEMO = [
  ['Super Admin', 'admin@axentriq.com'],
  ['Manager', 'manager@axentriq.com'],
  ['Finance', 'finance@axentriq.com'],
  ['Employee', 'employee@axentriq.com'],
];

export default function Login() {
  const token = useSelector((s) => s.auth.token);
  const navigate = useNavigate();
  const [login, { isLoading }] = useLoginMutation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});

  if (token) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email)) er.email = 'Enter a valid email address';
    if (!form.password) er.password = 'Enter your password';
    setErrors(er);
    if (Object.keys(er).length) return;
    try {
      await login(form).unwrap();
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="login">
      <section className="login-art">
        <div className="brand" style={{ padding: 0 }}><span className="brand-mark"><Workflow size={20} /></span>Axentriq Flow</div>
        <div>
          <h1>Every request reaches the right approver, in the right order.</h1>
          <div className="art-rail" aria-hidden="true">
            <div className="art-node on"><Send size={20} /></div><div className="art-line on" />
            <div className="art-node on"><Check size={22} /></div><div className="art-line on" />
            <div className="art-node now"><Clock size={22} /></div><div className="art-line" />
            <div className="art-node"><ShieldCheck size={22} /></div>
          </div>
          <p>Approval chains, amount-based rules and escalation deadlines are configured by your admin, not written into code.</p>
        </div>
        <span className="small" style={{ color: '#6f809d' }}>Workflow Approval Management System</span>
      </section>
      <section className="login-form">
        <form className="login-card stack" onSubmit={submit} noValidate>
          <div>
            <h1>Sign in</h1>
            <p className="muted" style={{ margin: '6px 0 0' }}>Use your work email to continue.</p>
          </div>
          <Field label="Email" error={errors.email}>
            <input className={`input ${errors.email ? 'err' : ''}`} type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Password" error={errors.password}>
            <input className={`input ${errors.password ? 'err' : ''}`} type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <button className="btn" disabled={isLoading}>{isLoading ? 'Signing in...' : 'Sign in'}</button>
          <div>
            <span className="small muted">Demo accounts (password Password@123)</span>
            <div className="demo-chips">
              {DEMO.map(([name, email]) => (
                <button type="button" key={email} onClick={() => setForm({ email, password: 'Password@123' })}>{name}</button>
              ))}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
