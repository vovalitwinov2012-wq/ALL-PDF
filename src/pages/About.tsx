import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, WifiOff, HeartHandshake, ArrowRight } from 'lucide-react';

export function About() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-extrabold">{t('about.title')}</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-300">{t('about.lead')}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <HeartHandshake className="h-6 w-6 text-rose-500" />
          <p className="mt-2 font-bold">{t('about.freeTitle')}</p>
          <p className="mt-1 text-sm text-slate-500">{t('about.freeText')}</p>
        </div>
        <div className="rounded-2xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <ShieldCheck className="h-6 w-6 text-emerald-500" />
          <p className="mt-2 font-bold">{t('about.privacyTitle')}</p>
          <p className="mt-1 text-sm text-slate-500">{t('about.privacyText')}</p>
        </div>
        <div className="rounded-2xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <WifiOff className="h-6 w-6 text-indigo-500" />
          <p className="mt-2 font-bold">{t('about.offlineTitle')}</p>
          <p className="mt-1 text-sm text-slate-500">{t('about.offlineText')}</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border bg-white p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <p className="font-bold text-slate-900 dark:text-white">{t('about.limitsTitle')}</p>
        <p className="mt-1">{t('about.limitsText')}</p>
      </div>

      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700"
      >
        {t('about.cta')} <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
