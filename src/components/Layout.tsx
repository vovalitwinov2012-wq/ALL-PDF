import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Moon, Sun, Globe } from 'lucide-react';

export function Layout() {
  const { t, i18n } = useTranslation();
  const [dark, setDark] = useState(() => localStorage.getItem('allpdf-theme') === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('allpdf-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const toggleLang = () => {
    const next = i18n.language === 'ru' ? 'en' : 'ru';
    void i18n.changeLanguage(next);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/80 via-white to-white text-slate-900 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-indigo-100/60 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 font-extrabold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-soft">
              <FileText className="h-5 w-5" />
            </span>
            ALL PDF
          </NavLink>
          <span className="hidden rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 sm:inline dark:bg-emerald-950 dark:text-emerald-300">
            {t('localBadge')}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <NavLink to="/" className="rounded-lg px-3 py-1.5 text-sm hover:bg-indigo-50 dark:hover:bg-slate-800">{t('home')}</NavLink>
            <NavLink to="/about" className="rounded-lg px-3 py-1.5 text-sm hover:bg-indigo-50 dark:hover:bg-slate-800">{t('aboutNav')}</NavLink>
            <button onClick={toggleLang} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm dark:border-slate-700" title={t('language')}>
              <Globe className="h-4 w-4" /> {i18n.language === 'ru' ? 'RU' : 'EN'}
            </button>
            <button onClick={() => setDark(!dark)} className="rounded-lg border p-1.5 dark:border-slate-700" title={t('theme')}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t py-6 text-center text-xs text-slate-500 dark:border-slate-800">
        ALL PDF · {t('footerNote')}
      </footer>
    </div>
  );
}
