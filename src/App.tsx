import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { About } from './pages/About';
import { MergePage } from './pages/tools/MergePage';
import { SplitPage } from './pages/tools/SplitPage';
import { CompressPage } from './pages/tools/CompressPage';
import { Img2PdfPage } from './pages/tools/Img2PdfPage';
import { Pdf2ImgPage } from './pages/tools/Pdf2ImgPage';
import { Pdf2TextPage } from './pages/tools/Pdf2TextPage';
import { OcrPage } from './pages/tools/OcrPage';
import { EditPage } from './pages/tools/EditPage';
import { FormsPage } from './pages/tools/FormsPage';
import { SignPage } from './pages/tools/SignPage';
import { ProtectPage } from './pages/tools/ProtectPage';
import { ViewerPage } from './pages/tools/ViewerPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="about" element={<About />} />
          <Route path="viewer" element={<ViewerPage />} />
          <Route path="merge" element={<MergePage />} />
          <Route path="split" element={<SplitPage />} />
          <Route path="compress" element={<CompressPage />} />
          <Route path="img2pdf" element={<Img2PdfPage />} />
          <Route path="pdf2img" element={<Pdf2ImgPage />} />
          <Route path="pdf2text" element={<Pdf2TextPage />} />
          <Route path="ocr" element={<OcrPage />} />
          <Route path="edit" element={<EditPage />} />
          <Route path="forms" element={<FormsPage />} />
          <Route path="sign" element={<SignPage />} />
          <Route path="protect" element={<ProtectPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
