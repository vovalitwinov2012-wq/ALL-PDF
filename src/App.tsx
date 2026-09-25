import { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { About } from './pages/About';

// Инструменты грузятся лениво — стартовая страница остается легкой,
// pdf-lib/pdf.js/tesseract подтягиваются только при открытии инструмента.
const ViewerPage = lazy(() => import('./pages/tools/ViewerPage').then((m) => ({ default: m.ViewerPage })));
const MergePage = lazy(() => import('./pages/tools/MergePage').then((m) => ({ default: m.MergePage })));
const SplitPage = lazy(() => import('./pages/tools/SplitPage').then((m) => ({ default: m.SplitPage })));
const CompressPage = lazy(() => import('./pages/tools/CompressPage').then((m) => ({ default: m.CompressPage })));
const Img2PdfPage = lazy(() => import('./pages/tools/Img2PdfPage').then((m) => ({ default: m.Img2PdfPage })));
const Pdf2ImgPage = lazy(() => import('./pages/tools/Pdf2ImgPage').then((m) => ({ default: m.Pdf2ImgPage })));
const Pdf2TextPage = lazy(() => import('./pages/tools/Pdf2TextPage').then((m) => ({ default: m.Pdf2TextPage })));
const OcrPage = lazy(() => import('./pages/tools/OcrPage').then((m) => ({ default: m.OcrPage })));
const EditPage = lazy(() => import('./pages/tools/EditPage').then((m) => ({ default: m.EditPage })));
const FormsPage = lazy(() => import('./pages/tools/FormsPage').then((m) => ({ default: m.FormsPage })));
const SignPage = lazy(() => import('./pages/tools/SignPage').then((m) => ({ default: m.SignPage })));
const ProtectPage = lazy(() => import('./pages/tools/ProtectPage').then((m) => ({ default: m.ProtectPage })));

function PageLoader() {
  const { t } = useTranslation();
  return <p className="py-16 text-center text-sm text-slate-500">{t('processing')}</p>;
}

const lazyEl = (el: React.ReactNode) => <Suspense fallback={<PageLoader />}>{el}</Suspense>;

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="about" element={<About />} />
          <Route path="viewer" element={lazyEl(<ViewerPage />)} />
          <Route path="merge" element={lazyEl(<MergePage />)} />
          <Route path="split" element={lazyEl(<SplitPage />)} />
          <Route path="compress" element={lazyEl(<CompressPage />)} />
          <Route path="img2pdf" element={lazyEl(<Img2PdfPage />)} />
          <Route path="pdf2img" element={lazyEl(<Pdf2ImgPage />)} />
          <Route path="pdf2text" element={lazyEl(<Pdf2TextPage />)} />
          <Route path="ocr" element={lazyEl(<OcrPage />)} />
          <Route path="edit" element={lazyEl(<EditPage />)} />
          <Route path="forms" element={lazyEl(<FormsPage />)} />
          <Route path="sign" element={lazyEl(<SignPage />)} />
          <Route path="protect" element={lazyEl(<ProtectPage />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
