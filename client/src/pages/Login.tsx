import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto flex flex-col gap-3">
      <h1 className="text-xl font-bold mb-2 text-center">Entrar</h1>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <input
        type="email" required placeholder="Email" value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="bg-gray-900 textInp rounded px-3 py-2"
      />
      <input
        type="password" required placeholder="Senha" value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="bg-gray-900 textInp rounded px-3 py-2"
      />
      <button type="submit" className="bg-indigo-600 btn-create py-2">Entrar</button>
    </form>
  );
}
