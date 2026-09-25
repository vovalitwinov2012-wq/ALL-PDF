import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Eye, Combine, Scissors, Archive, ImagePlus, Images, Type, ScanText, PenLine, ClipboardList, PenTool, ShieldCheck } from 'lucide-react';

const TOOLS = [
  { to: '/viewer', icon: Eye, key: 'viewer' },
  { to: '/merge', icon: Combine, key: 'merge' },
  { to: '/split', icon: Scissors, key: 'split' },
  { to: '/compress', icon: Archive, key: 'compress' },
  { to: '/img2pdf', icon: ImagePlus, key: 'img2pdf' },
  { to: '/pdf2img', icon: Images, key: 'pdf2img' },
  { to: '/pdf2text', icon: Type, key: 'pdf2text' },
  { to: '/ocr', icon: ScanText, key: 'ocr' },
  { to: '/edit', icon: PenLine, key: 'edit' },
  { to: '/forms', icon: ClipboardList, key: 'forms' },
  { to: '/sign', icon: PenTool, key: 'sign' },
  { to: '/protect', icon: ShieldCheck, key: 'protect' }
] as const;

export function Home() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return TOOLS;
    return TOOLS.filter((tool) =>
      ((t(`tools.${tool.key}.name`) as string) + ' ' + (t(`tools.${tool.key}.desc`) as string)).toLowerCase().includes(needle)
    );
  }, [q, t]);

  return (
    <div>
      <section className="mx-auto max-w-3xl text-center">
        <h1 className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
          {t('tagline')}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-600 dark:text-slate-300">{t('subtitle')}</p>
        <div className="mx-auto mt-6 flex max-w-xl items-center gap-2 rounded-2xl border bg-white px-4 py-3 shadow-soft dark:border-slate-700 dark:bg-slate-900">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchTools') as string}
            className="w-full bg-transparent outline-none"
          />
        </div>
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.key}
              to={tool.to}
              className="group rounded-2xl border bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-soft dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                <Icon className="h-5 w-5" />
              </span>
              <p className="mt-3 font-bold">{t(`tools.${tool.key}.name`)}</p>
              <p className="mt-1 text-sm text-slate-500">{t(`tools.${tool.key}.desc`)}</p>
              <p className="mt-3 text-sm font-semibold text-indigo-600 group-hover:underline">{t('openTool')} →</p>
            </Link>
          );
        })}
      </section>

      {list.length === 0 && (
        <p className="mt-10 text-center text-sm text-slate-500">{t('nothingFound')}</p>
      )}
    </div>
  );
}
