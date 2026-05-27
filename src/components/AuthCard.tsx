import { LogIn, LogOut, User as UserIcon, CheckCircle } from 'lucide-react';
import { User } from 'firebase/auth';

interface AuthCardProps {
  user: User | null;
  needsAuth: boolean;
  isLoggingIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
}

export default function AuthCard({
  user,
  needsAuth,
  isLoggingIn,
  onLogin,
  onLogout,
}: AuthCardProps) {
  return (
    <div className="bg-white border border-neutral-200/60 rounded-xl shadow-xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-neutral-300">
      <div className="flex items-center gap-3">
        {user ? (
          <div className="relative">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Authorized'}
                className="w-10 h-10 rounded-full border border-neutral-100/50 shadow-3xs"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center font-bold text-xs">
                {user.displayName?.charAt(0) || 'U'}
              </div>
            )}
            <div className="absolute -bottom-0.5 -right-0.5 bg-neutral-900 text-white rounded-full p-0.5 border border-white">
              <CheckCircle size={8} className="fill-current text-white" />
            </div>
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full bg-neutral-50 text-neutral-400 flex items-center justify-center border border-neutral-100">
            <UserIcon size={16} />
          </div>
        )}

        <div>
          <h2 className="font-sans font-medium text-neutral-900 text-sm">
            {user ? user.displayName || 'Authorized Account' : 'Guest Mode Active'}
          </h2>
          <p className="font-mono text-[10.5px] text-neutral-400 mt-0.5">
            {user ? user.email || 'Google Account' : 'Authenticate with OAuth to allow edits to Sheets'}
          </p>
        </div>
      </div>

      <div>
        {user ? (
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-neutral-200 hover:border-red-200 hover:text-red-650 hover:bg-red-50/50 text-neutral-600 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            <LogOut size={12} />
            <span>Logout Session</span>
          </button>
        ) : (
          <button
            onClick={onLogin}
            disabled={isLoggingIn}
            className="w-full sm:w-auto cursor-pointer"
          >
            <div className="shadow-3xs border border-neutral-205 hover:border-neutral-300 rounded-lg bg-white py-1.5 px-4 transition-all hover:bg-neutral-50 flex items-center justify-center gap-2">
              <div className="flex items-center">
                <svg
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  style={{ display: "block", width: "14px", height: "14px" }}
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  ></path>
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  ></path>
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  ></path>
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  ></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
              </div>
              <span className="text-neutral-700 text-xs font-sans font-semibold">
                {isLoggingIn ? 'Connecting...' : 'Authorize with Google'}
              </span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
