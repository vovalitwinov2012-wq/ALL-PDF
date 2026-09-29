import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileText, Moon, Sun, Globe } from 'lucide-react';

export function Layout() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const [dark, setDark] = useState(() => localStorage.getItem('allpdf-theme') === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('allpdf-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const toggleLang = () => {
    const next = i18n.language === 'ru' ? 'en' : 'ru';
    void i18n.changeLanguage(next);
  };

  const isTool = pathname !== '/' && pathname !== '/about';

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/80 via-white to-white text-slate-900 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-indigo-100/60 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <NavLink to="/" className="flex min-w-0 items-center gap-2 font-extrabold tracking-tight">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-soft">
              <FileText className="h-5 w-5" />
            </span>
            <span className="whitespace-nowrap text-sm sm:text-base">ALL PDF</span>
          </NavLink>
          <span className="hidden rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 sm:inline dark:bg-emerald-950 dark:text-emerald-300">
            {t('localBadge')}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <NavLink to="/" className="hidden rounded-lg px-3 py-2 text-sm hover:bg-indigo-50 sm:inline-flex dark:hover:bg-slate-800">{t('home')}</NavLink>
            <NavLink to="/about" className="hidden rounded-lg px-3 py-2 text-sm hover:bg-indigo-50 md:inline-flex dark:hover:bg-slate-800">{t('aboutNav')}</NavLink>
            <button onClick={toggleLang} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm dark:border-slate-700" title={t('language')}>
              <Globe className="h-4 w-4" /> {i18n.language === 'ru' ? 'RU' : 'EN'}
            </button>
            <button onClick={() => setDark(!dark)} className="grid min-h-[40px] min-w-[40px] place-items-center rounded-lg border dark:border-slate-700" title={t('theme')}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <nav className="border-t border-indigo-100/60 sm:hidden dark:border-slate-800">
          <div className="mx-auto flex max-w-6xl items-center gap-1 px-3 py-1.5">
            <NavLink to="/" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-indigo-50 dark:hover:bg-slate-800">{t('home')}</NavLink>
            <NavLink to="/about" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-indigo-50 dark:hover:bg-slate-800">{t('aboutNav')}</NavLink>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {isTool && (
          <Link
            to="/"
            className="mb-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-900 dark:text-indigo-400 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" /> {t('allTools')}
          </Link>
        )}
        <div key={pathname} className="animate-enter">
          <Outlet />
        </div>
      </main>
      <footer className="border-t py-6 text-center text-xs text-slate-500 dark:border-slate-800">
        ALL PDF · {t('footerNote')}
      </footer>
    </div>
  );
}
