import { FormEvent, useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';

const ACCESS_PASSWORD = 'veia123';

interface LoginProps {
  onSuccess: () => void;
}

export function Login({ onSuccess }: LoginProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.trim() === ACCESS_PASSWORD) {
      setError(null);
      setPassword('');
      onSuccess();
      return;
    }
    setError('Senha incorreta. Tente novamente.');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-10 space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-blue-500 font-semibold">Dashboard Seguro</p>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Entre para continuar</h1>
            <p className="text-gray-500 text-sm mt-1">Informe a senha de acesso para visualizar o painel.</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 inline-block">
              Senha de acesso
            </label>
            <div className={`flex items-center gap-3 w-full rounded-xl border px-4 py-3 transition-all ${error ? 'border-rose-400 bg-rose-50/50' : 'border-gray-200 bg-gray-50 focus-within:border-blue-500 focus-within:bg-white'}`}>
              <Lock className="w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                className="flex-1 bg-transparent focus:outline-none text-gray-800 placeholder:text-gray-400"
                placeholder="Digite a senha"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors shadow-lg shadow-blue-500/20"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
