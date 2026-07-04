import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logo from '../img/logo.png';

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold">
          <img src={logo} alt="IDC" className="h-8 w-8" />
          IDC
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/">Explorar</Link>
          {user && <Link to="/new">Publicar</Link>}
          {user && <Link to="/mine">Minhas ideias</Link>}
          {user?.role === 'admin' && <Link to="/admin/features">Features</Link>}
          {user?.role === 'admin' && <Link to="/admin/audit">Auditoria</Link>}
          {user ? (
            <button onClick={logout} className="text-red-400">Sair ({user.name})</button>
          ) : (
            <>
              <Link to="/login">Entrar</Link>
              <Link to="/register">Cadastrar</Link>
            </>
          )}
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
